const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const actionsEl = document.getElementById("actions");
const contactEl = document.getElementById("contact");

const contactLabel = contactEl.textContent;
const enableEmbeddedBtnsEl = document.getElementById("enable-embedded-btns");

chrome.storage.sync.get({ showEmbeddedButtons: true }, (items) => {
  enableEmbeddedBtnsEl.checked = items.showEmbeddedButtons;
});

enableEmbeddedBtnsEl.addEventListener("change", (e) => {
  chrome.storage.sync.set({ showEmbeddedButtons: e.target.checked });
});

const enableSearchEl = document.getElementById("enable-search-toolbar");

chrome.storage.sync.get({ showSearchToolbar: true }, (items) => {
  enableSearchEl.checked = items.showSearchToolbar;
});

enableSearchEl.addEventListener("change", (e) => {
  chrome.storage.sync.set({ showSearchToolbar: e.target.checked });
});

contactEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(contactEl.dataset.email);
    contactEl.textContent = "Email copied!";
  } catch {
    contactEl.textContent = contactEl.dataset.email;
  }
  setTimeout(() => {
    contactEl.textContent = contactLabel;
  }, 1500);
});

function showStatus(text) {
  statusEl.textContent = text;
}

function linkButton(label, url, iconUrl) {
  const a = document.createElement("a");
  a.className = "btn";
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const icon = document.createElement("img");
  icon.src = iconUrl;
  icon.alt = "";
  icon.addEventListener("error", () => icon.remove());
  a.appendChild(icon);
  a.appendChild(document.createTextNode(label));

  return a;
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    showStatus("Couldn't read the current tab.");
    return;
  }

  const parsed = parseAmazonUrl(tab.url);
  if (!parsed) {
    showStatus(
      isSearchUrl(tab.url)
        ? "Use the Toolbox for Amazon panel at the top of the left column to load more pages, filter and sort."
        : "Open an Amazon product page for price history, or a search page for the multi-page toolbar.",
    );
    return;
  }

  const { asin, site } = parsed;
  titleEl.textContent = tab.title || asin;

  const camelPage = camelPageUrl(site, asin);
  if (camelPage) {
    actionsEl.appendChild(
      linkButton(
        "Open on CamelCamelCamel",
        camelPage,
        "icons/camel-favicon.png",
      ),
    );
  }
  actionsEl.appendChild(
    linkButton(
      "Open on Keepa",
      keepaPageUrl(site, asin),
      "icons/keepa-favicon.png",
    ),
  );

  statusEl.hidden = true;
  actionsEl.hidden = false;
}

main();
