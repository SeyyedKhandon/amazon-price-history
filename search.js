// Search-results toolbar: load several result pages at once, then filter and sort them.
// Runs on Amazon search pages only (see manifest). Product-page buttons live in content.js.
(() => {
  "use strict";

  const path = location.pathname;
  if (!(path === "/s" || path.startsWith("/s/") || path.startsWith("/gp/search"))) return;

  const CARD_SEL = 'div[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';
  const MAX_PAGES = 30;
  const CONCURRENCY = 2; // pages in flight at once
  const DELAY_MS = [500, 1100]; // random wait before each request, so we never burst
  const REVIEW_STOPS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const DEFAULTS = { pages: 5, rating: 0, reviewsIdx: 0, sort: "featured", hideSponsored: false };
  const SORT_LABELS = [
    ["featured", "Featured (Amazon order)"],
    ["best", "Best rated (weighted)"],
    ["price_asc", "Price: low to high"],
    ["price_desc", "Price: high to low"],
    ["rating", "Rating"],
    ["reviews", "Most reviews"],
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  // ---------- reading product cards ----------

  function readCard(card) {
    const priceEl = card.querySelector(".a-price:not(.a-text-price) .a-offscreen") || card.querySelector(".a-price .a-offscreen");
    const price = ATB.parsePrice(priceEl && priceEl.textContent);

    const ratingEl = card.querySelector(".a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt, [class*='a-icon-star'] .a-icon-alt");
    const rating = ATB.parseRating(ratingEl && ratingEl.textContent);

    return { price, rating, reviews: readReviewCount(card), sponsored: isSponsored(card) };
  }

  function readReviewCount(card) {
    const link = card.querySelector('a[href*="customerReviews"]');
    const candidates = [];
    if (link) {
      const t = link.querySelector(".s-underline-text");
      if (t) candidates.push(t.textContent);
      if (link.getAttribute("aria-label")) candidates.push(link.getAttribute("aria-label"));
    }
    const ratingsCount = card.querySelector('[data-csa-c-content-id="alf-customer-ratings-count-component"]');
    if (ratingsCount) candidates.push(ratingsCount.textContent);
    for (const el of card.querySelectorAll("span.s-underline-text")) {
      if (/^\s*\(?[\d.,\s]+\s*[A-Za-z一-鿿]{0,4}\.?\+?\)?\s*$/.test(el.textContent)) candidates.push(el.textContent);
    }
    for (const text of candidates) {
      const n = ATB.parseCount(text);
      if (n != null) return n;
    }
    return null;
  }

  function isSponsored(card) {
    return !!card.querySelector(".puis-sponsored-label-text, .s-sponsored-label-text, .s-sponsored-label-info-icon, [aria-label*='ponsored']") ||
      card.classList.contains("AdHolder");
  }

  // The direct child of the results container that wraps this card.
  function topChild(card, container) {
    let n = card;
    while (n.parentElement && n.parentElement !== container) n = n.parentElement;
    return n.parentElement === container ? n : null;
  }

  function findContainer(root) {
    const first = root.querySelector(CARD_SEL);
    return first ? first.closest(".s-main-slot") || first.parentElement : null;
  }

  // Cards that are the only product inside their wrapper (carousels with many products are left alone).
  function extractItems(root, container, page) {
    const out = [];
    const seenTops = new Set();
    for (const card of root.querySelectorAll(CARD_SEL)) {
      const top = topChild(card, container);
      if (!top || seenTops.has(top)) continue;
      seenTops.add(top);
      if (top.querySelectorAll(CARD_SEL).length > 1) continue;
      out.push({ asin: card.getAttribute("data-asin"), top, page, ...readCard(card) });
    }
    return out;
  }

  // "€159.99" -> "€", "159,99 €" -> "€"
  function currencyOf(container) {
    const e = container.querySelector(".a-price .a-offscreen");
    const sym = e ? e.textContent.replace(/[\d.,\s\u00a0\u202f']/g, "") : "";
    return sym.length <= 4 ? sym : "";
  }

  // ---------- state ----------

  let st = null; // per-search-page runtime state
  let enabled = true; // popup switch: chrome.storage.sync showSearchToolbar
  let settings = { ...DEFAULTS };

  function createState() {
    const firstPage = clamp(parseInt(new URL(location.href).searchParams.get("page"), 10) || 1, 1, 1000);
    const container = findContainer(document);
    if (!container) return null;

    const items = extractItems(document, container, firstPage);
    if (!items.length) return null;
    items.forEach((it, i) => (it.seq = i));

    const marker = document.createComment("atb");
    items[0].top.before(marker);

    // Amazon's pagination strip shows the highest page number; used only to size the slider.
    let pageHint = null;
    for (const e of document.querySelectorAll(".s-pagination-item:not(.s-pagination-next):not(.s-pagination-previous)")) {
      const n = parseInt(e.textContent, 10);
      if (n > (pageHint || 0)) pageHint = n;
    }

    return {
      href: location.href,
      firstPage,
      lastPage: null, // learned when Amazon stops returning new results
      pageHint,
      currency: currencyOf(container),
      container,
      marker,
      items,
      asins: new Set(items.map((i) => i.asin)),
      done: new Set([firstPage]),
      failed: new Map(),
      inflight: new Set(),
      abort: new AbortController(),
      seq: items.length,
      host: null,
      ui: null,
      error: null,
      price: { min: null, max: null },
    };
  }

  // ---------- fetching more pages ----------

  async function fetchPage(p) {
    await sleep(DELAY_MS[0] + Math.random() * (DELAY_MS[1] - DELAY_MS[0])); // human-ish pace
    const url = new URL(st.href);
    url.searchParams.set("page", String(p));
    const res = await fetch(url, { credentials: "same-origin", signal: st.abort.signal });
    if (res.status === 404) return []; // past the last page
    if (res.status === 429 || res.status === 503) {
      const e = new Error("Amazon is asking us to slow down.");
      e.blocked = true;
      throw e;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    if (doc.querySelector('form[action*="validateCaptcha"]')) {
      const e = new Error("Amazon wants you to solve a CAPTCHA before more pages can load.");
      e.blocked = true;
      throw e;
    }
    const container = findContainer(doc);
    if (!container) return [];
    return extractItems(doc, container, p).map((it) => ({ ...it, top: document.importNode(it.top, true) }));
  }

  function pump() {
    if (!st) return;
    const cur = st;
    while (cur.inflight.size < CONCURRENCY && !cur.error) {
      const last = Math.min(cur.firstPage + effPages(cur) - 1, cur.lastPage || Infinity);
      let p = null;
      for (let q = cur.firstPage + 1; q <= last; q++) {
        if (!cur.done.has(q) && !cur.inflight.has(q) && !cur.failed.has(q)) {
          p = q;
          break;
        }
      }
      if (p === null) break;
      cur.inflight.add(p);
      fetchPage(p)
        .then((fresh) => {
          if (st !== cur) return;
          cur.done.add(p);
          let added = 0;
          for (const it of fresh) {
            if (cur.asins.has(it.asin)) continue;
            cur.asins.add(it.asin);
            it.seq = cur.seq++;
            cur.items.push(it);
            added++;
          }
          // Amazon repeats the last page for out-of-range numbers; nothing new means we hit the end.
          if (!added) cur.lastPage = Math.min(cur.lastPage || Infinity, p - 1);
          updatePagesMax();
          apply(); // price range, counts and order reflect the new page immediately
        })
        .catch((e) => {
          if (st !== cur || e.name === "AbortError") return;
          cur.failed.set(p, e.message);
          if (e.blocked) cur.error = { text: e.message }; // stop fetching entirely; retrying only makes it worse
        })
        .finally(() => {
          if (st !== cur) return;
          cur.inflight.delete(p);
          apply();
          pump();
        });
    }
    renderStatus();
  }

  // ---------- filter / sort / layout ----------

  function passes(it, f) {
    if (it.page > st.firstPage + effPages(st) - 1) return false;
    if (settings.hideSponsored && it.sponsored) return false;
    if (f.rating > 0 && (it.rating == null || it.rating < f.rating)) return false;
    if (f.reviews > 0 && (it.reviews == null || it.reviews < f.reviews)) return false;
    if (f.pmin != null && (it.price == null || it.price < f.pmin)) return false;
    if (f.pmax != null && (it.price == null || it.price > f.pmax)) return false;
    return true;
  }

  function readFilters() {
    const num = (el) => (el.value.trim() === "" ? null : parseFloat(el.value.replace(",", ".")));
    const { ui } = st;
    return {
      rating: settings.rating,
      reviews: REVIEW_STOPS[settings.reviewsIdx],
      pmin: num(ui.pmin),
      pmax: num(ui.pmax),
    };
  }

  function apply() {
    if (!st) return;
    const f = readFilters();
    const inRange = st.items.filter((it) => it.page <= st.firstPage + effPages(st) - 1);
    const visible = [];
    for (const it of st.items) {
      const ok = passes(it, f);
      it.top.toggleAttribute("data-atb-hidden", !ok);
      if (ok) visible.push(it);
    }

    const hidden = st.items.filter((it) => !visible.includes(it));
    // Page-ordered for Featured, otherwise by the chosen key. Hidden items trail so they never leave the DOM.
    const base = settings.sort === "featured" ? (a, b) => a.page - b.page || a.seq - b.seq : null;
    const ordered = (base ? visible.slice().sort(base) : ATB.sortItems(visible, settings.sort)).concat(hidden.sort((a, b) => a.page - b.page || a.seq - b.seq));
    layout(ordered);

    // Range of prices still on offer with every filter except price itself applied, so the hint follows the results.
    const ignoringPrice = { ...f, pmin: null, pmax: null };
    const prices = inRange.filter((i) => passes(i, ignoringPrice)).map((i) => i.price).filter((p) => p != null);
    st.price.min = prices.length ? Math.min(...prices) : null;
    st.price.max = prices.length ? Math.max(...prices) : null;
    st.ui.pmin.placeholder = st.price.min != null ? String(Math.floor(st.price.min)) : "min";
    st.ui.pmax.placeholder = st.price.max != null ? String(Math.ceil(st.price.max)) : "max";
    st.ui.price.title = st.price.min != null ? `Prices in these results: ${st.currency}${Math.floor(st.price.min)} – ${st.currency}${Math.ceil(st.price.max)}` : "";
    st.ui.count.innerHTML = `${visible.length} <small>of ${inRange.length} results</small>`;
    renderStatus();
  }

  // Move only the nodes that are out of order, so widgets between cards stay where they were.
  function layout(ordered) {
    let prev = st.marker;
    for (const it of ordered) {
      const n = it.top;
      const inPlace = n.isConnected && prev.isConnected && prev.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (!inPlace) prev.after(n);
      prev = n;
    }
  }

  // ---------- toolbar ----------

  const TOOLBAR_CSS = `
    :host { display:block; width:100%; flex:0 0 100%; position:sticky; top:0; z-index:10;
      --accent:#e47911; --ink:#0f1111; --muted:#6b7280; --line:#d5d9d9; --track:#e3e6e6; }
    * { box-sizing:border-box; }
    .bar { display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px 24px; padding:10px 18px 12px; background:#fff;
      border-bottom:1px solid var(--line); box-shadow:0 2px 6px rgba(15,17,17,.1);
      font:13px/1.2 "Amazon Ember",system-ui,-apple-system,Arial,sans-serif; color:var(--ink); }
    .head { align-self:center; display:flex; align-items:center; gap:12px; }
    .brand { font-weight:700; font-size:15px; color:#232f3e; white-space:nowrap; }
    .brand b { color:var(--accent); }
    .field { display:flex; flex-direction:column; gap:6px; }
    .lab { display:flex; justify-content:space-between; align-items:baseline; gap:10px;
      font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); }
    output { font-size:12px; font-weight:700; letter-spacing:0; text-transform:none; color:var(--ink); font-variant-numeric:tabular-nums; }

    /* sliders */
    input[type=range] { -webkit-appearance:none; appearance:none; width:140px; height:32px; margin:0; background:transparent; cursor:pointer; outline:none; }
    input[type=range]::-webkit-slider-runnable-track { height:6px; border-radius:99px;
      background:linear-gradient(to right,var(--accent) var(--p,0%),var(--track) var(--p,0%)); }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; box-sizing:border-box; width:18px; height:18px; margin-top:-6px;
      border-radius:50%; background:#fff; border:2px solid var(--accent); box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .12s, box-shadow .12s; }
    input[type=range]:hover::-webkit-slider-thumb { transform:scale(1.12); }
    input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 4px rgba(228,121,17,.28); }

    /* pill controls */
    .pill { display:flex; align-items:center; height:32px; padding:0 12px; gap:6px; background:#fff;
      border:1px solid var(--line); border-radius:99px; transition:border-color .12s, box-shadow .12s; }
    .pill:hover { border-color:#b7bcbc; }
    .pill:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px rgba(228,121,17,.2); }
    .pill input { width:58px; padding:0; border:0; outline:0; background:transparent; font:inherit; font-weight:600; color:var(--ink); text-align:center; -moz-appearance:textfield; }
    .pill input::placeholder { color:#9aa0a6; font-weight:400; }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
    .pill .cur, .pill .dash { color:var(--muted); font-weight:600; }
    .pill .sep { width:1px; height:16px; background:var(--line); }


    select { -webkit-appearance:none; appearance:none; height:32px; padding:0 32px 0 14px; border:1px solid var(--line); border-radius:99px;
      background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center;
      font:inherit; font-weight:600; color:var(--ink); cursor:pointer; outline:none; transition:border-color .12s, box-shadow .12s; }
    select:hover { border-color:#b7bcbc; }
    select:focus-visible { border-color:var(--accent); box-shadow:0 0 0 3px rgba(228,121,17,.2); }

    /* toggle */
    .switch { display:flex; align-items:center; gap:8px; height:32px; cursor:pointer; user-select:none; font-weight:600; }
    .switch input { position:absolute; opacity:0; pointer-events:none; }
    .switch i { position:relative; width:34px; height:20px; border-radius:99px; background:#c4c9c9; transition:background .15s; flex:none; }
    .switch i::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff;
      box-shadow:0 1px 2px rgba(0,0,0,.3); transition:transform .15s; }
    .switch input:checked + i { background:var(--accent); }
    .switch input:checked + i::after { transform:translateX(14px); }
    .switch input:focus-visible + i { box-shadow:0 0 0 3px rgba(228,121,17,.28); }

    .reset { height:32px; padding:0 12px; border:0; border-radius:99px; background:transparent; color:#007185; font:inherit; font-weight:600; cursor:pointer; }
    .reset:hover { background:#eef7f8; }
    .stats { margin-left:auto; align-self:center; display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
    .total { font-size:12px; color:var(--muted); }
    .total:empty { display:none; }
    .count { font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .count small { font-weight:400; color:var(--muted); font-size:12px; }

    .bar { position:relative; }
    .prog { position:absolute; top:0; left:0; right:0; height:3px; overflow:hidden; pointer-events:none; }
    .prog { opacity:0; transition:opacity .25s; }
    .prog.on { opacity:1; }
    .prog i { display:block; height:100%; width:0; background:var(--accent); border-radius:0 3px 3px 0; transition:width .4s ease-out; }
    .msg { padding:7px 18px; background:#fff8e5; border-bottom:1px solid #f0d58a; font:12px/1.4 system-ui,Arial,sans-serif; color:#565959; }
    .msg.info { background:#f0f6ff; border-color:#c9dcf7; }
    .msg a { color:#007185; }
    .msg[hidden] { display:none; }

    /* left-column panel, above Amazon's own filters */
    :host(.side) { position:static; z-index:auto; width:auto; flex:none; margin:0 0 20px; }
    :host(.side) .bar { flex-direction:column; flex-wrap:nowrap; align-items:stretch; gap:10px; padding:12px 14px 8px;
      border:1px solid var(--line); border-radius:12px; box-shadow:none; }
    :host(.side) .head { order:-2; align-self:stretch; justify-content:space-between; }
    :host(.side) .bar { overflow:hidden; }
    :host(.side) .stats { order:-1; margin:-6px 0 2px; align-self:flex-start; align-items:flex-start; }
    :host(.side) .count { font-size:13px; }
    :host(.side) .lab { font-size:14px; font-weight:700; letter-spacing:0; text-transform:none; color:var(--ink); }
    :host(.side) output { font-size:13px; color:#c45500; }
    :host(.side) input[type=range] { width:100%; height:22px; }
    :host(.side) .field { gap:4px; }
    :host(.side) .pill, :host(.side) select { width:100%; }
    :host(.side) .pill input { flex:1; min-width:0; width:auto; }
    :host(.side) .reset { align-self:flex-start; margin:-2px 0 0 -12px; height:28px; }
    :host(.side) .msg { margin-top:8px; border:1px solid #f0d58a; border-radius:8px; }
    :host(.side) .msg.info { border-color:#c9dcf7; }
  `;

  function el(tag, props = {}, ...kids) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  }

  const field = (name, out, ...ctl) => el("div", { className: "field" }, el("div", { className: "lab" }, el("span", { textContent: name }), ...(out ? [out] : [])), ...ctl);

  function buildToolbar(side) {
    const host = document.createElement("div");
    host.id = "atb-toolbar";
    if (side) host.className = "side";
    const root = host.attachShadow({ mode: "open" });

    const ui = {};
    ui.pagesOut = el("output");
    ui.pagesRange = el("input", { type: "range", min: 1, max: MAX_PAGES, step: 1, title: "How many result pages to show together in one list" });
    ui.rating = el("input", { type: "range", min: 0, max: 5, step: 0.1 });
    ui.ratingOut = el("output");
    ui.reviews = el("input", { type: "range", min: 0, max: REVIEW_STOPS.length - 1, step: 1 });
    ui.reviewsOut = el("output");
    ui.cur = el("span", { className: "cur" });
    ui.pmin = el("input", { type: "number", min: 0, step: "any", placeholder: "min" });
    ui.pmax = el("input", { type: "number", min: 0, step: "any", placeholder: "max" });
    ui.price = el("div", { className: "pill" }, ui.cur, ui.pmin, el("span", { className: "dash", textContent: "–" }), ui.pmax);
    ui.sort = el("select");
    for (const [v, label] of SORT_LABELS) ui.sort.append(el("option", { value: v, textContent: label }));
    ui.spons = el("input", { type: "checkbox" });
    ui.reset = el("button", { type: "button", className: "reset", textContent: "Reset", title: "Clear filters" });
    ui.count = el("span", { className: "count" });
    ui.total = el("span", { className: "total" });
    ui.stats = el("div", { className: "stats" }, ui.total, ui.count);
    ui.bar = el("i");
    ui.prog = el("div", { className: "prog" }, ui.bar);
    ui.msg = el("div", { className: "msg", hidden: true });

    const brand = el("span", { className: "brand" });
    brand.innerHTML = "<b>Toolbox</b> for Amazon";

    const bar = el(
      "div",
      { className: "bar" },
      ui.prog,
      el("div", { className: "head" }, brand),
      field("See pages at once", ui.pagesOut, ui.pagesRange),
      field("Rating", ui.ratingOut, ui.rating),
      field("Reviews", ui.reviewsOut, ui.reviews),
      field("Price", null, ui.price),
      field("Sort by", null, ui.sort),
      el("label", { className: "switch" }, ui.spons, el("i"), el("span", { textContent: "Hide sponsored" })),
      ui.reset,
      ui.stats
    );
    root.append(el("style", { textContent: TOOLBAR_CSS }), bar, ui.msg);

    const onChange = () => {
      settings.pages = clamp(parseInt(ui.pagesRange.value, 10) || 1, 1, MAX_PAGES);
      settings.rating = parseFloat(ui.rating.value);
      settings.reviewsIdx = parseInt(ui.reviews.value, 10);
      settings.sort = ui.sort.value;
      settings.hideSponsored = ui.spons.checked;
      syncLabels();
      saveSettings();
      apply();
    };
    // Dragging the slider updates the label at once; the fetch waits for a pause so it never fires per tick.
    const onPages = debounce(() => {
      onChange();
      if (!st.error) st.failed.clear(); // changing the page count doubles as "retry"
      pump();
    }, 350);
    ui.pagesRange.addEventListener("input", () => {
      fill(ui.pagesRange);
      syncLabels(parseInt(ui.pagesRange.value, 10));
      onPages();
    });
    for (const k of ["rating", "reviews", "sort", "spons", "pmin", "pmax"]) {
      ui[k].addEventListener(k === "sort" || k === "spons" ? "change" : "input", onChange);
    }
    ui.reset.addEventListener("click", () => {
      Object.assign(settings, { rating: 0, reviewsIdx: 0, sort: "featured", hideSponsored: false });
      ui.pmin.value = ui.pmax.value = "";
      syncUi();
      saveSettings();
      apply();
    });

    return { host, ui };
  }

  // How many pages exist from the current one: what we learned by fetching, else what Amazon's
  // pagination shows (it can under-report, so typing a bigger number is still allowed), else the hard cap.
  function pagesCap(state = st) {
    const lastPage = state.lastPage || state.pageHint;
    return lastPage ? clamp(lastPage - state.firstPage + 1, 1, MAX_PAGES) : MAX_PAGES;
  }

  // The page count the slider can actually reach (a saved value may exceed this search's pages).
  const effPages = (state) => Math.min(settings.pages, pagesCap(state));

  function updatePagesMax() {
    if (!st) return;
    const { ui } = st;
    const cap = pagesCap();
    ui.pagesRange.max = cap;
    ui.pagesRange.disabled = cap <= 1;
    ui.pagesRange.value = Math.min(settings.pages, cap);
    fill(ui.pagesRange);
    const total = st.lastPage || st.pageHint;
    ui.total.textContent = total ? `${total} page${total === 1 ? "" : "s"} in total` : "";
    st.ui.cur.textContent = st.currency;
    st.ui.cur.hidden = !st.currency;
    syncLabels();
  }

  const fill = (input) => {
    const span = input.max - input.min;
    input.style.setProperty("--p", `${span > 0 ? ((input.value - input.min) / span) * 100 : 0}%`);
  };

  function syncLabels(pages = settings.pages) {
    const { ui } = st;
    ui.ratingOut.textContent = settings.rating > 0 ? `${settings.rating.toFixed(1)}+` : "any";
    const r = REVIEW_STOPS[settings.reviewsIdx];
    ui.pagesOut.textContent = String(Math.min(pages, pagesCap()));
    ui.reviewsOut.textContent = r > 0 ? `${r >= 1000 ? r / 1000 + "K" : r}+` : "any";
    fill(ui.rating);
    fill(ui.reviews);
  }

  function syncUi() {
    const { ui } = st;
    ui.rating.value = settings.rating;
    ui.reviews.value = settings.reviewsIdx;
    ui.sort.value = settings.sort;
    ui.spons.checked = settings.hideSponsored;
    syncLabels();
  }

  function renderStatus() {
    if (!st) return;
    const { ui } = st;
    const last = Math.min(st.firstPage + effPages(st) - 1, st.lastPage || Infinity);
    const wanted = Math.max(0, last - st.firstPage); // extra pages beyond the one Amazon gave us
    let loaded = 0;
    for (let q = st.firstPage + 1; q <= last; q++) if (st.done.has(q)) loaded++;
    const busy = st.inflight.size > 0 && wanted > 0;
    if (busy) {
      clearTimeout(st.progTimer);
      ui.prog.classList.add("on");
      ui.bar.style.width = `${Math.max(6, (loaded / wanted) * 100)}%`; // fills left to right as pages arrive
    } else if (ui.prog.classList.contains("on")) {
      ui.bar.style.width = "100%"; // finish the line, fade it out, then reset for next time
      clearTimeout(st.progTimer);
      st.progTimer = setTimeout(() => {
        ui.prog.classList.remove("on");
        setTimeout(() => {
          ui.bar.style.transition = "none";
          ui.bar.style.width = "0";
          ui.bar.offsetWidth; // flush
          ui.bar.style.transition = "";
        }, 300);
      }, 350);
    }

    const failed = [...st.failed].filter(([p]) => p <= last);
    if (st.error) {
      ui.msg.hidden = false;
      ui.msg.replaceChildren(`${st.error.text} `, el("a", { href: location.href, textContent: "Reload this page" }), " in a minute and try again.");
    } else if (failed.length) {
      ui.msg.hidden = false;
      ui.msg.textContent = `Could not load page${failed.length > 1 ? "s" : ""} ${failed.map(([p]) => p).join(", ")} (${failed[0][1]}).`;
    } else {
      ui.msg.hidden = true;
    }
    ui.msg.className = "msg";
  }

  // ---------- lifecycle ----------

  const saveSettings = debounce(() => {
    try {
      chrome.storage.local.set({ atbSettings: settings });
    } catch {}
  }, 300);

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ atbSettings: DEFAULTS }, (r) => {
          const s = { ...DEFAULTS, ...(r && r.atbSettings) };
          s.pages = clamp(parseInt(s.pages, 10) || 1, 1, MAX_PAGES);
          s.rating = clamp(parseFloat(s.rating) || 0, 0, 5);
          s.reviewsIdx = clamp(parseInt(s.reviewsIdx, 10) || 0, 0, REVIEW_STOPS.length - 1);
          if (!SORT_LABELS.some(([v]) => v === s.sort)) s.sort = "featured";
          resolve(s);
        });
      } catch {
        resolve({ ...DEFAULTS });
      }
    });
  }

  const findSidebar = () => {
    const e = document.getElementById("s-refinements");
    return e && e.offsetWidth > 120 ? e : null;
  };
  let sidebarWaitUntil = 0; // after a page load / results swap, give Amazon's left column time to appear

  function placeHost(host, sidebar) {
    if (sidebar) {
      sidebar.prepend(host);
      return;
    }
    const anchor =
      document.querySelector('[data-component-type="s-result-info-bar"]') ||
      document.querySelector(".s-desktop-toolbar") ||
      document.getElementById("search") ||
      st.container;
    if (anchor === st.container) st.container.before(host);
    else anchor.before(host);
  }

  function mount() {
    // Preferred home: top of Amazon's left filter column, above "Delivery". It can be missing for a
    // moment while Amazon re-renders, so wait a little before settling for the bar above the results
    // (which is also what narrow layouts, where the column is hidden, end up with).
    const sidebar = findSidebar();
    if (!sidebar && Date.now() < sidebarWaitUntil) {
      setTimeout(() => enabled && !st && mount(), 250);
      return false;
    }

    const next = createState();
    if (!next) return false;
    st = next;

    const { host, ui } = buildToolbar(!!sidebar);
    st.host = host;
    st.ui = ui;
    placeHost(host, sidebar);

    syncUi();
    updatePagesMax();
    apply();
    pump();
    return true;
  }

  function teardown() {
    if (!st) return;
    st.abort.abort();
    st.host && st.host.remove();
    for (const it of st.items) {
      it.top.removeAttribute("data-atb-hidden");
      if (it.page !== st.firstPage) it.top.remove(); // cards we fetched
    }
    layout(st.items.filter((it) => it.page === st.firstPage).sort((a, b) => a.seq - b.seq)); // Amazon's own order
    st.marker.remove();
    st = null;
  }

  function readEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ showSearchToolbar: true }, (r) => resolve(r.showSearchToolbar !== false));
      } catch {
        resolve(true);
      }
    });
  }

  let watcher = null;

  // Amazon sometimes swaps results in place, and the grid may render a moment after load.
  const check = debounce(() => {
    if (!enabled) return;
    if (st && (location.href !== st.href || !st.container.isConnected)) {
      teardown(); // a different search, or the results were replaced: start over
      sidebarWaitUntil = Date.now() + 2500;
    } else if (st && !st.host.isConnected) {
      // Only our panel got dropped (Amazon re-rendered its filters): put it back, keep everything loaded.
      const side = st.host.classList.contains("side");
      const sidebar = findSidebar();
      if (sidebar || !side) placeHost(st.host, side ? sidebar : null);
    } else if (st && !st.host.classList.contains("side") && findSidebar()) {
      teardown(); // we fell back to the top bar but the left column is available now
    }
    if (!st) mount();
  }, 400);

  function turnOn() {
    enabled = true;
    sidebarWaitUntil = Date.now() + 2500;
    mount();
    if (!watcher) {
      watcher = new MutationObserver(check);
      watcher.observe(document.body, { childList: true, subtree: true });
    }
  }

  function turnOff() {
    enabled = false;
    if (watcher) {
      watcher.disconnect();
      watcher = null;
    }
    teardown(); // removes the panel and extra cards, restores Amazon's order, cancels fetches
  }

  async function start() {
    settings = await loadSettings();
    if (await readEnabled()) turnOn();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes.showSearchToolbar) return;
      if (changes.showSearchToolbar.newValue !== false) turnOn();
      else turnOff();
    });
  }

  start();
})();
