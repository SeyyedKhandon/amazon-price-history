// Amazon URL knowledge: which marketplaces we support, how to find a product's ASIN, and where its
// price history lives on CamelCamelCamel and Keepa.

export interface AmazonSite {
  /** CamelCamelCamel region code, or null if it doesn't cover this marketplace. */
  camel: string | null;
  /** Keepa's numeric domain id. */
  keepa: number;
}

export const AMAZON_SITES: Readonly<Record<string, AmazonSite>> = {
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

export interface ParsedProductUrl {
  asin: string;
  host: string;
  site: AmazonSite;
}

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([A-Z0-9]{10})/i;

const PRODUCT_PATH_PATTERNS = ["/dp/*", "/*/dp/*", "/gp/product/*", "/*/gp/product/*", "/gp/aw/d/*", "/*/gp/aw/d/*", "/product-reviews/*", "/*/product-reviews/*"];

/** Chrome match patterns for every supported product page (used for the right-click menu). */
export function productPagePatterns(): string[] {
  return Object.keys(AMAZON_SITES).flatMap((host) => PRODUCT_PATH_PATTERNS.map((path) => `*://*.${host}${path}`));
}

function toUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Extracts the ASIN and marketplace from a product-page URL, or null if it isn't one we support. */
export function parseAmazonUrl(url: string): ParsedProductUrl | null {
  const parsed = toUrl(url);
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^www\./, "");
  const site = AMAZON_SITES[host];
  if (!site) return null;

  const match = (parsed.pathname + parsed.search).match(ASIN_RE);
  if (!match?.[1]) return null;

  return { asin: match[1].toUpperCase(), host, site };
}

export function camelPageUrl(site: AmazonSite, asin: string): string | null {
  if (!site.camel) return null;
  const domain = site.camel === "us" ? "camelcamelcamel.com" : `${site.camel}.camelcamelcamel.com`;
  return `https://${domain}/product/${asin}`;
}

export function keepaPageUrl(site: AmazonSite, asin: string): string {
  return `https://keepa.com/#!product/${site.keepa}-${asin}`;
}

/** True for a search-results path such as /s?k=chair, /s/ref=... or /gp/search. */
export function isSearchPath(pathname: string): boolean {
  return pathname === "/s" || pathname.startsWith("/s/") || pathname.startsWith("/gp/search");
}

// Search results are supported on more marketplaces than price history covers.
const SEARCH_HOST_RE = /^(?:www\.)?amazon\.(?:com|co\.uk|de|fr|co\.jp|ca|it|es|in|com\.mx|com\.au|nl|se|pl|com\.tr|ae|sa|sg|com\.br|com\.be|eg|ie)$/;

export function isSearchUrl(url: string): boolean {
  const parsed = toUrl(url);
  return !!parsed && SEARCH_HOST_RE.test(parsed.hostname) && isSearchPath(parsed.pathname);
}
