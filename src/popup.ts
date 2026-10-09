// Toolbar popup: price-history links for the current product, plus the two on/off switches.
import { camelPageUrl, isSearchUrl, keepaPageUrl, parseAmazonUrl } from "./sites.ts";
import { type FlagName, getFlag, setFlag } from "./flags.ts";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`popup.html is missing #${id}`);
  return el as T;
}

const statusEl = byId("status");
const titleEl = byId("title");
const actionsEl = byId("actions");
const contactEl = byId<HTMLButtonElement>("contact");

/** Binds a checkbox to a stored flag: shows its saved value and saves changes. */
async function bindSwitch(id: string, flag: FlagName): Promise<void> {
  const input = byId<HTMLInputElement>(id);
  input.checked = await getFlag(flag);
  input.addEventListener("change", () => void setFlag(flag, input.checked));
}

function bindContactButton(): void {
  const label = contactEl.textContent;
  contactEl.addEventListener("click", async () => {
    const email = contactEl.dataset["email"] ?? "";
    try {
      await navigator.clipboard.writeText(email);
      contactEl.textContent = "Email copied!";
    } catch {
      contactEl.textContent = email;
    }
    setTimeout(() => (contactEl.textContent = label), 1500);
  });
}

function linkButton(label: string, url: string, iconPath: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "btn";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const icon = document.createElement("img");
  icon.src = iconPath;
  icon.alt = "";
  icon.addEventListener("error", () => icon.remove());
  link.append(icon, label);
  return link;
}

async function showCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    statusEl.textContent = "Couldn't read the current tab.";
    return;
  }

  const product = parseAmazonUrl(tab.url);
  if (!product) {
    statusEl.textContent = isSearchUrl(tab.url)
      ? "Use the Toolbox for Amazon panel at the top of the left column to load more pages, filter and sort."
      : "Open an Amazon product page for price history, or a search page for the multi-page toolbar.";
    return;
  }

  titleEl.textContent = tab.title || product.asin;

  const camelUrl = camelPageUrl(product.site, product.asin);
  if (camelUrl) actionsEl.append(linkButton("Open on CamelCamelCamel", camelUrl, "icons/camel-favicon.png"));
  actionsEl.append(linkButton("Open on Keepa", keepaPageUrl(product.site, product.asin), "icons/keepa-favicon.png"));

  statusEl.hidden = true;
  actionsEl.hidden = false;
}

void bindSwitch("enable-embedded-btns", "showEmbeddedButtons");
void bindSwitch("enable-search-toolbar", "showSearchToolbar");
bindContactButton();
void showCurrentTab();
