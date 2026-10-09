// Pure logic with no browser APIs: text parsers, sorting, filtering, settings validation. Unit-tested in Node.


// ---------- small helpers ----------

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Delays calls until `ms` have passed without a new one. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------- constants ----------

/** Hard ceiling on "pages at once", so one click can never fire an unreasonable number of requests. */
export const MAX_PAGES = 30;

/** Positions of the "Reviews" slider: the value is the minimum number of reviews. */
export const REVIEW_STOPS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;


// ---------- parsing what Amazon prints on a card ----------

const SPACES = /[  ]/g;

/** "€159.99", "159,99 €", "$1,299.00", "1.299,00 €", "¥1,980", "1 299,00 €" -> number */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(SPACES, " ").match(/\d(?:[\d.,' ]*\d)?/);
  if (!match) return null;
  const digits = match[0].replace(/[\s']/g, "");
  const sep = Math.max(digits.lastIndexOf("."), digits.lastIndexOf(","));
  let n: number;
  if (sep !== -1 && digits.length - sep - 1 <= 2) {
    // 1-2 digits after the last separator: it's the decimal point
    n = parseFloat(digits.slice(0, sep).replace(/[.,]/g, "") + "." + digits.slice(sep + 1));
  } else {
    n = parseFloat(digits.replace(/[.,]/g, ""));
  }
  return Number.isFinite(n) ? n : null;
}

/** "4.6 out of 5 stars", "4,6 von 5 Sternen", "5つ星のうち4.5" -> 4.6 / 4.6 / 4.5 */
export function parseRating(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => parseFloat(x.replace(",", ".")));
  const first = nums[0];
  if (first === undefined) return null;
  const second = nums[1];
  // Japanese puts the scale first: "5つ星のうち4.5"
  const n = second !== undefined && first === 5 && second < 5 ? second : first;
  return n >= 0 && n <= 5 ? n : null;
}

/** "484", "(1.3K)", "1,3 Tsd.", "12K+", "1,234 ratings", "2 Mio." -> number */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  // number (allowing "1 234" grouping), then an optional unit word like K / Tsd / Mio
  const match = text.replace(SPACES, " ").match(/(\d[\d.,]*(?:\s\d{3}(?!\d))*)\s*([A-Za-z一-鿿]+)?/);
  const num = match?.[1];
  if (!num) return null;
  const suffix = (match[2] ?? "").toLowerCase();

  let multiplier = 0;
  if (/^(k|tsd|tys|mil|mille|千)$/.test(suffix)) multiplier = 1e3;
  else if (/^(mio|mln|m)$/.test(suffix)) multiplier = 1e6;
  else if (suffix === "万") multiplier = 1e4;

  if (multiplier) {
    const n = parseFloat(num.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * multiplier) : null;
  }
  const n = parseInt(num.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------- sorting ----------

export const SORT_MODES = ["featured", "best", "price_asc", "price_desc", "rating", "reviews"] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const SORT_LABELS: Record<SortMode, string> = {
  featured: "Featured (Amazon order)",
  best: "Best rated (weighted)",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Rating",
  reviews: "Most reviews",
};

export const isSortMode = (value: unknown): value is SortMode => SORT_MODES.includes(value as SortMode);

/** What a sort needs to know about an item. `seq` is its original position, used as the tiebreaker. */
export interface Sortable {
  price: number | null;
  rating: number | null;
  reviews: number | null;
  seq: number;
}

/** Bayesian-weighted rating: a 5.0 from 3 reviews shouldn't beat a 4.7 from 3,000. */
export function bestScore(rating: number | null, reviews: number | null): number {
  if (rating === null) return -1;
  const priorWeight = 30;
  const priorMean = 4.2;
  const votes = reviews ?? 0;
  return (votes / (votes + priorWeight)) * rating + (priorWeight / (votes + priorWeight)) * priorMean;
}

/** dir 1 = ascending, -1 = descending; missing values always sort last. */
function nullLast(x: number | null, y: number | null, dir: 1 | -1): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return (x - y) * dir;
}

type Comparator = (a: Sortable, b: Sortable) => number;

const COMPARATORS: Record<Exclude<SortMode, "featured">, Comparator> = {
  price_asc: (a, b) => nullLast(a.price, b.price, 1),
  price_desc: (a, b) => nullLast(a.price, b.price, -1),
  rating: (a, b) => nullLast(a.rating, b.rating, -1) || nullLast(a.reviews, b.reviews, -1),
  reviews: (a, b) => nullLast(a.reviews, b.reviews, -1),
  best: (a, b) => bestScore(b.rating, b.reviews) - bestScore(a.rating, a.reviews),
};

/** Returns a sorted copy. "featured" keeps the original order. */
export function sortItems<T extends Sortable>(items: readonly T[], mode: SortMode): T[] {
  const compare = mode === "featured" ? undefined : COMPARATORS[mode];
  return items.slice().sort((a, b) => (compare ? compare(a, b) : 0) || a.seq - b.seq);
}

// ---------- result items, filters, settings ----------

/** Toolbar settings that persist between searches. */
export interface Settings {
  /** How many result pages to show together, counting from the current one. */
  pages: number;
  /** Minimum star rating; 0 means any. */
  rating: number;
  /** Index into REVIEW_STOPS. */
  reviewsIdx: number;
  sort: SortMode;
  hideSponsored: boolean;
}

/** One product card from a results page. */
export interface ResultItem extends Sortable {
  asin: string;
  /** The element in the results grid that wraps the card; this is what we hide and move. */
  top: HTMLElement;
  /** Which results page it came from. */
  page: number;
  sponsored: boolean;
}

/** An item as read from the DOM, before the session gives it a position. */
export type NewItem = Omit<ResultItem, "seq">;

export interface Filters {
  /** Minimum rating, 0 = any. */
  rating: number;
  /** Minimum review count, 0 = any. */
  reviews: number;
  pmin: number | null;
  pmax: number | null;
}

export interface PriceRange {
  min: number;
  max: number;
}

/** What the filters need to know that isn't in the Filters themselves. */
export interface FilterContext {
  /** Items from pages after this one aren't being shown. */
  lastShownPage: number;
  hideSponsored: boolean;
}

export function matchesFilters(item: ResultItem, filters: Filters, ctx: FilterContext): boolean {
  if (item.page > ctx.lastShownPage) return false;
  if (ctx.hideSponsored && item.sponsored) return false;
  if (filters.rating > 0 && (item.rating === null || item.rating < filters.rating)) return false;
  if (filters.reviews > 0 && (item.reviews === null || item.reviews < filters.reviews)) return false;
  if (filters.pmin !== null && (item.price === null || item.price < filters.pmin)) return false;
  if (filters.pmax !== null && (item.price === null || item.price > filters.pmax)) return false;
  return true;
}

/**
 * Lowest and highest price still on offer with every filter applied except price itself,
 * so the Price box's hint follows the results without collapsing once you type a price.
 */
export function availablePriceRange(items: readonly ResultItem[], filters: Filters, ctx: FilterContext): PriceRange | null {
  const ignoringPrice: Filters = { ...filters, pmin: null, pmax: null };
  const prices = items.filter((item) => matchesFilters(item, ignoringPrice, ctx)).flatMap((item) => (item.price === null ? [] : [item.price]));
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

const byPageThenPosition = (a: ResultItem, b: ResultItem): number => a.page - b.page || a.seq - b.seq;

/**
 * The order the cards should appear in: visible ones first (Amazon's order for "featured", otherwise
 * by the chosen sort), then hidden ones, so nothing ever leaves the page.
 */
export function arrangeItems(all: readonly ResultItem[], visible: readonly ResultItem[], mode: SortMode): ResultItem[] {
  const shown = mode === "featured" ? visible.slice().sort(byPageThenPosition) : sortItems(visible, mode);
  const visibleSet = new Set(visible);
  const hidden = all.filter((item) => !visibleSet.has(item)).sort(byPageThenPosition);
  return [...shown, ...hidden];
}

/** Amazon's own order: by page, then by position within what we've loaded. */
export const inAmazonOrder = (items: readonly ResultItem[]): ResultItem[] => items.slice().sort(byPageThenPosition);

export const DEFAULT_SETTINGS: Settings = { pages: 5, rating: 0, reviewsIdx: 0, sort: "featured", hideSponsored: false };

/** Turns whatever was stored (possibly from an older version, possibly garbage) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const stored: Record<string, unknown> = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  return {
    pages: clamp(parseInt(String(merged.pages), 10) || 1, 1, MAX_PAGES),
    rating: clamp(parseFloat(String(merged.rating)) || 0, 0, 5),
    reviewsIdx: clamp(parseInt(String(merged.reviewsIdx), 10) || 0, 0, REVIEW_STOPS.length - 1),
    sort: isSortMode(merged.sort) ? merged.sort : DEFAULT_SETTINGS.sort,
    hideSponsored: merged.hideSponsored === true,
  };
}
