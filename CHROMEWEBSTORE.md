# Chrome Web Store listing — Toolbox for Amazon

Reference doc for filling out the Developer Dashboard. Not shipped in the extension package.

## Single purpose

Shopping tools for Amazon: (1) on a search page, load several pages of results at once and
filter/sort them; (2) on a product page, jump straight to that product's price history on
CamelCamelCamel and Keepa — via inline buttons, the toolbar icon or a right-click menu.

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

## Permission justifications (paste into the dashboard's Permissions tab)

- **activeTab** — Used only when the user clicks the toolbar icon or the context menu, to read
  the current tab's URL and title so the extension can detect the Amazon product being viewed
  and build outbound links.
- **tabs** — Used to monitor the active URL as you browse, so the extension's icon can be dimmed when not on an Amazon product page.
- **contextMenus** — Adds the "Check price history" right-click entry (with CamelCamelCamel and
  Keepa sub-items) on Amazon product pages.
- **storage** — Required to save your settings: whether the on-page buttons and the search toolbar are enabled, and the search toolbar's last-used values (pages, rating, reviews, sort).
- **Host Permissions (`*://*.amazon.com/*`, etc.)** — Required to inject the price tracker buttons next to the price on product pages, and the multi-page toolbar on search pages (which fetches the extra result pages you request from the same Amazon site).

## Privacy practices tab

- **Data collected:** None.
- **Privacy Policy URL:** https://github.com/SeyyedKhandon/amazon-price-history/blob/main/PRIVACY.md

## Assets

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
- Small promo tile (440×280, no alpha): `store-assets/promo-tile-small-440x280.png` — "Toolbox for Amazon" with the new icon
- Marquee promo tile (1400×560, no alpha): `store-assets/promo-tile-marquee-1400x560.png` — title, tagline and the search panel
- Listing: https://chromewebstore.google.com/detail/fdebpchoageihbdifaiallkcipeooaoo (item ID `fdebpchoageihbdifaiallkcipeooaoo`)
- Promo video (optional "Global promo video" field, which takes a URL, not a file):
  https://www.youtube.com/watch?v=_BUUSi_Evqk

## Visibility

Public, per the developer's choice (2026-09-30).
