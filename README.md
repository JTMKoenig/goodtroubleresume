# Materials Finder (Chrome Extension, MV3)

Materials Finder is a proof-of-concept Chrome extension I built to make finding clothing materials easier while shopping online.

On many ecommerce sites, material information is buried in multiple tabs/accordions, so users have to click around and scan long product pages. This extension reduces that friction to one click: open the popup and see the extracted composition immediately.

## Problem and motivation

When shopping for clothes, material composition matters for comfort, quality, care requirements, and allergies. In practice, many sites make this data hard to find.

This project focuses on solving that user pain point with a lightweight browser extension that:

- pulls likely material composition text from the current product page,
- explains where the data came from,
- and provides a confidence signal for the extracted result.

## Current functionality

- Runs on any website via a content script.
- Popup requests extraction from the active tab.
- Returns either:
  - `Materials: <composition>`
  - or `No materials found on this page`
- Displays metadata:
  - `source`: `jsonld`, `dom_leaf`, `dom_container`, or `none`
  - `confidence`: `high`, `medium`, `low`, or `none`

## How extraction works

The extractor evaluates all three sources on each run, then selects the best candidate by score.

### 1) JSON-LD parsing (`source: jsonld`)

Parses `script[type="application/ld+json"]` and traverses nested data (including `@graph` and `hasVariant`) for product nodes and material-like fields.

### 2) DOM leaf extraction (`source: dom_leaf`)

Scans likely leaf nodes (`li`, `dd`, `p`, `span`, `td`) for short composition phrases such as `100% cotton` or labeled specs like `Shell: 100% wool`.

### 3) DOM container extraction (`source: dom_container`)

Scans broader containers (`section`, `article`, `div`), splits long text into chunks, and evaluates each chunk for material signals.

## Filtering and scoring

Candidates are normalized, deduplicated, filtered, and scored.

- Filters remove promo language and noisy long-form description content.
- Scoring favors percentage/fiber-rich material strings and penalizes prose-heavy or overly long text.
- Highest-scoring candidate is shown in the popup.

## Future vision

A next step is adding a user-defined **allow list / preference list** of materials, then evaluating the current product against that list.

Example outcomes in the popup:

- ✅ Matches your criteria (e.g., cotton, linen)
- ⚠️ Contains materials you want to avoid
- ❓ Material data unavailable

This would make shopping more accessible for people with fabric allergies or strong material preferences.

## Install (unpacked)

1. Open Chrome at `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.

## Quick manual verification

1. Open a product page with JSON-LD material fields and verify `source: jsonld` can appear.
2. Open a page with visible composition text and verify `dom_leaf` or `dom_container` can appear.
3. Open a non-product page and verify no-result handling.

## Project structure

- `manifest.json`
- `src/content.js`
- `src/popup.html`
- `src/popup.js`
- `src/popup.css`
