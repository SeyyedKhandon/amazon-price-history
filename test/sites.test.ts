import assert from "node:assert/strict";
import { test } from "node:test";
import { AMAZON_SITES, camelPageUrl, isSearchPath, isSearchUrl, keepaPageUrl, parseAmazonUrl, productPagePatterns } from "../src/sites.ts";

test("parseAmazonUrl finds the ASIN and marketplace", () => {
  const product = parseAmazonUrl("https://www.amazon.de/Some-Chair/dp/b0fqgg53wl/ref=sr_1_1?k=chair");
  assert.equal(product?.asin, "B0FQGG53WL");
  assert.equal(product?.host, "amazon.de");
  assert.equal(product?.site, AMAZON_SITES["amazon.de"]);

  assert.equal(parseAmazonUrl("https://www.amazon.com/gp/product/B0FQGG53WL")?.asin, "B0FQGG53WL");
  assert.equal(parseAmazonUrl("https://www.amazon.co.uk/product-reviews/B0FQGG53WL")?.host, "amazon.co.uk");
});

test("parseAmazonUrl rejects non-product and unsupported URLs", () => {
  assert.equal(parseAmazonUrl("https://www.amazon.de/s?k=chair"), null);
  assert.equal(parseAmazonUrl("https://www.example.com/dp/B0FQGG53WL"), null);
  assert.equal(parseAmazonUrl("https://www.amazon.nl/dp/B0FQGG53WL"), null); // search is supported there, price history isn't
  assert.equal(parseAmazonUrl("not a url"), null);
});

test("price-history links", () => {
  const de = AMAZON_SITES["amazon.de"]!;
  assert.equal(camelPageUrl(de, "B0FQGG53WL"), "https://de.camelcamelcamel.com/product/B0FQGG53WL");
  assert.equal(camelPageUrl(AMAZON_SITES["amazon.com"]!, "B0FQGG53WL"), "https://camelcamelcamel.com/product/B0FQGG53WL");
  assert.equal(camelPageUrl(AMAZON_SITES["amazon.in"]!, "B0FQGG53WL"), null, "CamelCamelCamel doesn't cover amazon.in");
  assert.equal(keepaPageUrl(de, "B0FQGG53WL"), "https://keepa.com/#!product/3-B0FQGG53WL");
});

test("search pages", () => {
  assert.equal(isSearchPath("/s"), true);
  assert.equal(isSearchPath("/s/ref=nb_sb_noss"), true);
  assert.equal(isSearchPath("/gp/search"), true);
  assert.equal(isSearchPath("/shipping"), false);
  assert.equal(isSearchPath("/dp/B0FQGG53WL"), false);

  assert.equal(isSearchUrl("https://www.amazon.nl/s?k=stoel"), true);
  assert.equal(isSearchUrl("https://www.amazon.de/dp/B0FQGG53WL"), false);
  assert.equal(isSearchUrl("https://www.example.com/s?k=x"), false);
});

test("productPagePatterns covers every marketplace and product path", () => {
  const patterns = productPagePatterns();
  assert.equal(patterns.length, Object.keys(AMAZON_SITES).length * 8);
  assert.ok(patterns.includes("*://*.amazon.de/dp/*"));
  assert.ok(patterns.includes("*://*.amazon.com.au/*/gp/product/*"));
});
