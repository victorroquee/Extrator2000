# Project Research Summary

**Project:** VSL Cloner v1.1 — Extra Scripts, Bundle Images, VTURB Delay
**Domain:** VSL page cloner for Brazilian digital marketing affiliates (Node.js + Express + cheerio)
**Researched:** 2026-04-11
**Confidence:** HIGH

## Executive Summary

VSL Cloner v1.1 adds three targeted enhancements to a production-ready v1.0 codebase: a dynamic extra-scripts tab for injecting additional tracking pixels into `<head>`, a bundle image editor that detects and replaces product bottle images on pricing sections, and a VTURB delay editor that extracts the `var delaySeconds = N` pattern and reconstructs the script on export. The critical architectural finding is that all three features are buildable with the existing dependency set — cheerio, vanilla JS, and Node built-ins are sufficient. No new npm packages are required or justified.

The recommended implementation order is server-side first across all three features before touching the frontend. The VTURB delay feature must be implemented first because it requires modifying `cleanHtml()` to extract the delay block before it is removed, which must be stable before the function's return shape is frozen. Bundle image detection follows as a new independent helper. Extra scripts is last on the server because it is the most trivial server change (one `$('head').append()` line) and only lands after `buildExportHtml` has its final signature. Frontend for all three features follows in the same order.

The most critical risk is export non-idempotency: `buildExportHtml` appends scripts unconditionally, so exporting twice from the same HTML doubles every injected script block. This must be resolved before the extra-scripts tab ships — every new injectable field makes the problem worse. The second critical risk is VTURB delay block reconstruction: the original script block must be stored verbatim at extraction time and rebuilt via targeted string-replace inside that original text, not reconstructed from a template, to avoid silently dropping the `displayHiddenElements` logic.

## Key Findings

### Recommended Stack

No new dependencies are needed. The existing stack handles all v1.1 requirements: cheerio's `$('img[src="..."]').attr()` covers global bundle image src replacement, Node built-in `RegExp` covers `var delaySeconds = N` extraction, and the vanilla JS `renderCheckoutInputs` pattern in `index.html` is directly reusable for the extra-scripts dynamic list UI.

**Core technologies (unchanged):**
- `cheerio ^1.0.0` — server-side DOM parsing, attribute manipulation, script extraction
- `express ^4.18.2` — HTTP server and routing; no new routes needed
- `axios ^1.6.0` — VSL page fetching with anti-bot headers
- `archiver ^7.0.1` — ZIP bundling for export-zip route (unchanged)
- Vanilla JS + DOM API — frontend list rendering and state management

### Expected Features

**Must have (table stakes):**
- Extra scripts: dynamic add/remove list, head injection, ordering preserved after `headerPixel`
- Bundle images: auto-detection from checkout-adjacent sections + thumbnail preview + editable URL + global src replacement on export
- VTURB delay: extract current value from raw HTML before cleanup + editable number input + rebuilt script injected near `</body>` on export
- Graceful empty states for all three features when detection yields nothing

**Should have (competitive differentiators):**
- Bundle image: auto bundle-quantity labeling (2/3/6 potes) next to each thumbnail
- Extra scripts: optional label per script entry to identify "TikTok Pixel" vs "Hotjar"
- VTURB delay: show "(aparece N vezes)" when multiple delay blocks detected; replace all

**Defer to v2+:**
- Drag-to-reorder for extra scripts
- Image upload (as opposed to URL replacement) for bundle images
- CSS selector editing inside the delay block
- Script validation or linting
- Image crop/resize tools

### Architecture Approach

The feature integration follows a clean extension pattern: `cleanHtml()` gains new return fields (`delaySeconds`, `hasDelay`, `delayScriptContent`); two new independent helpers are added (`detectBundleImages`, `applyBundleImageReplacements`); `buildExportHtml` gains three new parameters (`extraScripts`, `bundleImageReplacements`, `delaySeconds`/`delayScriptContent`); the `/api/fetch` response `summary` object gains new fields; the export request payload gains new fields. The frontend `state` object gains five new fields. Two new UI sections (E: Extra Scripts, F: Bundle Images) and one new UI row (VTURB delay input) are added to `index.html`.

