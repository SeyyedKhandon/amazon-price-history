// End-to-end check of the search toolbar: runs the *built* dist/search.js against a fake Amazon search
// page in jsdom, with a fake chrome.* API and a fake network. `npm test` builds first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const bundle = readFileSync(new URL("../dist/search.js", import.meta.url), "utf8");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- a tiny fake Amazon -------------------------------------------------------------------------

interface Product {
  price?: string;
  rating?: string;
  reviews?: string;
  sponsored?: boolean;
}

const card = (asin: string, p: Product) => `
  <div data-component-type="s-search-result" data-asin="${asin}" class="s-result-item"><div class="puis-card-container">
    ${p.sponsored ? '<span class="puis-sponsored-label-text">Sponsored</span>' : ""}
    <h2><span>Product ${asin}</span></h2>
    ${p.rating ? `<span class="a-icon-star-small"><span class="a-icon-alt">${p.rating} out of 5 stars</span></span><a href="/dp/${asin}#customerReviews"><span class="a-size-base s-underline-text">${p.reviews}</span></a>` : ""}
    ${p.price ? `<span class="a-price"><span class="a-offscreen">€${p.price}</span></span>` : ""}
  </div></div>`;

const PAGES: Record<number, [string, Product][]> = {
  1: [["A1", { price: "159.99", rating: "4.6", reviews: "(484)" }], ["A2", { price: "119.99", rating: "4.5", reviews: "(1.3K)" }], ["A3", { price: "89.00", rating: "3.9", reviews: "(12)", sponsored: true }], ["A4", {}]],
  2: [["B1", { price: "1.299,00", rating: "4.8", reviews: "(42)" }], ["A2", { price: "119.99", rating: "4.5", reviews: "(1.3K)" }], ["B2", { price: "45.50", rating: "5.0", reviews: "(3)" }]],
  3: [["C1", { price: "70.00", rating: "4.2", reviews: "2,5K" }]],
};

const WIDGET = '<div class="s-widget" id="related">Related searches</div>';
const PAGINATION = '<div class="s-pagination-container">' + [1, 2, 3, 9].map((n) => `<span class="s-pagination-item">${n}</span>`).join("") + '<span class="s-pagination-item s-pagination-next">Next</span></div>';

/** Page `n` of the fake results. Pages past the end repeat the last page, like Amazon does. */
const resultsPage = (n: number, first = false): string => {
  const products = (PAGES[Math.min(n, 3)] ?? []).map(([asin, p]) => card(asin, p));
  if (first) products.splice(2, 0, WIDGET); // a non-product block between cards 2 and 3
  return `<html><body>
    <div id="s-refinements"><div>Delivery</div></div>
    <div id="search"><div data-component-type="s-result-info-bar">1-24 of results</div>
    <div class="s-main-slot s-result-list">${products.join("")}${PAGINATION}</div></div></body></html>`;
};

// ---- the browser environment --------------------------------------------------------------------

