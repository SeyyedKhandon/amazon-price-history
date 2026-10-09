// The search-results content script: reads Amazon's result cards, loads more result pages, and drives
// the toolbar (filters, sorting, card order). Product pages are handled by content.ts.
import { getFlag, onFlagChange } from "./flags.ts";
import {
  DEFAULT_SETTINGS, MAX_PAGES, REVIEW_STOPS, arrangeItems, availablePriceRange, clamp, debounce, inAmazonOrder, matchesFilters,
  parseCount, parsePrice, parseRating, sanitizeSettings, sleep,
  type Filters, type NewItem, type ResultItem, type Settings,
} from "./lib.ts";
import { isSearchPath } from "./sites.ts";
import { Toolbar } from "./toolbar.ts";

const CARD_SELECTOR = 'div[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';
const HIDDEN_ATTR = "data-atb-hidden"; // marks cards the filters hide (see search.css)
const CONCURRENCY = 2; // result pages requested at once
const REQUEST_DELAY_MS = [500, 1100] as const; // random wait before each request, so we never burst Amazon
const SIDEBAR_MIN_WIDTH = 120; // narrower than this and Amazon has collapsed its left column
const SIDEBAR_WAIT_MS = 2500; // how long to wait for the left column before using the top bar instead
const STORAGE_KEY = "atbSettings";

// ---------- reading product cards ----------

function readCard(card: Element): Pick<NewItem, "price" | "rating" | "reviews" | "sponsored"> {
  const price = card.querySelector(".a-price:not(.a-text-price) .a-offscreen") ?? card.querySelector(".a-price .a-offscreen");
  const rating = card.querySelector(".a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt, [class*='a-icon-star'] .a-icon-alt");
  return {
    price: parsePrice(price?.textContent),
    rating: parseRating(rating?.textContent),
    reviews: readReviewCount(card),
    sponsored:
      card.querySelector(".puis-sponsored-label-text, .s-sponsored-label-text, .s-sponsored-label-info-icon, [aria-label*='ponsored']") !== null ||
      card.classList.contains("AdHolder"),
  };
}

/** Looks for the review count in the places Amazon has put it, most reliable first. */
function readReviewCount(card: Element): number | null {
  const link = card.querySelector('a[href*="customerReviews"]');
  const candidates = [
    link?.querySelector(".s-underline-text")?.textContent,
    link?.getAttribute("aria-label"),
    card.querySelector('[data-csa-c-content-id="alf-customer-ratings-count-component"]')?.textContent,
    // last resort: any small underlined span that looks like "(1.3K)" or "1,234"
    ...[...card.querySelectorAll("span.s-underline-text")].map((el) => el.textContent).filter((t) => /^\s*\(?[\d.,\s]+\s*[A-Za-z一-鿿]{0,4}\.?\+?\)?\s*$/.test(t ?? "")),
  ];
  for (const text of candidates) {
    const n = parseCount(text);
    if (n !== null) return n;
  }
  return null;
}

/** The element that holds the product grid, in the live page or a parsed copy of one. */
const findContainer = (root: ParentNode) => {
  const first = root.querySelector(CARD_SELECTOR);
  return first ? (first.closest(".s-main-slot") ?? first.parentElement) : null;
};

/** Reads every standalone product card. Carousels holding several products are left alone. */
function readItems(root: ParentNode, container: Element, page: number): NewItem[] {
  const items: NewItem[] = [];
  const seen = new Set<Element>();
  for (const card of root.querySelectorAll(CARD_SELECTOR)) {
    let top: Element = card; // the direct child of the grid that wraps this card: what we hide and move
    while (top.parentElement && top.parentElement !== container) top = top.parentElement;
    const asin = card.getAttribute("data-asin");
    if (top.parentElement !== container || !asin || seen.has(top)) continue;
    seen.add(top);
    if (top.querySelectorAll(CARD_SELECTOR).length > 1) continue;
    items.push({ asin, top: top as HTMLElement, page, ...readCard(card) });
  }
  return items;
}

/** Puts the cards in `ordered` order right after `marker`, moving only what's out of place so
 *  widgets Amazon put between cards stay where they were. */