**Major components and their v1.1 changes:**

1. `cleanHtml()` — MODIFIED: capture `delaySeconds` and `delayScriptContent` inside the script-removal loop before the block is dropped; expand return shape
2. `detectBundleImages($)` — NEW helper: scan `<img>` tags inside checkout-link ancestor containers; deduplicate by `src`; return `[{ src, index }]`
3. `applyBundleImageReplacements(html, replacements)` — NEW helper: cheerio `$('img').each` with exact `src` match; replaces all occurrences globally
4. `buildExportHtml()` — MODIFIED: accept `extraScripts` (append to `<head>` last), `bundleImageReplacements` (call new helper), `delaySeconds`/`delayScriptContent` (targeted string-replace + append to `<body>`)
5. `index.html` state + sections E/F + delay row — NEW/MODIFIED frontend

### Critical Pitfalls

1. **Export non-idempotency** — `buildExportHtml` appends scripts unconditionally; exporting twice doubles all injected content. Fix: always send `state.cleanHtml` (the original cleaned HTML, never previously-exported HTML) as the `html` field; add a sentinel check inside `buildExportHtml` as a secondary guard.

2. **VTURB delay regex fragility and block reconstruction** — naive `var delaySeconds = N` regex breaks on minified code and `const`/`let` declarations. Reconstructing from a template drops the `displayHiddenElements` body. Fix: anchor regex to `displayHiddenElements` presence in the same block; support `var|let|const`; store the complete original block text and rebuild via targeted string-replace inside it.

3. **Bundle image duplicate sections** — Brazilian VSL pages commonly render pricing sections twice (desktop + mobile hidden via CSS). Selector-indexed replacement updates only one copy. Fix: deduplicate by `src` on detection; replace all `<img src="X">` occurrences globally.

4. **Cheerio re-serialization side effects** — omitting `{ decodeEntities: false }` on any `cheerio.load()` call corrupts CSS `>` selectors and inline script content. Fix: always pass `{ decodeEntities: false }`; use string-level replacement for all script block manipulation.

5. **Extra script format ambiguity** — users paste either full `<script>...</script>` blocks or bare JS. Fix: auto-detect whether input starts with `<script` (case-insensitive); if not, wrap it automatically.

## Implications for Roadmap

Based on research, suggested phase structure (6 steps across 2 phases):

### Phase 1: Server-Side Extensions

**Rationale:** All three features share `buildExportHtml`. Getting the server API into its final shape before writing any frontend gives the frontend a stable, testable contract. Server-only changes are also easier to unit-test in isolation. Do all three server changes in a single focused session to minimize context-switching on `server.js`.

**Delivers:** Complete v1.1 API — `/api/fetch` returns `bundleImages`, `delaySeconds`, `hasDelay`, `delayScriptContent`; `/api/export` and `/api/export-zip` accept and apply all new fields.

**Step order within phase:**
1. VTURB delay extraction inside `cleanHtml()` + export rebuild in `buildExportHtml` — modifies the function return shape that steps 2 and 3 depend on
2. `detectBundleImages` helper + `/api/fetch` integration + `applyBundleImageReplacements` + `buildExportHtml` extension — new independent helpers
3. Extra scripts — single `$('head').append(extraScripts)` line in `buildExportHtml`; trivial, goes last

**Addresses:** VTURB delay (server), Bundle images (server), Extra scripts (server)
**Avoids:** Pitfall 3 (block reconstruction via stored text), Pitfall 5 (global src replacement), Pitfall 7 (decodeEntities), Pitfall 1 (idempotency sentinel on all new appends)

### Phase 2: Frontend UI

**Rationale:** Server API is now stable and testable. Frontend work is purely additive to `index.html`. Build in the same order as Phase 1 for consistency.

**Delivers:** Complete v1.1 UI — delay row in section C, bundle image section F with thumbnails, extra scripts section E with dynamic add/remove list.