function setUp(storedSettings: Record<string, unknown>) {
  const dom = new JSDOM(resultsPage(1, true), { url: "https://www.amazon.de/s?k=chair", runScripts: "dangerously", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  // jsdom has no layout; pretend every element is wide, so the left column counts as visible.
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", { get: () => 300 });

  const local: Record<string, unknown> = { atbSettings: storedSettings };
  const sync: Record<string, unknown> = {};
  const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
  const area = (store: Record<string, unknown>) => ({
    get: async (defaults: Record<string, unknown>) => ({ ...defaults, ...store }),
    set: async (items: Record<string, unknown>) => void Object.assign(store, items),
  });
  const fetched: number[] = [];

  Object.assign(window, {
    chrome: { storage: { local: area(local), sync: area(sync), onChanged: { addListener: (fn: (typeof listeners)[number]) => listeners.push(fn), removeListener() {} } } },
    fetch: async (input: URL | string) => {
      const page = Number(new URL(String(input)).searchParams.get("page") ?? 1);
      fetched.push(page);
      return { ok: true, status: 200, text: async () => resultsPage(page) };
    },
  });

  const script = document.createElement("script");
  script.textContent = bundle;
  document.head.append(script);

  const host = () => document.getElementById("atb-toolbar");
  const root = () => host()!.shadowRoot!;
  const field = (selector: string, index = 0) => root().querySelectorAll<HTMLInputElement>(selector)[index]!;
  const fire = (el: Element, type: string) => el.dispatchEvent(new window.Event(type));

  return {
    window,
    document,
    local,
    fetched,
    host,
    root,
    /** Every product card in page order, hidden or not. */
    allIds: () => [...document.querySelectorAll<HTMLElement>(".s-main-slot [data-asin]")].map((e) => e.dataset["asin"]),
    /** Only the cards the user can see. */
    shownIds: () => [...document.querySelectorAll<HTMLElement>(".s-main-slot [data-asin]")].filter((e) => !e.closest("[data-atb-hidden]")).map((e) => e.dataset["asin"]),
    /** Sliders in the panel: 0 pages, 1 rating, 2 reviews. */
    setSlider: (index: number, value: number) => {
      const slider = field("input[type=range]", index);
      slider.value = String(value);
      fire(slider, "input");
    },
    slider: (index: number) => field("input[type=range]", index),
    /** Price boxes: 0 min, 1 max. */
    setPrice: (index: number, value: string) => {
      const box = field("input[type=number]", index);
      box.value = value;
      fire(box, "input");
    },
    priceHint: () => `${field("input[type=number]", 0).placeholder}-${field("input[type=number]", 1).placeholder}`,
    setSort: (value: string) => {
      const select = root().querySelector("select")!;
      select.value = value;
      fire(select, "change");
    },
    toggleSponsored: (on: boolean) => {
      const box = field("input[type=checkbox]");
      box.checked = on;
      fire(box, "change");
    },
    reset: () => (root().querySelector(".reset") as HTMLElement).click(),
    text: (selector: string) => root().querySelector(selector)?.textContent ?? "",
    output: (index: number) => root().querySelectorAll("output")[index]?.textContent,
    setFlag: (name: string, value: boolean) => {
      sync[name] = value;
      for (const fn of listeners) fn({ [name]: { newValue: value } }, "sync");
    },
  };
}

// ---- the scenario -------------------------------------------------------------------------------

test("search toolbar, end to end", async (t) => {
  const env = setUp({ pages: 10 });
  const { document } = env;

  await t.test("mounts at the top of Amazon's left column", async () => {
    await wait(100);
    const host = env.host();
    assert.ok(host, "toolbar exists");
    assert.equal(host.parentElement?.id, "s-refinements");
    assert.equal(document.getElementById("s-refinements")?.firstElementChild, host, "above Delivery");
  });

  await t.test("slider starts at Amazon's pagination hint, then shrinks to the real last page", async () => {
    assert.equal(env.slider(0).max, "9", "hint from the pagination strip");
    const seen: string[] = [];
    const started = Date.now();
    while (Date.now() - started < 6000) {
      const hint = env.priceHint();
      if (seen.at(-1) !== hint) seen.push(hint);
      await wait(60);
    }
    assert.equal(seen[0], "89-160", "page 1's prices");
    assert.equal(seen.at(-1), "45-1299", "the price hint updated as more pages arrived");
    assert.equal(env.slider(0).max, "3", "Amazon ran out after page 3");
    assert.equal(env.text(".total"), "3 pages in total");
    assert.equal(env.output(0), "3");
  });

  await t.test("merges pages in order, drops duplicates, leaves other page blocks alone", () => {
    assert.deepEqual(env.allIds(), ["A1", "A2", "A3", "A4", "B1", "B2", "C1"]);
    assert.equal(env.text(".count"), "7 of 7 results");
    assert.equal(document.getElementById("related")?.nextElementSibling?.getAttribute("data-asin"), "A3", "widget stays between cards 2 and 3");
    assert.ok(env.fetched.includes(2) && env.fetched.includes(3));
    assert.ok(Math.max(...env.fetched) <= 5, "stops asking once Amazon runs out");
    assert.equal(env.window.document.querySelectorAll("input[type=number]").length, 0, "(the panel's inputs are inside the shadow root)");
    assert.equal(env.root().querySelectorAll("input[type=number]").length, 2, "only the two price boxes");
  });

  await t.test("survives Amazon re-rendering the left column", async () => {
    const fetchedBefore = env.fetched.length;
    const before = env.allIds().join();
    document.getElementById("s-refinements")!.remove();
    await wait(900); // the column is gone for a moment
    assert.notEqual(document.querySelector(".s-main-slot")?.previousElementSibling?.id, "atb-toolbar", "no jump to the top bar while the column is missing");

    const fresh = document.createElement("div");
    fresh.id = "s-refinements";
    fresh.innerHTML = "<div>Delivery</div>";
    document.body.prepend(fresh);
    await wait(900);
    assert.equal(env.host()?.parentElement, fresh, "panel is back in the new column");
    assert.equal(env.fetched.length, fetchedBefore, "nothing was refetched");
    assert.equal(env.allIds().join(), before, "loaded results untouched");
  });

  await t.test("pages slider previews instantly", () => {
    env.setSlider(0, 2);
    assert.equal(env.output(0), "2");
    env.setSlider(0, 3);
  });

  await t.test("sorts across every loaded page, missing values last", () => {
    env.setSort("price_asc");
    assert.deepEqual(env.allIds(), ["B2", "C1", "A3", "A2", "A1", "B1", "A4"]);
  });

  await t.test("filters by rating, reviews and price; the price hint follows", () => {
    env.setSlider(1, 4.5);
    assert.deepEqual(env.shownIds(), ["B2", "A2", "A1", "B1"]);
    assert.equal(env.text(".count"), "4 of 7 results");
    assert.equal(env.priceHint(), "45-1299");

    env.setSlider(1, 4.7);
    assert.equal(env.priceHint(), "45-1299", "5.0 and 4.8 remain");
    env.setSlider(1, 4.5);

    env.setSort("price_desc");
    assert.deepEqual(env.shownIds(), ["B1", "A1", "A2", "B2"]);
    env.setSlider(2, 3); // at least 50 reviews
    assert.deepEqual(env.shownIds(), ["A1", "A2"]);
    env.setPrice(1, "130");
    assert.deepEqual(env.shownIds(), ["A2"]);
  });

  await t.test("reset restores Amazon's order and shows everything", () => {
    env.reset();
    assert.deepEqual(env.allIds(), ["A1", "A2", "A3", "A4", "B1", "B2", "C1"]);
    assert.equal(env.text(".count"), "7 of 7 results");
  });

  await t.test("hides sponsored results and narrows to fewer pages", async () => {
    env.toggleSponsored(true);
    assert.ok(!env.shownIds().includes("A3"));
    env.setSlider(0, 1);
    await wait(700);
    assert.deepEqual(env.shownIds(), ["A1", "A2", "A4"]);
    assert.equal(env.text(".count"), "3 of 4 results");
    assert.ok(document.querySelector(".s-main-slot")?.lastElementChild?.classList.contains("s-pagination-container"), "pagination stays last");
  });

  await t.test("remembers the user's settings", () => {
    // (copied out of jsdom's realm, whose Object prototype strict equality would otherwise reject)
    assert.deepEqual({ ...(env.local["atbSettings"] as object) }, { pages: 1, rating: 0, reviewsIdx: 0, sort: "featured", hideSponsored: true });
  });

  await t.test("turning it off removes everything it added; turning it on brings it back", () => {
    env.setFlag("showSearchToolbar", false);
    assert.equal(env.host(), null, "panel removed");
    assert.deepEqual(env.allIds(), ["A1", "A2", "A3", "A4"], "only Amazon's own cards, in Amazon's order");
    assert.equal(document.querySelectorAll("[data-atb-hidden]").length, 0, "nothing left hidden");

    env.setFlag("showSearchToolbar", true);
    assert.ok(env.host(), "panel is back");
  });
});
