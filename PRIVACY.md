# Privacy Policy — Toolbox for Amazon

_Last updated: 2026-10-09_

**In one sentence:** this extension does not collect, store, or transmit any personal data, to us or to anyone else.

## What the extension does

It has two features. The first works on product pages; the second on search pages.

**Price history.** On a product page at amazon.com or one of its supported international sites, the
extension reads that page's URL to identify the product, then gives you three
equivalent ways to jump to that product's price history on
[camelcamelcamel.com](https://camelcamelcamel.com) and [keepa.com](https://keepa.com) —
two independent, third-party price-tracking services:

- buttons injected next to the price on the page itself,
- the same two buttons in the toolbar popup, and
- a "Check price history" entry in the right-click menu.

**Multi-page search results.** On an Amazon search page, a toolbar lets you load
more result pages into the same page. The extension requests those pages from
the same Amazon site you are already on, using your normal browser session, and
reads each product's price, rating, review count and sponsored
label in order to filter and sort them on the page. Nothing it reads is stored
or sent anywhere, and those requests go only to Amazon.

That's the entire feature set.

## Data we collect

None. This extension has no server, no analytics, and no telemetry. Everything it
does happens locally in your browser:

- It reads the URL and title of the tab you're actively viewing — either when you
  click the toolbar icon or the right-click menu, or continuously while you're on
  an Amazon product page, so it can place the inline buttons and keep the toolbar
  icon's active/inactive state in sync.
- It never reads any other tab.
- It never sends that URL, or anything else, to us or to any server we operate —
  we don't operate one.
- The only things it stores are your preferences — whether the inline buttons and
  the search toolbar are shown, and the search toolbar's last-used settings
  (number of pages, minimum rating, minimum reviews, sort order, hide sponsored) —
  saved locally via Chrome's `storage` API. They never leave your browser.

## What happens when you click a button

Clicking "Check CamelCamelCamel" / "Check Keepa" (or their popup/menu equivalents)
simply opens a new browser tab at that site's own product page for the item you
were viewing — the same as if you had typed the address yourself. From that point
on, your interaction is with that site directly, governed by its own privacy
policy, not this extension.

## Permissions this extension requests

| Permission                                    | Why                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                   | Reads the URL and title of the tab you're currently viewing, only when you invoke the popup or menu.                                                                              |
| `tabs`                                        | Monitors the active tab's URL as you browse, so the toolbar icon can dim when you're not on an Amazon product page.                                                               |
| `contextMenus`                                | Adds the "Check price history" entry to the right-click menu on supported Amazon pages.                                                                                           |
| `storage`                                     | Saves your on/off preferences and the search toolbar's last-used settings, locally.                                                                                               |
| Host permissions (`*://*.amazon.com/*`, etc.) | Needed to inject the inline buttons on product pages and the toolbar on search pages, and for the toolbar to fetch the extra result pages you request from that same Amazon site. |

## Changes to this policy

If this extension's data practices ever change, this file will be updated and the
"last updated" date above will reflect it.

## Contact

Questions about this policy or the extension:
[support.mhdi@gmail.com](mailto:support.mhdi@gmail.com)

---

Toolbox for Amazon is an independent tool and is not affiliated with,
endorsed by, or sponsored by Amazon, CamelCamelCamel, or Keepa.
