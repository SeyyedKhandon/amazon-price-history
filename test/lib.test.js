const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePrice, parseRating, parseCount, bestScore, sortItems } = require("../lib.js");

test("parsePrice handles locale formats", () => {
  const cases = {
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
});

test("parseRating handles locales", () => {
  assert.equal(parseRating("4.6 out of 5 stars"), 4.6);
  assert.equal(parseRating("4,6 von 5 Sternen"), 4.6);
  assert.equal(parseRating("4,5 sur 5 étoiles"), 4.5);
  assert.equal(parseRating("5つ星のうち4.5"), 4.5);
  assert.equal(parseRating("5.0 out of 5 stars"), 5);
  assert.equal(parseRating("5つ星のうち5.0"), 5);
  assert.equal(parseRating("no rating"), null);
});

test("parseCount handles abbreviations and separators", () => {
  const cases = {
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
    "ratings": null,
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseCount(input), want, input);
});

test("bestScore prefers many good reviews over few perfect ones", () => {
  assert.ok(bestScore(4.7, 3000) > bestScore(5, 3));
  assert.equal(bestScore(null, 10), -1);
});

test("sortItems puts missing values last and is stable", () => {
  const items = [
    { seq: 0, price: 30, rating: 4, reviews: 10 },
    { seq: 1, price: null, rating: null, reviews: null },
    { seq: 2, price: 10, rating: 4, reviews: 10 },
    { seq: 3, price: 30, rating: 5, reviews: 1 },
  ];
  assert.deepEqual(sortItems(items, "price_asc").map((i) => i.seq), [2, 0, 3, 1]);
  assert.deepEqual(sortItems(items, "price_desc").map((i) => i.seq), [0, 3, 2, 1]);
  assert.deepEqual(sortItems(items, "rating").map((i) => i.seq), [3, 0, 2, 1]);
  assert.deepEqual(sortItems(items, "featured").map((i) => i.seq), [0, 1, 2, 3]);
});
