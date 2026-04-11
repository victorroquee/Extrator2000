# Domain Pitfalls

**Domain:** VSL Cloner v1.1 — Adding extra scripts tab, bundle image editor, VTURB delay editor to existing Node.js + Express + cheerio app
**Researched:** 2026-04-11

---

## Critical Pitfalls

Mistakes that cause rewrites or silently broken exports.

---

### Pitfall 1: Export Idempotency — Pixel and Extra Scripts Injected Multiple Times

**What goes wrong:** `buildExportHtml` currently calls `$('head').append(headerPixel)` and `$('head').append(headerPreload)` unconditionally. If the frontend sends the already-exported HTML (rather than the original cleaned HTML) as the `html` field on a second export call, the pixel block and any extra scripts get appended again. The export is not idempotent.

**Why it happens:** The frontend holds `state.html` which is mutated in the UI layer after fetch but before export. If the user edits something, clicks export once, then modifies a checkout link and clicks export again without re-fetching, the second POST to `/api/export` may still carry the previously-injected content.

**Consequences:** Duplicate `<script>` blocks in head. Meta Pixel fires twice per pageview, inflating ad reporting. VTURB player script loads twice, potentially causing two player instances. Extra scripts accumulate on repeated exports.

**Prevention:**
- Before appending any script in `buildExportHtml`, query `$('head')` for a sentinel comment or a `data-vsl-injected` attribute and skip injection if found.
- Alternatively, store the canonical cleaned HTML (pre-injection) as `state.cleanHtml` in the frontend and always send that as the `html` field on export, applying all edits on the server side each time. This is the cleanest fix: the server re-applies everything from clean state.
- Never let the frontend accumulate injections into `state.html`.

**Detection:** Export the same page twice without re-fetching. Inspect the downloaded HTML for duplicate `<script>` blocks in `<head>`.

**Phase:** Implement prevention before the extra-scripts tab ships. Without idempotency, every additional injectable field makes the problem worse.

---

### Pitfall 2: Regex Fragility for VTURB Delay Extraction

**What goes wrong:** `var delaySeconds = N` appears inside a larger script block (the `displayHiddenElements` pattern). A naive regex like `/var delaySeconds\s*=\s*(\d+)/` will:
1. Match the wrong script if another script on the page coincidentally uses `delaySeconds` (false positive).
2. Fail silently if whitespace, semicolons, or minification deviate from the expected pattern (e.g., `var delaySeconds=5;` vs `var delaySeconds = 5`).
3. Break completely if the variable is declared with `let` or `const` in newer versions of the VTURB script.
4. Extract the number but fail to reconstruct the entire surrounding script block correctly if the block is rebuilt by string template rather than DOM manipulation — producing a script with syntax errors that silently does nothing.

**Why it happens:** VSL page generators change their output. The pattern `var delaySeconds = N` is an internal implementation detail, not a documented contract.

**Consequences:** Delay field shows undefined or wrong value. Reconstructed script block has a syntax error. VTURB player never starts (`displayHiddenElements` never fires). No error is visible to the user.

**Prevention:**
- Anchor the regex to the `displayHiddenElements` function signature, not just the variable name. Example: `/function\s+displayHiddenElements[\s\S]{0,500}?var\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/`.
- Support `var|let|const` in the pattern.
- After extraction, perform a round-trip verification: extract → rebuild → re-extract and assert the value matches.
- If extraction fails, surface a clear UI message ("Não foi possível detectar o delay — edite manualmente") rather than showing 0 or crashing.
- Store the full original script block text alongside the extracted number, so rebuild can do a targeted string replace inside the block rather than reconstructing from scratch.

**Detection:** Run extraction against a page where the script is minified. Confirm the rebuilt script block is syntactically valid JavaScript.

**Phase:** Address during the VTURB delay feature implementation. Write a unit test with at least three script variants (spaced, minified, `const` declaration).

---

### Pitfall 3: Script Rebuild Corrupts the Delay Block

**What goes wrong:** When the user edits the delay value and exports, the server must replace the `delaySeconds` value inside the script block. If the approach rebuilds the entire `<script>` block from a template string rather than doing a targeted replace inside the original block text, any other logic in that block (timers, callbacks, element IDs) is lost.

**Why it happens:** It is tempting to reconstruct only the variables the feature touches. The script block typically contains more than just the delay: element selectors, timing logic, and event bindings.

**Consequences:** Export silently removes the reveal-elements logic. Page looks broken on deploy: buy buttons never appear.

**Prevention:**
- Store `delayScriptOriginal` (the full text of the matched script block) at extraction time.
- On export, apply only a targeted replace: `delayScriptOriginal.replace(/(\bvar\s+delaySeconds\s*=\s*)\d+(?:\.\d+)?/, '$1' + newValue)`.
- Verify the replaced text is still valid JS before injecting (simple check: no unclosed braces added).