**Step order within phase:**
4. VTURB delay row — single `<input type="number">` shown conditionally; verifies full round-trip first
5. Bundle images section — grid of thumbnails + URL inputs; most UI complexity
6. Extra scripts section — dynamic add/remove textarea list; reuses existing `renderCheckoutInputs` pattern

**Addresses:** All table-stakes must-haves
**Avoids:** Pitfall 9 (URL validation on image inputs), Pitfall 14 (auto-wrap bare JS), Pitfall 10 (clamp delay to non-negative integer), Pitfall 13 (lazy-load thumbnails with onerror fallback)

### Phase Ordering Rationale

- Server before frontend: stable API contract eliminates guesswork during UI wiring
- Delay before bundle images on server: `cleanHtml` return shape change must land first
- Extra scripts last on server: it is a single append line; batched into the same `server.js` session
- Frontend mirrors server order: same mental model, easier to review
- Export idempotency must be addressed in Phase 1 — adding Phase 2 features on top of a non-idempotent export would require a breaking API fix later

### Research Flags

Phases with standard patterns (skip additional research):
- **Phase 1, step 3 (Extra Scripts server):** Fully documented pattern; `$('head').append()` is cheerio fundamentals
- **Phase 2, step 6 (Extra Scripts UI):** Direct reuse of existing `renderCheckoutInputs` DOM pattern

Phases that need verification against real fixture (no additional external research):
- **Phase 1, step 1 (VTURB Delay):** Test regex against `pagina-afiliado.html` and a minified variant before marking done
- **Phase 1, step 2 (Bundle Images):** Run `detectBundleImages` against `pagina-afiliado.html`; confirm deduplication handles desktop+mobile duplicate sections

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase read; all patterns already present in production; zero new packages needed |
| Features | HIGH | Based on direct codebase + real VSL fixture (`pagina-afiliado.html`) inspection; edge cases enumerated from real page structure |
| Architecture | HIGH | Full `server.js` and `index.html` read; component map and data flow verified against current code |
| Pitfalls | HIGH | Cheerio issues cited by number; export idempotency confirmed by reading `buildExportHtml`; duplicate-section pattern confirmed in fixture |

**Overall confidence:** HIGH

### Gaps to Address

- **Bundle image detection precision:** Proximity-to-checkout heuristic may produce false positives on pages with hero product images inside the same `<section>` as buy links. Smoke-test against 3-5 diverse VSL pages after Phase 1 step 2 ships. Mitigation (size filter + path keyword filter + user confirmation) is specified; real-world precision unknown until tested.

- **VTURB delay non-standard player selectors:** Some pages use `"smart-player"` or a custom ID instead of `"vturb-smartplayer"`. The `delayScriptContent` round-trip approach handles this correctly (original selector is preserved in stored text), but must be confirmed during implementation — do not hardcode the selector in the rebuilt script.

- **Export idempotency sentinel mechanism:** Prevention strategy is agreed (send `cleanHtml` always + guard in `buildExportHtml`), but the exact guard implementation (sentinel attribute vs existing pixel script presence check) is an open decision for Phase 1 execution.

## Sources

### Primary (HIGH confidence)
- Direct read of `/Users/victorroque/Downloads/Extrator2000/server.js` (commit 1d774b8) — `cleanHtml`, `buildExportHtml`, `detectCheckoutLinks`, `collectAssets`, `applyCheckoutLinks` implementations
- Direct read of `/Users/victorroque/Downloads/Extrator2000/public/index.html` — state object, `renderCheckoutInputs` pattern, section structure, export payload construction
- Direct read of `/Users/victorroque/Downloads/Extrator2000/pagina-afiliado.html` (JellyLean ClickBank) — real VSL fixture confirming bundle section structure, delay block pattern, `data-image` attribute, `.esconder` class

### Secondary (MEDIUM confidence)
- Cheerio issue #607 — `<script>` tag parsing edge case with `</script>` inside string literals
- Cheerio issue #1050 — `.text()` vs `.html()` on script elements inconsistency
- OWASP DOM XSS Prevention — background for extra scripts field security note

---
*Research completed: 2026-04-11*
*Ready for roadmap: yes*