function placeInOrder(marker: Node, ordered: readonly ResultItem[]): void {
  let previous: Node = marker;
  for (const { top } of ordered) {
    const inPlace = top.isConnected && previous.isConnected && previous.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (!inPlace) (previous as ChildNode).after(top);
    previous = top;
  }
}

// ---------- one search page's state ----------

interface Session {
  href: string;
  firstPage: number; // the page this tab shows; the pages we merge start here
  lastPage: number | null; // the real last page, learned when Amazon stops returning new results
  pageHint: number | null; // the highest page in Amazon's pagination strip; it can under-report
  currency: string;
  container: Element; // the grid all cards live in
  marker: Comment; // sits just before the first card; everything we reorder goes after it
  items: ResultItem[];
  asins: Set<string>;
  done: Set<number>; // pages merged in, including this tab's own
  failed: Map<number, string>;
  inflight: Set<number>;
  abort: AbortController; // aborted when the session ends, which also cancels running requests
  nextSeq: number; // keeps a stable order across pages that arrive out of order
  error: string | null; // set when Amazon blocks us; loading then stops for good
}

/** Starts a session on the page we're on, or returns null if there's no product grid (yet). */
function openSession(href: string): Session | null {
  const container = findContainer(document);
  const firstPage = clamp(parseInt(new URL(href).searchParams.get("page") ?? "", 10) || 1, 1, 1000);
  const found = container ? readItems(document, container, firstPage) : [];
  if (!container || !found[0]) return null;

  const items = found.map((item, seq) => ({ ...item, seq }));
  const marker = document.createComment("atb");
  found[0].top.before(marker);

  const symbol = (container.querySelector(".a-price .a-offscreen")?.textContent ?? "").replace(/[\d.,\s  ']/g, "");
  const pagination = [...document.querySelectorAll(".s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous)")];

  return {
    href,
    firstPage,
    lastPage: null,
    pageHint: Math.max(0, ...pagination.map((el) => parseInt(el.textContent ?? "", 10) || 0)) || null,
    currency: symbol.length <= 4 ? symbol : "",
    container,
    marker,
    items,
    asins: new Set(items.map((item) => item.asin)),
    done: new Set([firstPage]),
    failed: new Map(),
    inflight: new Set(),
    abort: new AbortController(),
    nextSeq: items.length,
    error: null,
  };
}

/** How many pages exist counting from the first: what we learned by fetching, else Amazon's hint, else the cap. */
function pagesAvailable(s: Session): number {
  const last = s.lastPage ?? s.pageHint;
  return last ? clamp(last - s.firstPage + 1, 1, MAX_PAGES) : MAX_PAGES;
}

// ---------- loading more pages ----------

/** Amazon is pushing back (CAPTCHA, rate limit). Loading stops entirely; retrying would only make it worse. */
class BlockedError extends Error {}

/** Fetches one results page from the same Amazon site, using the user's own session. */
async function fetchResultPage(s: Session, page: number): Promise<NewItem[]> {
  const [min, max] = REQUEST_DELAY_MS;
  await sleep(min + Math.random() * (max - min)); // human-ish pace

  const url = new URL(s.href);
  url.searchParams.set("page", String(page));
  const response = await fetch(url, { credentials: "same-origin", signal: s.abort.signal });

  if (response.status === 404) return []; // past the last page
  if (response.status === 429 || response.status === 503) throw new BlockedError("Amazon is asking us to slow down.");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // Parsed in an inert document: its scripts never run, we only read the product cards.
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  if (doc.querySelector('form[action*="validateCaptcha"]')) throw new BlockedError("Amazon wants you to solve a CAPTCHA before more pages can load.");

  const container = findContainer(doc);
  return container ? readItems(doc, container, page).map((item) => ({ ...item, top: document.importNode(item.top, true) })) : [];
}

// ---------- saved settings ----------

async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS });
    return sanitizeSettings(stored[STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const saveSettings = debounce((settings: Settings) => {
  chrome.storage.local.set({ [STORAGE_KEY]: settings }).catch(() => {}); // not remembering is better than breaking
}, 300);

// ---------- controller ----------

class SearchController {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private fetchPages: number = DEFAULT_SETTINGS.pages; // the page count the loader aims for; follows the slider after a pause
  private session: Session | null = null;
  private toolbar: Toolbar | null = null;
  private watcher: MutationObserver | null = null;
  private sidebarWaitUntil = 0;
  private enabled = true;

  async start(): Promise<void> {
    this.settings = await loadSettings();
    this.fetchPages = this.settings.pages;
    if (await getFlag("showSearchToolbar")) this.turnOn();
    onFlagChange("showSearchToolbar", (on) => (on ? this.turnOn() : this.turnOff()));
  }

  private turnOn(): void {
    this.enabled = true;
    this.sidebarWaitUntil = Date.now() + SIDEBAR_WAIT_MS;
    this.mount();
    if (!this.watcher) {
      this.watcher = new MutationObserver(this.checkPage);
      this.watcher.observe(document.body, { childList: true, subtree: true });
    }
  }

  /** Removes the panel and any extra cards, restores Amazon's order, cancels fetches, stops watching. */
  private turnOff(): void {
    this.enabled = false;
    this.watcher?.disconnect();
    this.watcher = null;
    this.teardown();
  }

  /** Amazon sometimes swaps results in place, and the grid may render a moment after load. */
  private readonly checkPage = debounce(() => {
    if (!this.enabled) return;
    const { session, toolbar } = this;
    if (session && toolbar) {
      if (location.href !== session.href || !session.container.isConnected) {
        this.teardown(); // a different search, or the results were replaced: start over
        this.sidebarWaitUntil = Date.now() + SIDEBAR_WAIT_MS;
      } else if (!toolbar.host.isConnected) {
        // Only our panel got dropped (Amazon re-rendered its filters): put it back, keep everything loaded.
        const sidebar = this.findSidebar();
        if (sidebar || !toolbar.side) this.placeHost(toolbar, sidebar);
      } else if (!toolbar.side && this.findSidebar()) {
        this.teardown(); // we fell back to the top bar but the left column is available now
      }
    }
    if (!this.session) this.mount();
  }, 400);

  private findSidebar(): HTMLElement | null {
    const sidebar = document.getElementById("s-refinements");
    return sidebar && sidebar.offsetWidth > SIDEBAR_MIN_WIDTH ? sidebar : null;
  }

  private placeHost(toolbar: Toolbar, sidebar: HTMLElement | null): void {
    if (sidebar) return sidebar.prepend(toolbar.host);
    const anchor =
      document.querySelector('[data-component-type="s-result-info-bar"]') ??
      document.querySelector(".s-desktop-toolbar") ??
      document.getElementById("search") ??
      this.session?.container;
    anchor?.before(toolbar.host);
  }

  private mount(): void {
    // Preferred home: top of Amazon's left filter column, above "Delivery". It can be missing for a
    // moment while Amazon re-renders, so wait a little before settling for the bar above the results
    // (which is also where narrow layouts, where the column is hidden, end up).
    const sidebar = this.findSidebar();
    if (!sidebar && Date.now() < this.sidebarWaitUntil) {
      setTimeout(() => this.enabled && !this.session && this.mount(), 250);
      return;
    }
    const session = openSession(location.href);
    if (!session) return;

    this.session = session;
    this.toolbar = new Toolbar(sidebar !== null, { changed: () => this.onChanged(), reset: () => this.onReset() });
    this.placeHost(this.toolbar, sidebar);
    this.pump();
  }

  private teardown(): void {
    const { session, toolbar } = this;
    if (!session) return;
    session.abort.abort();
    toolbar?.dispose();
    for (const item of session.items) {
      item.top.removeAttribute(HIDDEN_ATTR);
      if (item.page !== session.firstPage) item.top.remove(); // cards we fetched
    }
    placeInOrder(session.marker, inAmazonOrder(session.items.filter((item) => item.page === session.firstPage)));
    session.marker.remove();
    this.session = this.toolbar = null;
  }

  // ---- the user's input

  private onChanged(): void {
    if (!this.toolbar) return;
    const { pmin: _min, pmax: _max, ...next } = this.toolbar.values();
    const pagesChanged = next.pages !== this.settings.pages;
    this.settings = next;
    saveSettings(next);
    this.apply();
    if (pagesChanged) this.loadPagesAfterPause();
  }

  /** The label and the cards follow the slider at once; requests wait until it stops moving. */
  private readonly loadPagesAfterPause = debounce(() => {
    this.fetchPages = this.settings.pages;
    if (this.session && !this.session.error) this.session.failed.clear(); // asking for pages again doubles as "retry"
    this.pump();
  }, 350);

  private onReset(): void {
    this.settings = { ...this.settings, rating: 0, reviewsIdx: 0, sort: "featured", hideSponsored: false };
    this.toolbar?.clearPrice();
    saveSettings(this.settings);
    this.apply();
  }

  // ---- loading

  /** Starts as many page requests as allowed, then redraws. Safe to call any time. */
  private pump(): void {
    const s = this.session;
    if (!s) return;
    while (s.inflight.size < CONCURRENCY && !s.error && !s.abort.signal.aborted) {
      const last = Math.min(s.firstPage + Math.min(this.fetchPages, pagesAvailable(s)) - 1, s.lastPage ?? Infinity);
      let page = s.firstPage + 1;
      while (page <= last && (s.done.has(page) || s.inflight.has(page) || s.failed.has(page))) page++;
      if (page > last) break;
      s.inflight.add(page);
      void this.load(s, page);
    }
    this.apply();
  }

  private async load(s: Session, page: number): Promise<void> {
    try {
      const found = await fetchResultPage(s, page);
      if (s.abort.signal.aborted) return;
      s.done.add(page);
      let added = 0;
      for (const item of found) {
        if (s.asins.has(item.asin)) continue;
        s.asins.add(item.asin);
        s.items.push({ ...item, seq: s.nextSeq++ });
        added++;
      }
      // Amazon repeats the last page for out-of-range numbers; nothing new means we hit the end.
      if (added === 0) s.lastPage = Math.min(s.lastPage ?? Infinity, page - 1);
    } catch (error) {
      if (s.abort.signal.aborted) return;
      s.failed.set(page, error instanceof Error ? error.message : String(error));
      if (error instanceof BlockedError) s.error = error.message;
    } finally {
      if (!s.abort.signal.aborted) {
        s.inflight.delete(page);
        this.pump();
      }
    }
  }

  // ---- drawing

  /** Hides what the filters exclude, orders the rest, and redraws the panel. */
  private apply(): void {
    const { session: s, toolbar, settings } = this;
    if (!s || !toolbar) return;

    const filters: Filters = { rating: settings.rating, reviews: REVIEW_STOPS[settings.reviewsIdx] ?? 0, ...toolbar.priceBounds() };
    const pages = Math.min(settings.pages, pagesAvailable(s));
    const shownTo = s.firstPage + pages - 1; // the last page being shown
    const ctx = { lastShownPage: shownTo, hideSponsored: settings.hideSponsored };

    const inRange = s.items.filter((item) => item.page <= shownTo);
    const visible = s.items.filter((item) => {
      const show = matchesFilters(item, filters, ctx);
      item.top.toggleAttribute(HIDDEN_ATTR, !show);
      return show;
    });
    placeInOrder(s.marker, arrangeItems(s.items, visible, settings.sort));

    // progress: extra pages beyond the one Amazon gave us
    const lastWanted = Math.min(shownTo, s.lastPage ?? Infinity);
    const wanted = Math.max(0, lastWanted - s.firstPage);
    let loaded = 0;
    for (let page = s.firstPage + 1; page <= lastWanted; page++) if (s.done.has(page)) loaded++;
    const failed = [...s.failed].filter(([page]) => page <= lastWanted);

    toolbar.render({
      settings,
      pagesLimit: pagesAvailable(s),
      totalPages: s.lastPage ?? s.pageHint,
      currency: s.currency,
      priceRange: availablePriceRange(inRange, filters, ctx),
      shown: visible.length,
      loaded: inRange.length,
      progress: s.inflight.size > 0 && wanted > 0 ? loaded / wanted : null,
      message: s.error
        ? { text: s.error, reload: true }
        : failed.length
          ? { text: `Could not load page${failed.length > 1 ? "s" : ""} ${failed.map(([page]) => page).join(", ")} (${failed[0]?.[1]}).` }
          : null,
    });
  }
}

if (isSearchPath(location.pathname)) void new SearchController().start();
