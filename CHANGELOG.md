# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1]

### Added

- README with install/usage instructions.
- MIT License, ahead of open-sourcing the project.

## [1.0.0]

### Changed

- Renamed the extension from "Amazon Price History" to "Price History for
  Amazon" so its name doesn't lead with a trademarked name.
- The CamelCamelCamel and Keepa icons are now bundled locally instead of
  hotlinked from their sites, so the popup makes no third-party network
  requests when it opens.

### Added

- `CHROMEWEBSTORE.md` with Chrome Web Store listing copy, permission
  justifications, and privacy documentation.

## [0.5.0]

### Added

- "Contact developer" link in the popup footer.

## [0.4.0]

### Changed

- The popup now shows two direct links ("Open on CamelCamelCamel" / "Open on
  Keepa") instead of embedding charts, for a simpler, faster popup.

### Removed

- Inline chart embeds, the Keepa API key options page, and the `scripting`
  and `storage` permissions they required.

## [0.3.0]

### Added

- Toolbar and Chrome Web Store icon set (16/32/48/128px).
- CamelCamelCamel and Keepa favicons next to their respective sections in the
  popup, for attribution.

### Fixed

- The context menu no longer opens a broken CamelCamelCamel search link when
  right-clicking a marketplace CamelCamelCamel doesn't cover (e.g. amazon.co.jp).
- Context menu items are cleared before being recreated on install/update,
  preventing a duplicate-ID error.

## [0.2.0]

### Added

- Right-click "Check price history" context menu on Amazon product pages, with
  CamelCamelCamel and Keepa sub-items that jump straight to that product's page
  on each site.

## [0.1.0]

### Added

- Initial release. Clicking the toolbar icon on an Amazon product page reads the
  page's ASIN and shows the product's [CamelCamelCamel](https://camelcamelcamel.com)
  price-history chart inline.
- Optional Keepa API key, set on an options page, renders an inline Keepa chart
  alongside it.
- Marketplace support: amazon.com, .co.uk, .de, .fr, .co.jp, .ca, .it, .es, .in,
  .com.mx, .com.au.
