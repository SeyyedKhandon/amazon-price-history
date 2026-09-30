# Chrome Web Store listing — Price History for Amazon

Reference doc for filling out the Developer Dashboard. Not shipped in the extension package.

## Single purpose

Lets a shopper on an Amazon product page jump straight to that same product's price-history
page on CamelCamelCamel and Keepa — via the toolbar icon or a right-click context menu. Nothing else.

## Store listing copy

- **Name:** Price History for Amazon
- **Category:** Shopping
- **Short description** (132 char max):
  > Jump from any Amazon product page straight to its price history on CamelCamelCamel and Keepa.
- **Detailed description:**
  > See a product's price history before you buy. Click the toolbar icon on any Amazon product
  > page — or right-click and choose "Check price history" — to open that exact product on
  > CamelCamelCamel and Keepa, two independent price-tracking sites.
  >
  > Supports amazon.com, .co.uk, .de, .fr, .it, .es, .ca, .co.jp, .in, .com.mx, and .com.au.
  >
  > This extension collects no data of any kind. It reads the current tab's URL only when you
  > click it, to build the links, and does nothing else. Full privacy policy linked below.
  >
  > Not affiliated with Amazon, CamelCamelCamel, or Keepa.

## Version History
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
- **storage** — Required to save your settings, such as whether the on-page buttons are enabled.
- **Host Permissions (`*://*.amazon.com/*`, etc.)** — Required to inject the price tracker buttons directly onto the Amazon product pages next to the price.

## Privacy practices tab

- **Data collected:** None.
- **Privacy Policy URL:** https://github.com/SeyyedKhandon/amazon-price-history/blob/main/PRIVACY.md

## Assets

- Icons: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`
- Screenshots (1280×800, 24-bit PNG, no alpha) in `store-assets/`: `screenshot-1-popup.png`,
  `screenshot-2-context-menu.png`, `screenshot-3-inline-buttons.png`, `screenshot-4-keepa.png`,
  `screenshot-5-camelcamelcamel.png`
- Small promo tile (440×280, no alpha): `store-assets/promo-tile-small-440x280.png`
- Marquee promo tile (1400×560, no alpha): `store-assets/promo-tile-marquee-1400x560.png`
- Promo video (optional "Global promo video" field, which takes a URL, not a file):
  https://www.youtube.com/watch?v=_BUUSi_Evqk

## Visibility

Public, per the developer's choice (2026-09-30).
