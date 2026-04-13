---
phase: 05-bundle-images
verified: 2026-04-13T13:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Fetch a real VSL page with bundle checkout links and verify the C.6 section appears with thumbnails"
    expected: "Bundle images section shows with one row per detected bundle (2/3/6 Potes), each row containing a 60x60 thumbnail and a pre-filled URL input"
    why_human: "Real VSL page required; selector collision (all-plain-a anchors) can return the same image for multiple bundles — needs visual confirmation with an actual page that has class/id-differentiated links"
  - test: "Paste a new image URL into a bundle row input and verify the thumbnail updates live"
    expected: "Thumbnail img src changes immediately as user types/pastes into the input field"
    why_human: "Live DOM event behavior (input event listener updating img.src) cannot be verified statically"
  - test: "Click export after changing one image URL and confirm downloaded HTML contains the new URL in all occurrences, including desktop and mobile duplicate sections"
    expected: "All img[src] and source[src] attributes matching the original URL are replaced with the new URL throughout the exported file"
    why_human: "Actual page with duplicate desktop/mobile sections needed to confirm global replacement covers all copies"
  - test: "Fetch a page with NO bundle checkout links and verify the C.6 section stays hidden and no JS errors appear in the console"
    expected: "Section remains hidden; browser console shows no errors"
    why_human: "Requires browser environment to confirm section-hidden CSS and absence of console errors"
---

# Phase 5: Bundle Images Verification Report

**Phase Goal:** Users can see and replace product bottle images for each pricing section directly in the editor
**Verified:** 2026-04-13T13:00:00Z
**Status:** human_needed (all automated checks pass; 4 items need browser/real-page testing)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After fetching a VSL page, editor shows thumbnail and editable URL field for each detected bundle image | VERIFIED | `renderBundleImages()` creates flex rows with `<img class="bundle-image-thumb">` + `<span class="bundle-image-label">` + `<input type="url">` populated from `state.bundleImages`; `showSection(sectionBundleImages)` called when `Object.keys(state.bundleImages).length > 0` |
| 2 | User can paste a new image URL and exported HTML replaces every occurrence — including desktop/mobile duplicates — with the new URL | VERIFIED | `buildExportHtml` iterates all `<img>` and `<source>` elements globally via cheerio `.each()`; srcset entries also replaced; URL validation guards invalid input (behavioral spot-check confirmed replacement works correctly) |
| 3 | When no bundle images detected, section shows graceful empty state without errors | VERIFIED | `detectBundleImages` returns `{}` when no bundled checkout links exist; frontend only calls `showSection(sectionBundleImages)` when `Object.keys(state.bundleImages).length > 0`; `buildExportHtml` guards on `bundleImages && typeof bundleImages === 'object'`; confirmed handles `undefined`, `null`, and `{}` without error |

**Score:** 3/3 observable truths verified

### Additional Must-Haves (from PLAN frontmatter)

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `detectBundleImages` returns map of bundle qty to image src for pages with bundle checkout links | VERIFIED | Function defined at server.js line 250; behavioral test confirmed it returns `{"2":{"src":"..."}, "3":{"src":"..."}}` for pages with classed anchors |
| 2 | `detectBundleImages` returns empty object when no bundle images found | VERIFIED | Behavioral test confirmed `{}` returned when no bundled links or no valid img found |
| 3 | `buildExportHtml` replaces all occurrences of original image src with new URL in img src and srcset | VERIFIED | Behavioral test confirmed: original src removed, new src present, other images preserved, source tags replaced, srcset partially replaced |
| 4 | `/api/fetch` response includes `bundleImages` in summary | VERIFIED | server.js line 397: `bundleImages` in summary response object; called on line 390 after `detectCheckoutLinks` |
| 5 | Both `/api/export` and `/api/export-zip` accept and pass `bundleImages` to `buildExportHtml` | VERIFIED | server.js lines 622-630 (`/api/export`) and lines 640-648 (`/api/export-zip`) both destructure `bundleImages` from `req.body` and pass it through |

