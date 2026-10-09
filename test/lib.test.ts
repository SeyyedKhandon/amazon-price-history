import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS, arrangeItems, availablePriceRange, bestScore, isSortMode, matchesFilters, parseCount, parsePrice, parseRating,
  sanitizeSettings, sortItems,
  type Filters, type ResultItem, type Sortable,
} from "../src/lib.ts";

// ---------- parsing ----------

test("parsePrice handles locale formats", () => {
  const cases: Record<string, number | null> = {
    "€159.99": 159.99,
    "159,99 €": 159.99,
    "$1,299.00": 1299,
    "1.299,00 €": 1299,
    "1 299,00 €": 1299,
    "¥1,980": 1980,
    "₹1,29,999": 129999,
    "£0.99": 0.99,
    "€1.299": 1299,
    "CHF 1'299.50": 1299.5,
    "€10.00 - €20.00": 10,
    "": null,
    "Currently unavailable": null,
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(parsePrice(input), want, input);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
});

test("parseRating handles locales", () => {
  assert.equal(parseRating("4.6 out of 5 stars"), 4.6);
  assert.equal(parseRating("4,6 von 5 Sternen"), 4.6);
  assert.equal(parseRating("4,5 sur 5 étoiles"), 4.5);
  assert.equal(parseRating("5つ星のうち4.5"), 4.5);
  assert.equal(parseRating("5.0 out of 5 stars"), 5);
  assert.equal(parseRating("5つ星のうち5.0"), 5);
  assert.equal(parseRating("no rating"), null);
  assert.equal(parseRating("7 out of 5"), null);
});

test("parseCount handles abbreviations and separators", () => {
  const cases: Record<string, number | null> = {
    "484": 484,
    "(484)": 484,
    "(1.3K)": 1300,
    "1,3 Tsd.": 1300,
    "12K+": 12000,
    "1,234 ratings": 1234,
    "1.234": 1234,
    "1 234": 1234,
    "2 Mio.": 2000000,
    "1.2M": 1200000,
    "3,5 mil": 3500,
    "1,5万": 15000,
    "": null,
    ratings: null,
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseCount(input), want, input);
});

// ---------- sorting ----------

const items: Sortable[] = [
  { seq: 0, price: 30, rating: 4, reviews: 10 },
  { seq: 1, price: null, rating: null, reviews: null },
  { seq: 2, price: 10, rating: 4, reviews: 10 },
  { seq: 3, price: 30, rating: 5, reviews: 1 },
];
const order = (list: Sortable[]) => list.map((item) => item.seq);

test("bestScore prefers many good reviews over few perfect ones", () => {
  assert.ok(bestScore(4.7, 3000) > bestScore(5, 3));
  assert.equal(bestScore(null, 10), -1);
  assert.ok(Math.abs(bestScore(4.2, 0) - 4.2) < 1e-9, "no reviews falls back to the prior");
});

test("sortItems puts missing values last and is stable", () => {
  assert.deepEqual(order(sortItems(items, "price_asc")), [2, 0, 3, 1]);
  assert.deepEqual(order(sortItems(items, "price_desc")), [0, 3, 2, 1]);
  assert.deepEqual(order(sortItems(items, "rating")), [3, 0, 2, 1]);
  assert.deepEqual(order(sortItems(items, "reviews")), [0, 2, 3, 1]);
  assert.deepEqual(order(sortItems(items, "featured")), [0, 1, 2, 3]);
});

test("sortItems doesn't mutate its input", () => {
  const before = order(items);
  sortItems(items, "price_asc");
  assert.deepEqual(order(items), before);
});

test("isSortMode only accepts known modes", () => {
  assert.equal(isSortMode("best"), true);
  assert.equal(isSortMode("price_desc"), true);
  assert.equal(isSortMode("cheapest"), false);
  assert.equal(isSortMode(undefined), false);
});

// ---------- filters ----------

let nextSeq = 0;
const item = (over: Partial<ResultItem>): ResultItem => ({
  asin: `A${nextSeq}`,
  top: {} as HTMLElement, // filters never touch the DOM
  page: 1,
  sponsored: false,
  price: 100,
  rating: 4.5,
  reviews: 100,
  seq: nextSeq++,
  ...over,
});

const anything: Filters = { rating: 0, reviews: 0, pmin: null, pmax: null };
const ctx = { lastShownPage: 3, hideSponsored: false };

test("matchesFilters applies each filter", () => {
  assert.equal(matchesFilters(item({}), anything, ctx), true);
  assert.equal(matchesFilters(item({ rating: 4.0 }), { ...anything, rating: 4.5 }, ctx), false);
  assert.equal(matchesFilters(item({ reviews: 20 }), { ...anything, reviews: 50 }, ctx), false);
  assert.equal(matchesFilters(item({ price: 50 }), { ...anything, pmin: 60 }, ctx), false);
  assert.equal(matchesFilters(item({ price: 150 }), { ...anything, pmax: 120 }, ctx), false);
  assert.equal(matchesFilters(item({ page: 4 }), anything, ctx), false, "pages beyond the shown range are hidden");
  assert.equal(matchesFilters(item({ sponsored: true }), anything, { ...ctx, hideSponsored: true }), false);
});

test("items missing the filtered value are hidden, otherwise kept", () => {
  const unknown = item({ price: null, rating: null, reviews: null });
  assert.equal(matchesFilters(unknown, anything, ctx), true);
  assert.equal(matchesFilters(unknown, { ...anything, rating: 1 }, ctx), false);
  assert.equal(matchesFilters(unknown, { ...anything, reviews: 1 }, ctx), false);
  assert.equal(matchesFilters(unknown, { ...anything, pmax: 999 }, ctx), false);
});

test("availablePriceRange ignores the price filter but respects the others", () => {
  const items = [item({ price: 45, rating: 5 }), item({ price: 120, rating: 4.6 }), item({ price: 1299, rating: 4.8 }), item({ price: 30, rating: 3 }), item({ price: null })];
  assert.deepEqual(availablePriceRange(items, anything, ctx), { min: 30, max: 1299 });
  assert.deepEqual(availablePriceRange(items, { ...anything, rating: 4.5 }, ctx), { min: 45, max: 1299 });
  assert.deepEqual(availablePriceRange(items, { ...anything, rating: 4.5, pmin: 500, pmax: 600 }, ctx), { min: 45, max: 1299 }, "typing a price doesn't shrink the hint");
  assert.equal(availablePriceRange(items, { ...anything, rating: 5, reviews: 9999 }, ctx), null);
});

test("arrangeItems orders visible items first and keeps hidden ones", () => {
  const a = item({ page: 2, price: 10 });
  const b = item({ page: 1, price: 30 });
  const c = item({ page: 1, price: 20 });
  const hidden = item({ page: 1, price: 5 });
  const all = [a, b, c, hidden];
  const asins = (list: ResultItem[]) => list.map((x) => x.asin);

  assert.deepEqual(asins(arrangeItems(all, [a, b, c], "featured")), asins([b, c, a, hidden]), "featured = by page, then position");
  assert.deepEqual(asins(arrangeItems(all, [a, b, c], "price_asc")), asins([a, c, b, hidden]));
  assert.equal(arrangeItems(all, [a, b, c], "price_desc").length, 4, "nothing is dropped");
});

// ---------- settings ----------

test("sanitizeSettings falls back to defaults for missing or garbage input", () => {
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings("nope"), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({}), DEFAULT_SETTINGS);
});

test("sanitizeSettings keeps valid values", () => {
  const saved = { pages: 12, rating: 4.4, reviewsIdx: 4, sort: "price_desc", hideSponsored: true };
  assert.deepEqual(sanitizeSettings(saved), saved);
});

test("sanitizeSettings clamps out-of-range values and rejects unknown sorts", () => {
  const result = sanitizeSettings({ pages: 999, rating: 9, reviewsIdx: 99, sort: "cheapest", hideSponsored: "yes" });
  assert.equal(result.pages, 30);
  assert.equal(result.rating, 5);
  assert.equal(result.reviewsIdx, 9);
  assert.equal(result.sort, "featured");
  assert.equal(result.hideSponsored, false);

  const low = sanitizeSettings({ pages: -3, rating: -1, reviewsIdx: -5 });
  assert.equal(low.pages, 1);
  assert.equal(low.rating, 0);
  assert.equal(low.reviewsIdx, 0);
});

test("sanitizeSettings copes with numbers stored as strings (older versions)", () => {
  const result = sanitizeSettings({ pages: "7", rating: "4.5", reviewsIdx: "3" });
  assert.equal(result.pages, 7);
  assert.equal(result.rating, 4.5);
  assert.equal(result.reviewsIdx, 3);
});