**Phase:** Same phase as delay extraction.

---

### Pitfall 4: Bundle Image Detection False Positives

**What goes wrong:** The image detection pass scans for `<img>` tags near bundle-keyword text. Common false positives in VSL pages:
1. Hero section product shot — large single image, no bundle context, but src often contains "produto" or "suplemento", matching if keyword heuristics are loose.
2. Trust badges and payment icons (Visa, Mastercard, SSL seals) — appear inside or near pricing sections and may be siblings to bundle-keyword elements.
3. Inline SVG or base64 data URIs — waste UI thumbnail slots and cannot be replaced with an external URL.
4. Lazy-loaded images using `data-src` rather than `src` — detector misses them entirely, user sees broken thumbnails.

**Why it happens:** Bundle sections in ClickBank VSL pages follow loose conventions. The same `<section>` or `<div>` that contains the pricing card also contains decorative imagery.

**Consequences:** User sees 8 "bundle images" when there are only 3 real product images. Replacing a trust badge URL breaks the page visually. Missing lazy-loaded images means the exported page has wrong product images.

**Prevention:**
- Constrain detection to `<img>` tags whose `src` matches product-image heuristics (path contains `/produto`, `/product`, `/pote`, `/bottle`, `/frasco`, or filename starts with common patterns). This is a second-pass filter on top of positional detection.
- Exclude images with `width` or `height` attributes less than 80px (trust badges are typically small).
- Detect `data-src` and `data-lazy-src` attributes as well as `src`.
- Show image dimensions alongside thumbnails in the UI so the user can visually confirm relevance before replacing.
- Do not auto-replace images; always require explicit user confirmation per image.

**Phase:** Bundle image detection pass. Write test cases with a fixture that includes hero, bundle, and trust-badge images.

---

### Pitfall 5: Duplicate Bundle Sections — Same Image Appears N Times

**What goes wrong:** Many Brazilian VSL pages render the full pricing/bundle section multiple times for responsive layouts (a desktop version and a mobile version, both in the DOM, hidden via CSS). When the image detector runs, it finds the same product image `src` two or three times. The UI shows duplicates. If the user replaces "image A" it only replaces the first occurrence because the selector is index-based.

**Why it happens:** CSS-driven responsive duplication (`display: none` on mobile section, `display: block` on desktop) is very common on ClickFunnels and similar page builders used by Brazilian affiliates.

**Consequences:** Replaced URL applies to only one copy. The exported page shows the new image in one layout but the old image in the other, creating a broken user experience on mobile or desktop.

**Prevention:**
- Deduplicate images by `src` value (or `data-src`) before presenting to the UI. Group occurrences: `{ src, localPath, count, allSelectors[] }`.
- On export, replace all occurrences of the same src, not just the first. Use a global string replace on the HTML for image `src` values rather than selector-indexed DOM manipulation — this is safer for duplicated content.
- In the UI, show "(aparece N vezes)" next to duplicated images.

**Detection:** Load the `pagina-afiliado.html` fixture (or any ClickFunnels-based page) and count how many times each `img[src]` appears in the DOM.

**Phase:** Bundle image feature. This must be addressed in the initial implementation, not a follow-up, because retro-fixing selector-based replacement after release requires a breaking API change.

---

### Pitfall 6: Extra Scripts Tab — XSS from User-Provided Script Strings

**What goes wrong:** The extra scripts tab lets the user paste arbitrary HTML/JS (e.g., a GTM snippet, a heatmap tag, a retargeting pixel). This content is injected verbatim into `<head>` via `$('head').append(userScript)`. Because this is a local app exporting static files, there is no server-side XSS risk to end users. However:
1. A user who pastes malformed HTML (unclosed tags, mismatched quotes) can break the exported page's DOM structure.
2. If the field ever feeds a preview rendered in the editor's own `<iframe>` without sandboxing, a pasted `<script>` could escape.
3. If the app later grows to multi-user or cloud mode, stored user scripts become a stored XSS vector.

**Why it happens:** The feature's core requirement is arbitrary script injection. Sanitization would break the feature.

**Consequences:** Malformed input produces a broken exported page. The user has no feedback that their pasted code caused the problem.

**Prevention:**
- Do not sanitize the script content on the server (it would break legitimate pixels). Instead, validate that each extra script entry is a well-formed `<script>` tag or `<!-- comment -->` block before accepting it.
- Surface a parse error in the UI if the pasted content is not valid HTML (use cheerio to attempt a parse and check for orphaned text nodes or unclosed tags).
- For the preview iframe in the editor (if implemented), use `sandbox` attribute without `allow-scripts`.
- Document in comments: "This field is for trusted affiliate use only. Do not expose it to end users."

