// Product pages: puts "Check CamelCamelCamel" / "Check Keepa" buttons next to the price.
import { camelPageUrl, keepaPageUrl, parseAmazonUrl } from "./sites.ts";
import { getFlag, onFlagChange } from "./flags.ts";

const CONTAINER_ID = "price-tracker-buttons";

// Where to put the buttons, best spot first. Amazon renames these now and then, hence the fallbacks.
const ANCHOR_IDS = ["corePriceDisplay_desktop_feature_div", "corePrice_feature_div", "priceblock_ourprice", "price", "title"];

function priceLink(url: string, className: string, iconPath: string, alt: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.className = `price-tracker-btn ${className}`;

  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL(iconPath);
  icon.alt = alt;
  link.append(icon, ` ${label}`);
  return link;
}

function injectButtons(): void {
  if (document.getElementById(CONTAINER_ID)) return; // already there

  const product = parseAmazonUrl(location.href);
  if (!product) return;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.className = "price-tracker-container";

  const camelUrl = camelPageUrl(product.site, product.asin);
  if (camelUrl) container.append(priceLink(camelUrl, "camel-btn", "icons/camel-favicon.png", "CamelCamelCamel", "Check CamelCamelCamel"));
  container.append(priceLink(keepaPageUrl(product.site, product.asin), "keepa-btn", "icons/keepa-favicon.png", "Keepa", "Check Keepa"));

  const anchor = ANCHOR_IDS.map((id) => document.getElementById(id)).find((el) => el !== null);
  anchor?.parentNode?.insertBefore(container, anchor.nextSibling);
}

let observer: MutationObserver | null = null;

function enable(): void {
  injectButtons();
  if (observer) return;
  // Amazon re-renders parts of the page; put the buttons back if they get wiped.
  observer = new MutationObserver(() => {
    if (!document.getElementById(CONTAINER_ID)) injectButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function disable(): void {
  observer?.disconnect();
  observer = null;
  document.getElementById(CONTAINER_ID)?.remove();
}

void getFlag("showEmbeddedButtons").then((on) => on && enable());
onFlagChange("showEmbeddedButtons", (on) => (on ? enable() : disable()));
