---
phase: 08
slug: folder-upload
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js manual test script (existing pattern in project) |
| **Config file** | none — inline test assertions |
| **Quick run command** | `node test-integration.js` |
| **Full suite command** | `node test-integration.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test-integration.js` (or manual curl test)
- **After Wave 0:** Confirm server starts without errors and existing /api/fetch still works
- **After Wave 1:** Confirm /api/upload-folder returns same response shape as /api/fetch
- **After Wave 2:** Confirm export-zip with uploadSessionId includes uploaded assets

---

## Validation Dimensions

### 1. Upload endpoint accepts folder files
- POST `/api/upload-folder` with multipart/form-data containing files[] + paths[]
- Returns `{ html, summary, checkoutLinks, bundleImages, delayInfo, uploadSessionId }`
- Returns 400 if no index.html in uploaded files

### 2. Pipeline equivalence
- Processed HTML from upload is identical in structure to /api/fetch for same content
- cleanHtml, detectCheckoutLinks, detectBundleImages, detectVturbDelay all run

### 3. Export ZIP includes uploaded assets
- POST `/api/export-zip` with `uploadSessionId` includes all uploaded asset files
- Directory structure is preserved (e.g., `assets/style.css` stays in `assets/`)

### 4. Security: no path traversal
- Filenames with `../` are sanitized before storing
- Only allowed file types are accepted (.html, .css, .js, .jpg, .jpeg, .png, .gif, .svg, .webp, .woff, .woff2, .ttf)

### 5. UI tab toggle
- "URL" tab shows existing URL input
- "Pasta de Arquivos" tab shows file selector, hides URL input
- Both tabs correctly trigger their respective fetch flows

### 6. Existing URL flow unaffected
- /api/fetch continues to work after changes
- /api/export and /api/export-zip with pageUrl still work

---

## Regression Guard

The following existing behaviors MUST still work after Phase 8:
- POST /api/fetch with URL → cleanHtml + detect
- POST /api/export → single HTML file download
- POST /api/export-zip with pageUrl → ZIP with assets from URL
- All Phase 4–7 features (delay, bundle images, extra scripts, checkout detection)
