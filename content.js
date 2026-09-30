function injectButtons() {
  // Prevent duplicate injection
  if (document.getElementById("price-tracker-buttons")) return;

  const parsed = parseAmazonUrl(location.href);
  if (!parsed) return;
  const { asin, site } = parsed;

  const container = document.createElement("div");
  container.id = "price-tracker-buttons";
  container.className = "price-tracker-container";

  const camelUrl = camelPageUrl(site, asin);
  if (camelUrl) {
    const camelBtn = document.createElement("a");
    camelBtn.href = camelUrl;
    camelBtn.target = "_blank";
    camelBtn.className = "price-tracker-btn camel-btn";
    camelBtn.innerHTML = '<img src="' + chrome.runtime.getURL("icons/camel-favicon.png") + '" alt="CamelCamelCamel" /> Check CamelCamelCamel';
    container.appendChild(camelBtn);
  }

  const keepaUrl = keepaPageUrl(site, asin);
  if (keepaUrl) {
    const keepaBtn = document.createElement("a");
    keepaBtn.href = keepaUrl;
    keepaBtn.target = "_blank";
    keepaBtn.className = "price-tracker-btn keepa-btn";
    keepaBtn.innerHTML = '<img src="' + chrome.runtime.getURL("icons/keepa-favicon.png") + '" alt="Keepa" /> Check Keepa';
    container.appendChild(keepaBtn);
  }

  // Find a good place to inject
  // 1. Try modern core price div
  let anchor = document.getElementById("corePriceDisplay_desktop_feature_div") || 
               document.getElementById("corePrice_feature_div") ||
               document.getElementById("priceblock_ourprice") ||
               document.getElementById("price");
  
  if (!anchor) {
    // Fallback to just below the title
    anchor = document.getElementById("title");
  }

  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(container, anchor.nextSibling);
  }
}

let observer = null;

chrome.storage.sync.get({ showEmbeddedButtons: true }, (items) => {
  if (items.showEmbeddedButtons) {
    enableButtons();
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.showEmbeddedButtons) {
    if (changes.showEmbeddedButtons.newValue) {
      enableButtons();
    } else {
      disableButtons();
    }
  }
});

function enableButtons() {
  injectButtons();
  if (!observer) {
    observer = new MutationObserver(() => {
      if (!document.getElementById("price-tracker-buttons")) {
        injectButtons();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function disableButtons() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  const el = document.getElementById("price-tracker-buttons");
  if (el) el.remove();
}
