// The toolbar's view: builds the panel, reads what the user chose, and draws whatever state it's given.
// It holds no search logic; search.ts decides what the numbers mean.
import { MAX_PAGES, REVIEW_STOPS, SORT_LABELS, SORT_MODES, clamp, isSortMode, type PriceRange, type Settings } from "./lib.ts";

export interface ToolbarView {
  settings: Settings;
  /** How many pages exist: the pages slider's maximum. */
  pagesLimit: number;
  totalPages: number | null;
  currency: string;
  priceRange: PriceRange | null;
  shown: number;
  loaded: number;
  /** 0..1 while pages are loading, null when idle. */
  progress: number | null;
  message: { text: string; reload?: boolean } | null;
}

/** What the controls say, with the two price boxes (null when empty). */
export type ToolbarValues = Settings & { pmin: number | null; pmax: number | null };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
};

/** A titled control, with an optional live value on the right of the title. */
const field = (label: string, value: HTMLElement | null, control: HTMLElement) =>
  el("div", { className: "field" }, el("div", { className: "lab" }, el("span", { textContent: label }), ...(value ? [value] : [])), control);

/** Paints the filled part of a slider's track (the stylesheet reads --p). */
const paint = (slider: HTMLInputElement) => {
  const span = Number(slider.max) - Number(slider.min);
  slider.style.setProperty("--p", `${span > 0 ? ((Number(slider.value) - Number(slider.min)) / span) * 100 : 0}%`);
};

const priceOf = (box: HTMLInputElement) => (box.value.trim() === "" ? null : parseFloat(box.value.replace(",", ".")));

export class Toolbar {
  readonly host = el("div", { id: "atb-toolbar" });
  /** In Amazon's left column (true) or the bar above the results (false). */
  readonly side: boolean;

  private readonly pages = el("input", { type: "range", min: "1", max: String(MAX_PAGES), step: "1", title: "How many result pages to show together in one list" });
  private readonly rating = el("input", { type: "range", min: "0", max: "5", step: "0.1" });
  private readonly reviews = el("input", { type: "range", min: "0", max: String(REVIEW_STOPS.length - 1), step: "1" });
  private readonly pagesOut = el("output");
  private readonly ratingOut = el("output");
  private readonly reviewsOut = el("output");
  private readonly currency = el("span", { className: "cur" });
  private readonly priceMin = el("input", { type: "number", min: "0", step: "any", placeholder: "min" });
  private readonly priceMax = el("input", { type: "number", min: "0", step: "any", placeholder: "max" });
  private readonly price = el("div", { className: "pill" }, this.currency, this.priceMin, el("span", { className: "dash", textContent: "–" }), this.priceMax);
  private readonly sort = el("select");
  private readonly sponsored = el("input", { type: "checkbox" });
  private readonly total = el("span", { className: "total" });
  private readonly count = el("span", { className: "count" });
  private readonly progress = el("div", { className: "prog" }, el("i"));
  private readonly message = el("div", { className: "msg", hidden: true });
  private progressTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(side: boolean, on: { changed(): void; reset(): void }) {
    this.side = side;
    this.host.className = side ? "side" : "";
    for (const mode of SORT_MODES) this.sort.append(el("option", { value: mode, textContent: SORT_LABELS[mode] }));

    const brand = el("span", { className: "brand" });
    brand.innerHTML = "<b>Toolbox</b> for Amazon"; // fixed string, no user data
    const reset = el("button", { type: "button", className: "reset", textContent: "Reset", title: "Clear filters" });

    const bar = el(
      "div",
      { className: "bar" },
      this.progress,
      el("div", { className: "head" }, brand),
      field("See pages at once", this.pagesOut, this.pages),
      field("Rating", this.ratingOut, this.rating),
      field("Reviews", this.reviewsOut, this.reviews),
      field("Price", null, this.price),
      field("Sort by", null, this.sort),
      el("label", { className: "switch" }, this.sponsored, el("i"), el("span", { textContent: "Hide sponsored" })),
      reset,
      el("div", { className: "stats" }, this.total, this.count),
    );
    // A shadow root, so Amazon's CSS can't restyle the panel and ours can't leak out.
    this.host.attachShadow({ mode: "open" }).append(el("style", { textContent: TOOLBAR_CSS }), bar, this.message);

    for (const input of [this.pages, this.rating, this.reviews, this.priceMin, this.priceMax]) input.addEventListener("input", on.changed);
    this.sort.addEventListener("change", on.changed);
    this.sponsored.addEventListener("change", on.changed);
    reset.addEventListener("click", on.reset);
  }