**Phase:** Extra scripts tab implementation.

---

### Pitfall 7: Cheerio `$.html()` Re-serialization Side Effects

**What goes wrong:** Every call to `cheerio.load()` followed by `$.html()` re-serializes the entire document. Cheerio uses `htmlparser2` which normalizes HTML during parse: it lowercases attribute names, adds missing closing tags, may alter self-closing tags (`<br>` → `<br>`), and escapes certain characters in attribute values. On a page that has already been through one `$.html()` cycle (the initial `cleanHtml` call), a second cycle for export is generally safe. But:
1. Inline `<style>` blocks containing CSS with `>` selector syntax (`div > p`) may get escaped to `div &gt; p` if `decodeEntities: false` is not passed consistently.
2. Inline `<script>` blocks containing template literals with `</script>` inside a string (`const s = '</script>'`) will cause the parser to prematurely close the script tag, breaking the script.
3. Attribute values containing `&` (common in analytics tracking URLs) may get double-escaped on the second parse cycle.

**Why it happens:** `decodeEntities: false` is already set in the existing code, which mitigates most issues. But new code paths (particularly for delay script rebuild and extra script injection) that call `cheerio.load()` on partial HTML strings instead of the full document may omit this option.

**Consequences:** CSS selectors silently broken in exported page. Inline scripts throw syntax errors in browser. Analytics URLs malformed.

**Prevention:**
- Always pass `{ decodeEntities: false }` to every `cheerio.load()` call — make this a documented coding convention enforced by a linter comment.
- Never call `cheerio.load()` on a partial HTML fragment and then use `$.html()` to get the full document; only load the full document or use `$.html(selector)` to get fragments.
- For the delay script rebuild, use string manipulation on the raw script text, not a cheerio parse/serialize cycle on the script block alone.

**Phase:** Applies to all three new features. Add an ESLint rule or a code review checklist item.

---

### Pitfall 8: Script Injection Order Breaks Existing Pixel Dependencies

**What goes wrong:** The current `buildExportHtml` appends `headerPixel` and then `headerPreload` to `<head>`. The extra scripts tab adds a third append. If the user pastes a script that depends on `window.fbq` (Meta Pixel) already being defined — for example, a custom event trigger — and that script ends up appended before the pixel definition, it will throw `fbq is not defined` at runtime.

**Why it happens:** The order of `$('head').append()` calls determines DOM order. User-facing "extra scripts" feel like they should come last, but users may not know that.

**Consequences:** User's custom event scripts silently fail. Pixel fires the base `PageView` but not custom events.

**Prevention:**
- Always inject extra scripts last, after `headerPixel` and `headerPreload`, as the final append in `buildExportHtml`.
- Document this order in the UI: "Estes scripts são injetados após o pixel principal."
- Consider adding an explicit ordering UI (drag to reorder) only if user feedback confirms it is needed — do not over-engineer for v1.1.

**Phase:** Extra scripts tab implementation.

---

### Pitfall 9: Image URL Replacement Breaks Relative Paths and Data URIs

**What goes wrong:** When the user replaces a bundle image URL, the new URL they type might be:
1. A relative path (`/images/novo-produto.png`) — valid on the original domain but broken in the exported standalone HTML.
2. A data URI (`data:image/png;base64,...`) — works but bloats the HTML file.
3. A URL with special characters or spaces — breaks the `src` attribute unless properly encoded.
4. An HTTP URL on a page served over HTTPS — mixed-content warning silently blocks the image.

**Why it happens:** Users are marketers, not developers. They paste whatever URL they have.

**Consequences:** Product images silently broken in exported page. User discovers this only after uploading to their server.

**Prevention:**
- Validate each replacement URL on input: reject relative paths with a clear message ("Use uma URL completa iniciando com https://").
- Warn (do not block) on HTTP URLs: "Este link é HTTP e pode ser bloqueado em páginas HTTPS."
- URL-encode the replacement value before writing it into the `src` attribute.
- Show a live preview of the replacement image in the UI before export.

**Phase:** Bundle image editor UI implementation.

---

## Moderate Pitfalls

---

### Pitfall 10: Delay Value Edge Cases — Zero, Negative, Non-Integer

**What goes wrong:** The `var delaySeconds = N` field is user-editable. If the user sets it to 0, negative, or a non-numeric value:
- `0` may cause `displayHiddenElements` to fire immediately before VTURB player is ready, showing buy buttons before the VSL has finished.
- Negative values may cause unexpected timer behavior (`setTimeout(fn, -5000)` in some engines fires immediately, in others it is clamped to 0).
- Non-integer (e.g., `1.5`) is valid JS but may not be tested in the original VTURB script.
- Empty string produces `var delaySeconds = ` — a syntax error.

