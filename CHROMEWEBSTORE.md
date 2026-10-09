# Chrome Web Store listing — Toolbox for Amazon

Reference doc for filling out the Developer Dashboard. Not shipped in the extension package.

## Single purpose (paste into the dashboard)

> Help shoppers find and evaluate products on Amazon before they buy. On search-result pages, it lets users view several pages of results together and filter and sort them by rating, review count and price. On product pages, it links straight to that product's price history on CamelCamelCamel and Keepa. Both features run only on Amazon shopping pages and exist for one goal: helping the user decide what to buy.

## Store listing copy

- **Name:** Toolbox for Amazon
- **Category:** Shopping
- **Short description** (132 char max):
  > See several pages of Amazon results at once, filter and sort them, and check price history in one click.
- **Detailed description:**
  > MORE RESULTS AT ONCE: Amazon shows one page of search results at a time. Toolbox for Amazon adds a
  > toolbar to search pages that loads as many pages as you want into one grid, then lets you filter
  > by rating, reviews and price, sort the combined list (price, rating, most reviews, or a weighted
  > "best rated"), and hide sponsored results.
  >
  > PRICE HISTORY: See a product's price history before you buy. Click the toolbar icon on any Amazon product
  > page — or right-click and choose "Check price history" — to open that exact product on
  > CamelCamelCamel and Keepa, two independent price-tracking sites.
  >
  > Price history supports amazon.com, .co.uk, .de, .fr, .it, .es, .ca, .co.jp, .in, .com.mx, and .com.au.
  > The search toolbar also works on .nl, .se, .pl, .ie, .com.br, .com.tr, .ae, .sa, .sg, .com.be and .eg.
  >
  > This extension collects no data of any kind. The search toolbar only requests extra result pages
  > from Amazon itself, at your request. Full privacy policy linked below.
  >
  > Not affiliated with Amazon, CamelCamelCamel, or Keepa.

## Version History

- **1.1.0** — Added the multi-page search toolbar (pages, rating, reviews, price, sort, hide sponsored); renamed to Toolbox for Amazon.
- **1.0.3** — Injected quick-access buttons directly onto Amazon product pages next to the price.
- **1.0.2** — Context menu is now only shown on product pages (hidden on cart/checkout pages).
- **1.0.1** — Extension icon now dims to grayscale when not actively browsing an Amazon product page.

## Permission justifications (paste into the dashboard's Privacy practices tab)

**activeTab**
> Used when the user clicks the toolbar icon to open the popup. The extension reads the URL and title of the tab being viewed, only to detect whether it is an Amazon product or search page and, on a product page, to build the links to that product's price history on CamelCamelCamel and Keepa. Nothing is collected, stored or sent anywhere.

**contextMenus**
> Adds one right-click entry, "Check price history", with CamelCamelCamel and Keepa sub-items. It appears only on Amazon product pages. Choosing an item opens that product's price-history page on the chosen site in a new tab. This is the only use of the permission.

**tabs**
> Used only to read the URL of the active tab, so the extension can tell whether it is an Amazon product or search page. This lets the toolbar icon show as active on those pages and dimmed elsewhere, and lets the popup show the right links. URLs are checked locally in the browser and are never stored, logged or transmitted. No browsing history is collected.

**storage**
> Saves the user's own preferences in the browser: whether the price-history buttons and the multi-page search toolbar are shown (chrome.storage.sync, so the choice follows the user across devices), and the search toolbar's last-used settings such as number of pages, minimum rating, minimum reviews, sort order and hide-sponsored (chrome.storage.local). No personal data, browsing history or Amazon product information is stored or transmitted.

**Host permission**
> Content scripts run on Amazon product pages, to add the CamelCamelCamel and Keepa quick-access buttons next to the price, and on Amazon search-result pages, to add the filter panel above Amazon's own filters. To show several results pages at once, the panel requests the next result pages from the same Amazon site the user is already on, using their normal session, and merges the products into the page. These requests go only to Amazon. No data is collected, stored or sent to any other server.

**Remote code:** No. All code ships in the package. The only network request is the search toolbar fetching more Amazon result pages (HTML data, parsed and never executed) from the same Amazon site.

## Privacy practices tab

- **Data collected:** None.
- **Privacy Policy URL:** https://github.com/SeyyedKhandon/amazon-price-history/blob/main/PRIVACY.md

## Assets

- Package to upload: run `npm run package`, then upload `release/toolbox-for-amazon-<version>.zip` (the built `dist/` folder)
- Icons: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`
- Screenshots (1280×800, 24-bit PNG, no alpha) in `store-assets/`. The store allows 5; upload in this order.
  Captions/alt text are for the listing and accessibility notes:
  1. `screenshot-1-search-toolbar.png` — "See 5 pages of results at once". Alt: Amazon search results with the
     Toolbox for Amazon panel in the left column (pages in total, results count, pages-at-once, rating and
     reviews sliders, price range, sort menu).
  2. `screenshot-2-settings-popup.png` — "Price history and settings, one click away". Alt: Toolbar popup on a
     product page with Open on CamelCamelCamel and Open on Keepa buttons, and switches for price-history
     buttons and the multi-page search toolbar.
  3. `screenshot-3-inline-buttons.png` — "Buttons appear next to the price". Alt: Check CamelCamelCamel and
     Check Keepa buttons under a product title.
  4. `screenshot-4-context-menu.png` — "Right-click to check price history". Alt: Context menu with
     CamelCamelCamel and Keepa sub-items.
  5. `screenshot-5-camelcamelcamel.png` — "Jump straight to the price history". Alt: CamelCamelCamel chart
     for the product.
  Retired (outdated UI or over the 5-screenshot limit): `store-assets/archive/`.
- Small promo tile (440×280, 24-bit PNG, no alpha): `store-assets/promo-tile-small-440x280.png` — name and tagline, with the search panel and the CamelCamelCamel and Keepa charts
- Marquee promo tile (1400×560, 24-bit PNG, no alpha): `store-assets/promo-tile-marquee-1400x560.png` — name, tagline and icon, with the search panel and both price-history charts (labelled "Search toolbar", "CamelCamelCamel", "Keepa")
- Listing: https://chromewebstore.google.com/detail/fdebpchoageihbdifaiallkcipeooaoo (item ID `fdebpchoageihbdifaiallkcipeooaoo`)
- Promo video (optional "Global promo video" field, which takes a URL, not a file):
  https://www.youtube.com/watch?v=_BUUSi_Evqk

## Visibility

Public, per the developer's choice (2026-09-30).