  values(): ToolbarValues {
    return {
      pages: clamp(parseInt(this.pages.value, 10) || 1, 1, MAX_PAGES),
      rating: parseFloat(this.rating.value),
      reviewsIdx: parseInt(this.reviews.value, 10),
      sort: isSortMode(this.sort.value) ? this.sort.value : "featured",
      hideSponsored: this.sponsored.checked,
      ...this.priceBounds(),
    };
  }

  priceBounds() {
    return { pmin: priceOf(this.priceMin), pmax: priceOf(this.priceMax) };
  }

  clearPrice(): void {
    this.priceMin.value = this.priceMax.value = "";
  }

  /** Draws the whole panel from `v`. Safe to call as often as you like. */
  render(v: ToolbarView): void {
    const { settings: s } = v;
    this.rating.value = String(s.rating);
    this.reviews.value = String(s.reviewsIdx);
    this.sort.value = s.sort;
    this.sponsored.checked = s.hideSponsored;
    this.pages.max = String(v.pagesLimit);
    this.pages.disabled = v.pagesLimit <= 1;
    this.pages.value = String(Math.min(s.pages, v.pagesLimit));
    for (const slider of [this.pages, this.rating, this.reviews]) paint(slider);

    const minReviews = REVIEW_STOPS[s.reviewsIdx] ?? 0;
    this.pagesOut.textContent = this.pages.value;
    this.ratingOut.textContent = s.rating > 0 ? `${s.rating.toFixed(1)}+` : "any";
    this.reviewsOut.textContent = minReviews > 0 ? `${minReviews >= 1000 ? minReviews / 1000 + "K" : minReviews}+` : "any";

    this.total.textContent = v.totalPages ? `${v.totalPages} page${v.totalPages === 1 ? "" : "s"} in total` : "";
    this.currency.textContent = v.currency;
    this.currency.hidden = !v.currency;
    const range = v.priceRange;
    this.priceMin.placeholder = range ? String(Math.floor(range.min)) : "min";
    this.priceMax.placeholder = range ? String(Math.ceil(range.max)) : "max";
    this.price.title = range ? `Prices in these results: ${v.currency}${Math.floor(range.min)} – ${v.currency}${Math.ceil(range.max)}` : "";
    this.count.replaceChildren(`${v.shown} `, el("small", { textContent: `of ${v.loaded} results` }));

    this.showProgress(v.progress);
    this.message.hidden = !v.message;
    if (v.message) {
      this.message.replaceChildren(v.message.text, ...(v.message.reload ? [" ", el("a", { href: location.href, textContent: "Reload this page" }), " in a minute and try again."] : []));
    }
  }

  /** A line along the top edge that fills left to right while pages load, then completes and fades. */
  private showProgress(progress: number | null): void {
    const bar = this.progress.firstElementChild as HTMLElement;
    clearTimeout(this.progressTimer);
    if (progress !== null) {
      this.progress.classList.add("on");
      bar.style.width = `${Math.max(6, progress * 100)}%`;
    } else if (this.progress.classList.contains("on")) {
      bar.style.width = "100%";
      this.progressTimer = setTimeout(() => {
        this.progress.classList.remove("on");
        setTimeout(() => {
          bar.style.transition = "none";
          bar.style.width = "0";
          void bar.offsetWidth; // flush, so the reset doesn't animate
          bar.style.transition = "";
        }, 300);
      }, 350);
    }
  }

  dispose(): void {
    clearTimeout(this.progressTimer);
    this.host.remove();
  }
}

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
`;
