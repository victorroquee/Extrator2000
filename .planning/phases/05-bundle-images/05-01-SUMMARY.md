---
phase: 5
plan: "05-01"
subsystem: backend
tags: [bundle-images, detection, export, cheerio]
dependency_graph:
  requires: []
  provides: [detectBundleImages, bundleImages-in-fetch-response, bundle-image-replacement-in-export]
  affects: [server.js, /api/fetch, /api/export, /api/export-zip, buildExportHtml]
tech_stack:
  added: []
  patterns: [cheerio-dom-traversal, closest-ancestor-walk, global-attr-replacement, URL-validation]
key_files:
  created: []
  modified:
    - server.js
decisions:
  - "D-01: Walk up DOM via .closest('section, article, div') to find bundle image ancestor"
  - "D-06: First image per bundle qty wins — if result[bundle] already set, skip"
  - "T-05-01: Validate newSrc with new URL() before replacing — reject non-parseable URLs"
  - "Bundle image replacement placed before $.html() serialization inside buildExportHtml to keep cheerio-level replacements"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-13T12:21:10Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 5 Plan 01: Backend Bundle Image Detection and Export Replacement Summary

**One-liner:** Added `detectBundleImages()` using cheerio DOM traversal for bundle-keyed image detection, wired into `/api/fetch` summary, and global src/srcset replacement in `buildExportHtml()` with URL validation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add detectBundleImages function and wire into /api/fetch | a0bb001 | server.js |
| 2 | Add bundle image replacement to buildExportHtml and update export routes | 4591de5 | server.js |

## What Was Built

### Task 1 — `detectBundleImages` function

New function `detectBundleImages($, checkoutLinks)` added to `server.js` after `detectCheckoutLinks`:

- Filters checkout links to those with a non-null `bundle` property (2, 3, or 6)
- For each bundled link, resolves the element via `$(link.selector)` then walks up using `.closest('section, article, div')` per D-01
- Within that ancestor, finds the first `<img[src]>` whose `src` is non-empty and does not start with `data:` per D-03
- First match per bundle qty wins (`if (result[bundle]) continue`) per D-06
- Returns `{}` when no bundled links exist or no ancestor has a valid `<img>` per D-04

Wired into `/api/fetch` after `detectCheckoutLinks`. `bundleImages` is added to the `summary` response object. Named export `module.exports.detectBundleImages` added.

### Task 2 — Bundle image replacement in `buildExportHtml`

Extended `buildExportHtml` signature to accept `bundleImages` parameter. Replacement logic inserted after the idempotency sentinel and header injections, before `$.html()` serialization:

- Iterates `Object.entries(bundleImages)` — each entry has `{ originalSrc, newSrc }`
- Validates `newSrc` with `new URL(newSrc)` per T-05-01 threat mitigation
- Skips entries where `originalSrc === newSrc` (no-op guard)
- Replaces `src` on all matching `<img>` elements globally per D-13
- Replaces `src` on all matching `<source>` elements globally
- Replaces srcset entries on `img[srcset]` and `source[srcset]` — splits on `,`, trims, replaces per D-12

Both `/api/export` and `/api/export-zip` updated to destructure `bundleImages` from `req.body` and pass it to `buildExportHtml`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The backend emits `bundleImages` in the fetch response. The frontend UI (Plan 05-02) will consume it. The detection and replacement logic is fully wired with no placeholder values.

## Threat Flags

No new threat surface beyond what was declared in the plan's threat model (T-05-01 through T-05-03). All mitigations applied as specified.

## Self-Check: PASSED

- `server.js` exists and loads without syntax error
- `detectBundleImages` exported as function: confirmed
- `buildExportHtml` exported as function: confirmed
- Commits `a0bb001` and `4591de5` present in git log
- `grep -c "bundleImages" server.js` = 9 (>= 8 required)
- `grep -c "originalSrc" server.js` = 6 (>= 2 required)
- `grep -c "new URL(newSrc)" server.js` = 1
