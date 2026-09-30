# Privacy Policy — Price History for Amazon

_Last updated: 2026-09-30_

**In one sentence:** this extension does not collect, store, or transmit any personal data, to us or to anyone else.

## What the extension does

On a product page at amazon.com or one of its supported international sites, the
extension reads that page's URL to identify the product, then gives you three
equivalent ways to jump to that product's price history on
[camelcamelcamel.com](https://camelcamelcamel.com) and [keepa.com](https://keepa.com) —
two independent, third-party price-tracking services:

- buttons injected next to the price on the page itself,
- the same two buttons in the toolbar popup, and
- a "Check price history" entry in the right-click menu.

That's the entire feature.

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
- The only thing it stores is a single on/off preference (whether the inline
  buttons are shown), saved locally via Chrome's `storage` API. That preference
  never leaves your browser.

## What happens when you click a button

Clicking "Check CamelCamelCamel" / "Check Keepa" (or their popup/menu equivalents)
simply opens a new browser tab at that site's own product page for the item you
were viewing — the same as if you had typed the address yourself. From that point
on, your interaction is with that site directly, governed by its own privacy
policy, not this extension.

## Permissions this extension requests

| Permission | Why |
|---|---|
| `activeTab` | Reads the URL and title of the tab you're currently viewing, only when you invoke the popup or menu. |
| `tabs` | Monitors the active tab's URL as you browse, so the toolbar icon can dim when you're not on an Amazon product page. |
| `contextMenus` | Adds the "Check price history" entry to the right-click menu on supported Amazon pages. |
| `storage` | Saves your on/off preference for the inline buttons, locally. |
| Host permissions (`*://*.amazon.com/*`, etc.) | Needed to inject the inline buttons next to the price on Amazon product pages. |

## Changes to this policy

If this extension's data practices ever change, this file will be updated and the
"last updated" date above will reflect it.

## Contact

Questions about this policy or the extension:
[support.mhdi@gmail.com](mailto:support.mhdi@gmail.com)

---

Price History for Amazon is an independent tool and is not affiliated with,
endorsed by, or sponsored by Amazon, CamelCamelCamel, or Keepa.
