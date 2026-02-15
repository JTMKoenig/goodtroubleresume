# Materials Finder (Chrome Extension, MV3)

Materials Finder is a popup-only Chrome extension that scans the current page DOM for clothing material composition text such as `100% cotton` or `55% linen, 45% cotton`.

## What it does

- Runs on any website via a content script.
- Extracts materials using DOM text heuristics (leaf scan first, container fallback).
- Shows results in the popup:
  - `Materials: <composition>` when found.
  - `No materials found on this page` when not found.
- Displays source and confidence metadata.

## Project structure

- `manifest.json`
- `src/content.js`
- `src/popup.html`
- `src/popup.js`
- `src/popup.css`

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder (`goodtroubleresume`).
5. Pin the extension if desired.

## Test manually

1. Open a product page (Nike, Ralph Lauren, Calvin Klein suggested).
2. Click the extension icon.
3. Verify popup output shows `Materials: ...` on product pages.
4. Open a non-product page (homepage, blog, etc.).
5. Verify popup output shows `No materials found on this page`.

## Notes

- Extraction is DOM-based only in this MVP (no JSON-LD parsing yet).
- Matching logic requires both:
  - a percentage pattern (`\b\d{1,3}\s*%`)
  - a known fiber keyword (cotton, linen, wool, etc.)
- Promotion-like strings are filtered (e.g., sale, discount, `% off`).
