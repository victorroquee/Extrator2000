# Technology Stack

**Project:** VSL Cloner v1.1 — Extra Scripts, Bundle Images, VTURB Delay
**Researched:** 2026-04-11
**Scope:** NEW feature stack only — existing capabilities are already validated and in production.

---

## Verdict: No New npm Packages Required

All three new features are fully implementable with the existing dependency set:
- **cheerio ^1.0.0** — already handles all server-side HTML/DOM needs
- **Vanilla JS + innerHTML/DOM API** — already the established frontend pattern
- **Node.js built-ins (RegExp)** — sufficient for JS variable extraction

Do NOT add new packages. The constraint "Node.js + Express + axios + cheerio, sem frameworks adicionais" applies and there is no capability gap that requires filling.

---

## Feature 1: Extra Scripts (dynamic script list in `<head>`)

### Server side
No new capability needed. `buildExportHtml` already does:
```js
if (headerPixel && headerPixel.trim()) $('head').append(headerPixel);
```
Adding extra scripts is the same pattern: accept an array of script strings in the export payload, iterate, and append each to `<head>` after the pixel block. Cheerio's `$('head').append(scriptString)` handles arbitrary HTML strings including multi-line `<script>` tags.

### Frontend
The existing dynamic checkout inputs pattern (`renderCheckoutInputs`) already demonstrates how to build a dynamic list of inputs with add/remove controls using `document.createElement` and `innerHTML`. Apply the same pattern for the extra scripts list: a `<div id="extra-scripts-container">` with a textarea per script entry and an "Add script" button.

No new libraries. No new patterns beyond what already exists.

**Integration point:** `buildExportHtml` signature gains an `extraScripts` array parameter. Each item is appended to `<head>` after `headerPixel`.

---

## Feature 2: Bundle Images (detect `<img>` inside bundle sections, preview + editable URL)

### Server side — cheerio image detection

Cheerio's `$('img')` selector is already used in `collectAssets` (line 358 of server.js). For bundle image detection the approach is:

1. For each bundle section detected (using existing `BUNDLE_KEYWORDS` logic applied to section containers), collect `$(sectionEl).find('img')` and extract `.attr('src')`.
2. Return the list of `{ src, sectionIndex, bundleQty }` objects in the `/api/fetch` response alongside `checkoutLinks`.
3. On export, replace image `src` attributes: use cheerio to find the same `<img>` nodes by index/src and set the new URL. Because pages may have duplicate bundle sections (same image appearing N times), iterate with `$('img[src="ORIGINAL_SRC"]').attr('src', newSrc)` to replace all occurrences at once — this is exactly what cheerio's multi-match selectors do natively.

No new packages needed. Cheerio already supports attribute-equality selectors.

### Frontend — thumbnail preview

Browser `<img>` element with `src` set to the detected URL, rendered inside the card. This is vanilla HTML. The user edits the URL in a text input (same style as checkout inputs); on input change, update the preview `<img>` src live via an `input` event listener. This is a well-established vanilla JS pattern requiring zero libraries.

**Deduplication concern:** if the same image appears in multiple bundle section duplicates, the server returns one entry per unique `src` value (deduplicate by src during detection). On export, replacing by src attribute value replaces all occurrences automatically.

**Integration point:** `/api/fetch` response gains a `bundleImages` array: `[{ src, bundleQty, label }]`. `/api/export` (and `/api/export-zip` via `buildExportHtml`) gains a `bundleImages` parameter and applies src replacements before returning.

---

## Feature 3: VTURB Delay (extract and edit `var delaySeconds = N`)

### Server side — regex extraction

The target pattern is:
```
var delaySeconds = 5
```
inside a `<script>` block that also contains `displayHiddenElements`. This is a pure regex operation on the raw HTML string or on cheerio's `.html()` of a script element.

Extraction regex (zero new deps):
```js
const match = scriptContent.match(/var\s+delaySeconds\s*=\s*(\d+)/);
const delaySeconds = match ? parseInt(match[1], 10) : null;
```

Detection strategy: iterate `$('script')` in `cleanHtml` or in a new `detectVturvDelay` helper, check if `$(el).html()` includes `displayHiddenElements` AND matches the regex above.

Replacement on export:
```js
outputHtml = outputHtml.replace(
  /var\s+delaySeconds\s*=\s*\d+/,
  `var delaySeconds = ${newValue}`
);
```
This is a single `String.replace` call. No cheerio needed — script content replacement via string regex is simpler and safer than round-tripping through the HTML parser (cheerio can mangle inline script text in edge cases).

### Frontend

An `<input type="number" min="0">` with a label "Delay VTURB (segundos)". Pre-populated with the extracted value returned by `/api/fetch`. Shown only when `delaySeconds !== null` (same `section-hidden` toggle pattern already used). Vanilla JS, no library.

**Integration point:** `/api/fetch` response gains `delaySeconds: number | null`. `buildExportHtml` gains a `delaySeconds` parameter and applies the string replacement.

---

## Existing Stack (unchanged)

| Package | Version | Role |
|---------|---------|------|
| express | ^4.18.2 | HTTP server, routing, static serving |
| axios | ^1.6.0 | Anti-bot fetch of VSL pages |
| cheerio | ^1.0.0 | Server-side HTML parsing, DOM queries, attribute manipulation |
| archiver | ^7.0.1 | ZIP bundling for export-zip route |

Frontend: single HTML file, vanilla JS, no bundler, no framework.

---

## Alternatives Considered and Rejected

| Considered | For | Rejected Because |
|------------|-----|-----------------|
| `jsdom` | Richer DOM on server | Already have cheerio; overkill; heavier |
| `sortablejs` / drag-and-drop lib | Script list reordering | No reordering requirement in v1.1 spec |
| `croppie` / image preview lib | Bundle image preview | Native `<img>` element is sufficient; constraint forbids additional libs |
| Dedicated regex library | delaySeconds extraction | Built-in RegExp is adequate for a single, stable pattern |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| No new packages needed | HIGH | Codebase read; all patterns already present in server.js and index.html |
| Cheerio multi-match src replacement | HIGH | Cheerio attribute selectors documented; used in existing collectAssets |
| Regex for `var delaySeconds` | HIGH | Pattern is syntactically simple and stable; built-in RegExp is sufficient |
| Frontend dynamic list (extra scripts) | HIGH | renderCheckoutInputs in index.html is the same pattern |
| Image preview via native `<img>` | HIGH | Standard browser capability, no library needed |
