// Service worker: the right-click "Check price history" menu, and the toolbar icon's active/dimmed state.
import { camelPageUrl, isSearchUrl, keepaPageUrl, parseAmazonUrl, productPagePatterns } from "./sites.ts";

const MENU = { root: "price-history", camel: "price-history-camel", keepa: "price-history-keepa" } as const;

const iconSet = (suffix: string): Record<string, string> =>
  Object.fromEntries(["16", "32", "48", "128"].map((size) => [size, `icons/icon${size}${suffix}.png`]));

const ACTIVE_ICONS = iconSet("");
const DIMMED_ICONS = iconSet("-inactive");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.root, title: "Check price history", contexts: ["page"], documentUrlPatterns: productPagePatterns() });
    chrome.contextMenus.create({ id: MENU.camel, parentId: MENU.root, title: "CamelCamelCamel", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU.keepa, parentId: MENU.root, title: "Keepa", contexts: ["page"] });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const product = info.pageUrl ? parseAmazonUrl(info.pageUrl) : null;
  if (!product) return;

  if (info.menuItemId === MENU.camel) {
    const url = camelPageUrl(product.site, product.asin);
    if (url) void chrome.tabs.create({ url });
  } else if (info.menuItemId === MENU.keepa) {
    void chrome.tabs.create({ url: keepaPageUrl(product.site, product.asin) });
  }
});

/** Full-colour icon on pages we work on, grey everywhere else. */
function updateIcon(tabId: number, url: string | undefined): void {
  if (!url) return;
  const active = parseAmazonUrl(url) !== null || isSearchUrl(url);
  void chrome.action.setIcon({ tabId, path: active ? ACTIVE_ICONS : DIMMED_ICONS });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateIcon(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateIcon(tabId, tab.url);
  } catch {
    // The tab was closed before we could read it.
  }
});