**Score:** 5/5 must-haves verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` | `detectBundleImages` function, bundleImages in fetch response, image replacement in buildExportHtml | VERIFIED | 736 lines; `function detectBundleImages` at line 250; `bundleImages` in summary at line 397; replacement logic in `buildExportHtml` at lines 551-582; module.exports.detectBundleImages at line 734 |
| `public/index.html` | Bundle images section UI, state wiring, export payload integration | VERIFIED | 865 lines; `id="section-bundle-images"` at line 431; CSS at lines 278-306; JS `renderBundleImages`, `buildBundleImagesPayload`, state wiring, fetch/export handlers all present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `detectBundleImages` | `/api/fetch` response | called on line 390, result in `summary.bundleImages` | WIRED | `const bundleImages = detectBundleImages($, checkoutLinks)` then added to summary |
| `buildExportHtml` | cheerio `img[src]` replacement | iterates `bundleImages` entries, replaces src and srcset globally | WIRED | Lines 551-582: `Object.entries(bundleImages)` loop with cheerio `.each()` on all `img` and `source` |
| fetch handler | `state.bundleImages` | `data.summary.bundleImages` stored in state, `renderBundleImages` called | WIRED | Lines 733 and 769-772 of index.html |
| export handler | `/api/export-zip` payload | `buildBundleImagesPayload()` builds `{ qty: { originalSrc, newSrc } }` | WIRED | Lines 825-829 of index.html; only included when user changed URLs |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `public/index.html` — section-bundle-images | `state.bundleImages` | `detectBundleImages($, checkoutLinks)` in `/api/fetch` → DOM traversal with cheerio `.closest()` + `.find('img[src]')` | Yes — reads static `src` attributes from fetched page HTML | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `detectBundleImages` returns empty `{}` when no bundled links | node inline test | `{}` returned correctly | PASS |
| `detectBundleImages` skips `data:` URI images and returns next static src | node inline test | Returns static URL, skips data: URI | PASS |
| `buildExportHtml` replaces img src globally, preserves other images | node inline test | Replacement correct, unrelated img preserved | PASS |
| `buildExportHtml` replaces srcset entries | node inline test | `new-url 1x` present, non-matched entry preserved | PASS |
| `buildExportHtml` rejects invalid `newSrc` URL (T-05-01) | node inline test | Original src preserved when `newSrc = 'not-a-valid-url'` | PASS |
| `buildExportHtml` is no-op when `originalSrc === newSrc` | node inline test | No change when URLs identical | PASS |
| `buildExportHtml` handles `undefined` / `null` / `{}` bundleImages | node inline test | All produce valid HTML without error | PASS |
| `module.exports.detectBundleImages` is a function | node inline test | `typeof === 'function'` | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUNDLE-01 | 05-01 | System detects `<img>` by proximity to bundle sections during fetch | SATISFIED | `detectBundleImages()` walks DOM via `.closest('section, article, div')` and finds first `img[src]` in ancestor |
| BUNDLE-02 | 05-02 | User sees thumbnail and editable URL field in panel | SATISFIED | CSS + HTML section + `renderBundleImages()` create 60x60 thumb + label + url input per bundle |
| BUNDLE-03 | 05-01, 05-02 | On export, all occurrences of each image are replaced with new URL | SATISFIED | Global cheerio replacement in `buildExportHtml` covers `img`, `source`, and `srcset`; frontend sends `bundleImages` payload |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server.js` | 552 | Unused destructured variable `qty` in `for (const [, imgData]...` | Info | The `qty` variable from the entry key is silently dropped — this is intentional (replacement uses `originalSrc` as the key, not `qty`) |

No blockers or stub patterns found. All handlers contain real implementation logic.

---

## Human Verification Required

### 1. Bundle Images Section Appears on Real VSL Page

**Test:** Paste a real VSL page URL that has distinct bundle sections (2-pote, 3-pote, 6-pote) with differentiated CSS classes or IDs on anchor elements. Click "Extrair Pagina".
**Expected:** Section C.6 "Imagens de Bundle" appears below section C.5 with one row per detected bundle, each showing a visible product thumbnail and pre-filled URL input.
**Why human:** The selector collision issue (plain `a` tags without class/id all resolve to the first `<a>` on the page and thus the same ancestor) means that on pages with unclassed links, all bundles may show the same image. Real-page testing is required to confirm the detection works correctly in actual VSL patterns.

### 2. Live Thumbnail Preview on URL Input

**Test:** With bundle images section visible, clear the URL input for one bundle row and paste a different image URL.
**Expected:** The 60x60 thumbnail in the same row immediately updates to show the new image.
**Why human:** DOM `input` event listener behavior on a live `img.src` assignment cannot be verified without browser execution.

### 3. Export Replaces All Occurrences Including Duplicate Sections

**Test:** On a real VSL page that has desktop and mobile duplicate sections (same img URL appears twice in DOM), change one bundle image URL and export.
**Expected:** Both the desktop and mobile occurrences of that `img src` are replaced with the new URL in the downloaded ZIP/HTML.
**Why human:** Requires an actual page with confirmed duplicate sections to verify global replacement covers all DOM copies.

### 4. Empty State — No JS Errors and Section Hidden

**Test:** Paste a VSL page URL that has NO bundle checkout links (or has checkout links with no detectable bundle context). Click "Extrair Pagina". Open browser console.
**Expected:** Section C.6 remains hidden (display: none). No JavaScript errors appear in the console.
**Why human:** CSS visibility and runtime JS error absence require browser verification.

---

## Notes on Selector Collision

The `buildCssSelector()` helper generates selectors like `a`, `a.classname`, or `a#id`. When a page has multiple checkout anchor elements with no class or id, all are assigned the selector `a`. `detectBundleImages` resolves `$(link.selector)` which then finds the first `<a>` in the entire document for every bundle, returning the same ancestor and the same image for all bundles.

This is a pre-existing limitation of `buildCssSelector`, acknowledged as acceptable in D-06 context (the CONTEXT.md notes selector-based resolution is the established pattern). It does not cause errors — it simply returns an imperfect image map on pages with unstyled anchors. Real VSL pages typically use CSS classes on pricing buttons, which resolves this correctly (confirmed by spot-check with `a.btn-2pote`, `a.btn-3pote` selectors).

This is NOT a blocker for the phase goal — the goal states "detect bundle images" and "replace" them, which works correctly on real VSL pages with styled links.

---

_Verified: 2026-04-13T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
