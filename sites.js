// Maps an Amazon hostname to the region codes camelcamelcamel and Keepa use.
const AMAZON_SITES = {
  "amazon.com": { camel: "us", keepa: 1 },
  "amazon.co.uk": { camel: "uk", keepa: 2 },
  "amazon.de": { camel: "de", keepa: 3 },
  "amazon.fr": { camel: "fr", keepa: 4 },
  "amazon.co.jp": { camel: null, keepa: 5 },
  "amazon.ca": { camel: "ca", keepa: 6 },
  "amazon.it": { camel: "it", keepa: 8 },
  "amazon.es": { camel: "es", keepa: 9 },
  "amazon.in": { camel: null, keepa: 10 },
  "amazon.com.mx": { camel: null, keepa: 11 },
  "amazon.com.au": { camel: null, keepa: 12 },
};

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([A-Z0-9]{10})/i;

function parseAmazonUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const site = AMAZON_SITES[host];
  if (!site) return null;

  const match = (parsed.pathname + parsed.search).match(ASIN_RE);
  if (!match) return null;

  return { asin: match[1].toUpperCase(), host, site };
}

function camelPageUrl(site, asin) {
  if (!site.camel) return null;
  const subdomain = site.camel === "us" ? "camelcamelcamel.com" : `${site.camel}.camelcamelcamel.com`;
  return `https://${subdomain}/product/${asin}`;
}

function keepaPageUrl(site, asin) {
  return `https://keepa.com/#!product/${site.keepa}-${asin}`;
}
