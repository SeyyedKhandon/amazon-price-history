importScripts("sites.js");

const AMAZON_MATCH_PATTERNS = [];
Object.keys(AMAZON_SITES).forEach((host) => {
  ["/dp/*", "/*/dp/*", "/gp/product/*", "/*/gp/product/*", "/gp/aw/d/*", "/*/gp/aw/d/*", "/product-reviews/*", "/*/product-reviews/*"].forEach((path) => {
    AMAZON_MATCH_PATTERNS.push(`*://*.${host}${path}`);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "price-history",
      title: "Check price history",
      contexts: ["page"],
      documentUrlPatterns: AMAZON_MATCH_PATTERNS,
    });
    chrome.contextMenus.create({
      id: "price-history-camel",
      parentId: "price-history",
      title: "CamelCamelCamel",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "price-history-keepa",
      parentId: "price-history",
      title: "Keepa",
      contexts: ["page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const parsed = parseAmazonUrl(info.pageUrl);
  if (!parsed) return;
  const { asin, site } = parsed;

  if (info.menuItemId === "price-history-camel") {
    const url = camelPageUrl(site, asin);
    if (url) chrome.tabs.create({ url });
  } else if (info.menuItemId === "price-history-keepa") {
    chrome.tabs.create({ url: keepaPageUrl(site, asin) });
  }
});

function updateIcon(tabId, url) {
  if (!url) return;
  const parsed = parseAmazonUrl(url);
  if (parsed) {
    chrome.action.setIcon({
      tabId,
      path: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    });
  } else {
    chrome.action.setIcon({
      tabId,
      path: {
        "16": "icons/icon16-inactive.png",
        "32": "icons/icon32-inactive.png",
        "48": "icons/icon48-inactive.png",
        "128": "icons/icon128-inactive.png"
      }
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateIcon(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateIcon(activeInfo.tabId, tab.url);
  } catch (err) {
    // Ignore errors for non-existent tabs
  }
});