**Prevention:** Validate the input as a non-negative integer. Clamp minimum to 1. Show a warning for values above 300 (5 minutes) as likely user error.

---

### Pitfall 11: Multiple `displayHiddenElements` Script Blocks

**What goes wrong:** Some pages copy-paste the delay script into both a `<head>` location and a `<body>` location (a common mistake on landing page builders). The regex extracts the first match, but export replaces only that block, leaving a second block with the old value.

**Prevention:** After extracting, count total matches. If more than one, inform the user: "2 blocos de delay encontrados — ambos serão atualizados." Replace all matching occurrences on export.

---

### Pitfall 12: Cheerio `.text()` vs `.html()` for Reading Script Content

**What goes wrong:** Using `$(el).text()` on a `<script>` element returns the text content correctly in cheerio. Using `$(el).html()` also works but returns the innerHTML (which for script tags is the same as text content). However, `.text()` can behave inconsistently across cheerio versions when the script contains HTML-like strings (see cheerio issue #607 and #1050). Using `.html()` is safer for reading script block content.

**Prevention:** Always use `$(el).html()` (not `.text()`) when reading the content of `<script>` blocks for pattern matching and extraction. This is already the convention in the existing codebase (`content = $(el).html() || $(el).text()` — the fallback to `.text()` is fine but `.html()` should be tried first).

---

## Minor Pitfalls

---

### Pitfall 13: Thumbnail Loading in UI Blocks Interaction

**What goes wrong:** If the bundle image tab loads 20+ product image thumbnails via `<img src="...">` pointing to external URLs, and one image host rate-limits or returns a 403, the browser's image loading hangs that thumbnail slot. With many failed requests, the tab feels slow.

**Prevention:** Set `loading="lazy"` on thumbnails. Add a fallback `onerror` that replaces the broken thumbnail with a gray placeholder. Limit thumbnail display to a reasonable maximum (e.g., 10 images; show a "show more" toggle).

---

### Pitfall 14: Extra Script Input Strips Outer `<script>` Tags — Or Doesn't

**What goes wrong:** Users copying from ad platforms will paste either:
- The full `<script>...</script>` block (most common from Facebook Events Manager).
- Just the inner JS code (common from custom GTM templates).

If the UI expects one format and receives the other, the injected content is either double-wrapped or bare JS injected without a `<script>` tag.

**Prevention:** Before appending, detect whether the input starts with `<script` (case-insensitive). If yes, inject as-is. If no, wrap in `<script>\n...\n</script>` automatically. Show the user a preview of what will be injected.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Extra scripts tab | Export idempotency (Pitfall 1) | Store clean HTML separately; never export twice from mutated HTML |
| Extra scripts tab | Script injection order (Pitfall 8) | Always append after pixel; document in code |
| Extra scripts tab | Malformed HTML input (Pitfall 6) | Validate parse; warn user |
| Extra scripts tab | Missing outer `<script>` tag (Pitfall 14) | Auto-detect and wrap |
| Bundle image editor | Duplicate sections (Pitfall 5) | Deduplicate by src; replace all occurrences |
| Bundle image editor | False positives (Pitfall 4) | Size filter + path heuristic; require confirmation |
| Bundle image editor | Relative/HTTP replacement URLs (Pitfall 9) | Validate and warn before export |
| VTURB delay | Regex mismatch (Pitfall 2) | Anchor to function name; support var/let/const |
| VTURB delay | Block reconstruction (Pitfall 3) | Targeted replace inside original text, not full rebuild |
| VTURB delay | Multiple delay blocks (Pitfall 11) | Count + replace all |
| VTURB delay | Edge-case values (Pitfall 10) | Clamp to non-negative integer |
| All features | Cheerio re-serialization (Pitfall 7) | Always pass `decodeEntities: false`; use string ops for script content |
| All features | `.html()` vs `.text()` on script (Pitfall 12) | Prefer `.html()` for script block reading |

---

## Sources

- Cheerio issue #607: Parsing of HTML strings inside script tags — https://github.com/cheeriojs/cheerio/issues/607
- Cheerio issue #1050: `.text()` of `<script>` returns empty string — https://github.com/cheeriojs/cheerio/issues/1050
- Catastrophic backtracking in JS regex — https://javascript.info/regexp-catastrophic-backtracking
- OWASP DOM XSS Prevention — https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
- Avoiding duplicate content script injections (Chromium) — https://groups.google.com/a/chromium.org/g/chromium-extensions/c/uNXEDCsrgHc
- Codebase review: `/Users/victorroque/Downloads/Extrator2000/server.js` — direct analysis of existing `buildExportHtml`, `cleanHtml`, and `applyCheckoutLinks` functions
