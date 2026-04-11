# Phase 4: VTURB Delay + Export Idempotency — Research

**Researched:** 2026-04-11
**Domain:** Node.js/Express + cheerio — HTML cleanup pipeline extension and export idempotency
**Confidence:** HIGH — all findings from direct codebase inspection; no external research needed

---

## Summary

Phase 4 implements two tightly related features: (1) extracting the VTURB `delaySeconds` value
from raw HTML before cleanup removes the block, exposing it as an editable number input in the
frontend; (2) ensuring that exporting the same page multiple times never appends duplicate pixel,
preload, or delay script blocks. Both features involve changes to `cleanHtml()`, `buildExportHtml()`,
both export routes, and the frontend state + UI.

The single biggest trap is ordering: the delay block is removed by `cleanHtml()` because it contains
the `vturb` keyword. Detection must happen on `rawHtml`, before `cleanHtml()` is called. The second
trap is idempotency: the current frontend already guards against this correctly because `state.fetchedHtml`
is always the canonical clean HTML (never the exported HTML), but the behavior must be verified and
codified. The safest idempotency fix is a sentinel guard inside `buildExportHtml()` that detects
already-injected content and skips re-injection.

**Primary recommendation:** Extract delay from `rawHtml` in the `/api/fetch` handler (before
`cleanHtml()`), store `{ delaySeconds, delayScriptContent }` in the `/api/fetch` response, round-trip
them to the export endpoints, and rebuild via targeted `String.replace` — never cheerio re-parse the
script block content. Add a `data-vsl-injected` sentinel to `<head>` inside `buildExportHtml()` to
guard idempotency.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELAY-01 | System extracts `var delaySeconds = N` from `displayHiddenElements` block before HTML cleanup | Detection must run on `rawHtml` before `cleanHtml()` call in `/api/fetch` handler; regex anchored to `displayHiddenElements` presence |
| DELAY-02 | User sees current delay value in seconds and can edit it in the editor panel | Frontend: new number input row, shown conditionally on `state.hasDelay`; pre-populated from `data.summary.delaySeconds` |
| DELAY-03 | On export the original block is preserved and only the numeric value is replaced | Use `delayScriptContent.replace(/var\s+delaySeconds\s*=\s*\d+/, ...)` — not a template rebuild; preserves full function body |
| EXPORT-06 | Exporting the same page multiple times does not duplicate pixel, preload, or injected scripts | Sentinel approach: `buildExportHtml()` checks for `data-vsl-injected` attribute on `<head>` and skips injection if present; OR rely on frontend always sending canonical `state.fetchedHtml` |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** Node.js + Express + axios + cheerio — no additional frameworks
- **Frontend:** Single HTML file with vanilla JS — no bundler
- **Structure:** `server.js` + `public/index.html` + `package.json` only
- **Runtime:** Node.js local, port 3000

All changes must stay within the existing file structure. No new files except test additions.

---

## Standard Stack

### Core (already in place — no new dependencies needed)

| Library | Version (verified) | Purpose | Notes |
|---------|-------------------|---------|-------|
| cheerio | ^1.0.0 | HTML parse/manipulate | Already used; `decodeEntities: false` REQUIRED on every load call |
| express | ^4.18.2 | HTTP server | No change |
| axios | ^1.6.0 | HTTP fetch | No change |
| archiver | ^7.0.1 | ZIP creation | No change |

**Phase 4 requires zero new npm packages.** [VERIFIED: package.json direct read]

### Supporting Patterns

No new libraries. Phase 4 uses only:
- `String.prototype.replace` — for targeted delay value substitution (NOT cheerio)
- `RegExp` — for delay block detection
- Vanilla JS DOM manipulation — for the delay input row in `index.html`

---

## Architecture Patterns

### Existing Code Structure (baseline)

```
server.js
├── cleanHtml(rawHtml)                → { html, scriptsRemoved, vslDetected }
├── detectCheckoutLinks($, html)      → checkoutLinks[]
├── buildExportHtml({ html, headerPixel, headerPreload, vslembed, checkoutLinks })
│     ├── cheerio.load(html, { decodeEntities: false })
│     ├── $('head').append(headerPixel)
│     ├── $('head').append(headerPreload)
│     ├── String.replace for VSL_PLACEHOLDER → vslembed
│     └── applyCheckoutLinks(outputHtml, checkoutLinks)
├── POST /api/fetch
│     ├── axios.get(url)
│     ├── cleanHtml(rawHtml)         ← delay detection must happen BEFORE this
│     └── detectCheckoutLinks($, cleanedHtml)
├── POST /api/export → buildExportHtml(req.body)
└── POST /api/export-zip → buildExportHtml(...) + asset download + archiver
```

### Pattern 1: Extract Delay BEFORE cleanHtml()

**What:** Add a new helper `detectVturbDelay(rawHtml)` that runs on the raw HTML string before
`cleanHtml()` removes the VTURB script block. Returns `{ delaySeconds, delayScriptContent }` or null.

**Why:** `cleanHtml()` removes any `<script>` whose content contains `vturb` or `smartplayer`
(CLEAN-01 via `SCRIPT_REMOVE_KEYWORDS`). The delay block contains
`document.querySelector("vturb-smartplayer")`, which matches `smartplayer`, so it is always
removed. Once removed from `html`, the content is gone from `state.fetchedHtml` and cannot be
recovered at export time. [VERIFIED: server.js lines 23-38, 139-145 — direct read]

**Implementation:**

```javascript
// Source: derived from FEATURES.md + PITFALLS.md + server.js codebase read

function detectVturbDelay(rawHtml) {
  // Use cheerio to iterate <script> tags so we get the same content
  // that cleanHtml() would see — avoids regex-over-full-document issues
  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  let result = null;

  $('script').each((_, el) => {
    if (result) return; // take first match only
    const content = $(el).html() || $(el).text() || '';
    // Require BOTH delaySeconds declaration AND displayHiddenElements in same block
    const delayMatch = content.match(/(?:var|let|const)\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/);
    if (delayMatch && /displayHiddenElements/.test(content)) {
      result = {
        delaySeconds: parseFloat(delayMatch[1]),
        delayScriptContent: content,  // full original script body, preserved verbatim
      };
    }
  });

  return result; // null if not found
}
```

**In `/api/fetch` handler:**

```javascript
// BEFORE cleanHtml():
const delayInfo = detectVturbDelay(rawHtml);

// AFTER cleanHtml() (unchanged):
const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);

// Include in response:
return res.json({
  html: cleanedHtml,
  summary: {
    scriptsRemoved,
    vslDetected,
    checkoutLinks,
    delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
    hasDelay: delayInfo !== null,
    delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
  },
});
```

---

### Pattern 2: Targeted String Replace in buildExportHtml()

**What:** On export, substitute the numeric value inside the original captured script body using
`String.replace`, then wrap in `<script>` tags and append near `</body>`.

**Why:** Cheerio re-parsing the script block content for a simple number replacement risks mangling
`</script>` substrings inside string literals (Pitfall 7 / Pitfall 3). String ops on raw script
text are safe and reversible. [VERIFIED: PITFALLS.md Pitfall 3, Pitfall 7]

**Implementation in `buildExportHtml()`:**

```javascript
function buildExportHtml({ html, headerPixel, headerPreload, vslembed, checkoutLinks,
                           delaySeconds, delayScriptContent }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Inject affiliate header scripts
  if (headerPixel && headerPixel.trim()) $('head').append(headerPixel);
  if (headerPreload && headerPreload.trim()) $('head').append(headerPreload);

  let outputHtml = $.html();

  // Replace VSL placeholder with affiliate player embed
  if (vslembed && vslembed.trim()) {
    outputHtml = outputHtml.replace(
      /<!--\s*\[VSL_PLACEHOLDER\]\s*-->[\s\S]*?<div id="vsl(?:-cloner)?-placeholder"[\s\S]*?<\/div>/,
      vslembed
    );
  }

  // Apply checkout link replacements
  outputHtml = applyCheckoutLinks(outputHtml, checkoutLinks);

  // Inject rebuilt delay block near </body>
  if (delayScriptContent && delaySeconds !== undefined && delaySeconds !== null) {
    const rebuilt = delayScriptContent.replace(
      /(?:var|let|const)\s+delaySeconds\s*=\s*\d+(?:\.\d+)?/,
      `var delaySeconds = ${Number(delaySeconds)}`
    );
    outputHtml = outputHtml.replace('</body>', `<script>\n${rebuilt}\n<\/script>\n</body>`);
  }

  return outputHtml;
}
```

**Note:** The delay block appends via `String.replace` on `</body>`, not via cheerio `.append()`.
This avoids the risk of cheerio serializing the rebuilt script content (Pitfall 7). If no
`</body>` tag is found the replace is a no-op, which is safe — the export proceeds without the
delay block rather than crashing. [VERIFIED: PITFALLS.md Pitfall 7 — decodeEntities concern]

---

### Pattern 3: Export Idempotency Fix (EXPORT-06)

**What:** Guarantee that calling `/api/export` or `/api/export-zip` multiple times with the same
`html` payload never duplicates injected content.

**Root cause analysis of current code:**

Looking at `index.html` line 634, the export handler always sends `state.fetchedHtml` as the `html`
field — never the previously-exported output. `state.fetchedHtml` is set once on fetch (line 574)
and never mutated. This means the frontend already avoids the pitfall by design for the existing
fields. [VERIFIED: index.html lines 574, 634 — direct read]

However, EXPORT-06 requires making this contract explicit and robust:

**Option A (recommended): Sentinel in `buildExportHtml()`**

Add a `data-vsl-injected="1"` attribute to `<head>` as the first operation. If the attribute is
already present when `buildExportHtml()` runs, skip all injections and return `html` unchanged.

```javascript
function buildExportHtml({ html, ... }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // EXPORT-06: Idempotency guard — if already exported, skip all injections
  if ($('head').attr('data-vsl-injected')) {
    // html already contains injected content — return as-is (should not happen
    // if frontend always sends state.fetchedHtml, but defensive guard)
    return html;
  }
  $('head').attr('data-vsl-injected', '1');

  // ... rest of injection logic unchanged
}
```

**Option B: Frontend contract (already in place)**

Document that the frontend MUST always send `state.fetchedHtml` (set at fetch time, never
overwritten by export). Add a comment in the export click handler to make this explicit.
No server change needed.

**Recommendation: Use both.** The frontend contract is already correct and must be preserved.
The sentinel adds a defensive server-side guard at zero cost. The sentinel also protects
against future refactors that might accidentally mutate `state.fetchedHtml`.

---

### Pattern 4: Frontend State and UI

**Current `state` object (index.html line 391):**
```js
const state = {
  fetchedHtml: null,
  fetchedUrl: '',
  checkoutLinks: [],
};
```

**Extended state for Phase 4:**
```js
const state = {
  fetchedHtml: null,
  fetchedUrl: '',
  checkoutLinks: [],
  // Phase 4 additions:
  delaySeconds: null,        // number | null — from server
  hasDelay: false,           // bool — whether delay block was detected
  delayScriptContent: null,  // string | null — opaque, round-tripped to server on export
};
```

**Delay input row (HTML to add in section C or as standalone section D.5):**

The delay input is a small row — logically belongs inside section C (Player Embed) since it
relates to player behavior, or as a thin standalone card between sections C and D.

Recommended: Standalone minimal section after section C:

```html
<!-- Section C.5: VTURB Delay (hidden when not detected) -->
<section class="card section-hidden" id="section-delay">
  <p class="card-title">C.5 — Delay do Player VTURB</p>
  <div style="display:flex;align-items:center;gap:12px;">
    <label for="delay-seconds" style="white-space:nowrap;margin:0;">
      Delay antes de revelar botoes (segundos)
    </label>
    <input
      type="number"
      id="delay-seconds"
      min="1"
      max="300"
      step="1"
      style="width:100px;"
      placeholder="10"
    />
  </div>
</section>
```

When `hasDelay` is false: section stays hidden. No error shown. [VERIFIED: REQUIREMENTS.md DELAY-01]

**Fetch response handler addition:**
```js
// After existing state assignments:
state.delaySeconds = (data.summary && data.summary.delaySeconds) || null;
state.hasDelay = (data.summary && data.summary.hasDelay) || false;
state.delayScriptContent = (data.summary && data.summary.delayScriptContent) || null;

// Show delay section if detected:
const delayInput = document.getElementById('delay-seconds');
if (state.hasDelay && delayInput) {
  delayInput.value = state.delaySeconds;
  showSection(document.getElementById('section-delay'));
}
```

**Export payload addition:**
```js
var payload = {
  html:                state.fetchedHtml,  // ALWAYS canonical clean HTML — never exported HTML
  headerPixel:         headerPixel.value,
  headerPreload:       headerPreload.value,
  vslembed:            vslEmbed.value,
  checkoutLinks:       buildCheckoutPayload(),
  pageUrl:             state.fetchedUrl,
  // Phase 4 additions:
  delaySeconds:        state.hasDelay ? Number(delayInput.value) : undefined,
  delayScriptContent:  state.delayScriptContent || undefined,
};
```

---

### Anti-Patterns to Avoid

- **Reconstruct delay script from template:** Tempting but wrong. The original block may contain
  element selectors, class name arrays, persist options. Rebuild only the number via replace on
  the captured original. [PITFALLS.md Pitfall 3]
- **Call cheerio.load() on the delay script content fragment:** Would serialize partial HTML,
  potentially mangling `</script>` strings. Use String.replace only. [PITFALLS.md Pitfall 7]
- **Omit `{ decodeEntities: false }` on any new cheerio.load():** Every new call site must
  include this option. [PITFALLS.md Pitfall 7]
- **Run delay detection AFTER cleanHtml():** By that point the block is removed. Detection must
  precede cleanHtml in execution order. [FEATURES.md CRITICAL EDGE CASE section]
- **Allow the frontend to send previously-exported HTML:** The export click handler must always
  reference `state.fetchedHtml` directly, never build a modified version. Currently correct;
  must not change. [PITFALLS.md Pitfall 1]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parse/serialize | Custom string-based HTML parser | cheerio (already present) | Edge cases in attribute encoding, nested tags |
| Asset download batching | Custom queue/pool | Promise.all in chunks (already in export-zip) | Already correct; don't change the pattern |
| ZIP generation | Manual ZIP binary | archiver (already present) | Handles streaming, compression levels, error events |

**Key insight:** Phase 4 has no new algorithmic complexity. The hard part is execution order
(detect before clean) and precision (replace only the number, not the entire block).

---

## Common Pitfalls

### Pitfall 1: Detection After Cleanup
**What goes wrong:** `detectVturbDelay` is called on `cleanedHtml` instead of `rawHtml`. The delay
block is already gone. `delayScriptContent` is null. Export never injects the delay block. User
sees buy buttons appearing immediately regardless of input value.
**Why it happens:** The natural place to add detection looks like "after cleanHtml", because all
other summary fields (checkout links, vslDetected) are computed after cleanup.
**How to avoid:** In `/api/fetch` handler, `detectVturbDelay(rawHtml)` must be called before
`const { html: cleanedHtml } = cleanHtml(rawHtml)`. Comment clearly in code.
**Warning signs:** Integration test: fetch a page with delay block, assert `hasDelay === true`.
[VERIFIED: server.js line 294 shows current call sequence; delay detection must precede it]

### Pitfall 2: Regex Too Narrow or Too Broad
**What goes wrong:**
- Too narrow: `/var delaySeconds\s*=\s*(\d+)/` misses `let`/`const` declarations and minified
  forms (`var delaySeconds=10`). Silent miss — `hasDelay` stays false.
- Too broad: pattern matches a different script that happens to contain `delaySeconds` but is not
  the VTURB delay block. Wrong value extracted.
**How to avoid:** Require BOTH `(?:var|let|const)\s+delaySeconds\s*=\s*(\d+)` AND
`/displayHiddenElements/` in the same script block content. This dual condition is sufficient to
identify the correct block and rejects false positives. [VERIFIED: PITFALLS.md Pitfall 2, FEATURES.md]

### Pitfall 3: Export Mutates `state.fetchedHtml`
**What goes wrong:** Any future refactor that does `state.fetchedHtml = exportedHtml` would make
subsequent exports inject duplicates. The sentinel guard in `buildExportHtml` catches this but
produces a silent early-return (exported page has no injections at all).
**How to avoid:** The export click handler must never assign to `state.fetchedHtml`. Add an
explicit comment at both the assignment site (fetch handler) and the payload construction
(export handler). [VERIFIED: index.html lines 574, 634]

### Pitfall 4: `delaySeconds` Input Validation
**What goes wrong:** User types 0, -5, or empty string. `buildExportHtml` injects
`var delaySeconds = 0` or `var delaySeconds = NaN`, breaking player behavior or producing
a JS syntax error.
**How to avoid:** Server-side: `const safeDelay = Math.max(1, Math.round(Number(delaySeconds) || 1))`
before the replacement. Frontend: `input[type=number]` with `min="1"` prevents most bad values;
also validate before sending (`if (isNaN(val) || val < 1) val = 1`). [VERIFIED: PITFALLS.md Pitfall 10]

### Pitfall 5: String Replace on `</body>` Misses
**What goes wrong:** Some fetched pages lack a `</body>` closing tag (malformed HTML). The
`outputHtml.replace('</body>', ...)` is a no-op. Delay block not injected.
**How to avoid:** After replace, check if the result changed. If no `</body>` found, append to end
of string as fallback: `outputHtml += '<script>...\n</script>'`. This is safe because the browser
will render appended script content correctly even without a closing body tag.

### Pitfall 6: Both Export Routes Must Be Updated
**What goes wrong:** `buildExportHtml` signature updated to include `delaySeconds` and
`delayScriptContent`, but only `/api/export` destructures them from `req.body`. The `/api/export-zip`
route continues to call `buildExportHtml` without the new params. Delay block never injected in ZIP
exports.
**How to avoid:** Both routes destructure and pass the new params in a single diff. The function
signature change and both call sites must be updated in the same task. [VERIFIED: server.js lines 436-443, 451-458]

---

## Code Examples

### Delay Detection (to add to server.js)

```javascript
// Source: derived from codebase read server.js lines 113-206 + FEATURES.md pattern analysis

function detectVturbDelay(rawHtml) {
  // { decodeEntities: false } required — matches cleanHtml() convention
  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  let result = null;

  $('script').each((_, el) => {
    if (result) return;
    // Prefer .html() over .text() for script content — see PITFALLS.md Pitfall 12
    const content = $(el).html() || $(el).text() || '';
    const delayMatch = content.match(/(?:var|let|const)\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/);
    if (delayMatch && /displayHiddenElements/.test(content)) {
      result = {
        delaySeconds: parseFloat(delayMatch[1]),
        delayScriptContent: content,
      };
    }
  });

  return result;
}
```

### Delay Export Rebuild (inside buildExportHtml)

```javascript
// Source: ARCHITECTURE.md Feature 3 pattern + Pitfall 3 prevention
// Uses String ops — NOT cheerio — to avoid re-serialization issues

if (delayScriptContent && delaySeconds !== undefined && delaySeconds !== null) {
  const safeDelay = Math.max(1, Math.round(Number(delaySeconds) || 1));
  const rebuilt = delayScriptContent.replace(
    /(?:var|let|const)\s+delaySeconds\s*=\s*\d+(?:\.\d+)?/,
    `var delaySeconds = ${safeDelay}`
  );
  const delayTag = `<script>\n${rebuilt}\n<\/script>`;
  if (outputHtml.includes('</body>')) {
    outputHtml = outputHtml.replace('</body>', `${delayTag}\n</body>`);
  } else {
    outputHtml += delayTag; // fallback for malformed HTML
  }
}
```

### Idempotency Sentinel (inside buildExportHtml)

```javascript
// Source: PITFALLS.md Pitfall 1 — sentinel guard approach

function buildExportHtml({ html, headerPixel, headerPreload, vslembed, checkoutLinks,
                           delaySeconds, delayScriptContent }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // EXPORT-06: Defensive guard — skip if already exported
  if ($('head').attr('data-vsl-injected')) {
    return html; // return unchanged — idempotency guaranteed
  }
  $('head').attr('data-vsl-injected', '1');

  // ... rest of function
}
```

### Frontend: State Extension and Delay Input Rendering

```javascript
// Source: index.html direct read — extends existing pattern at lines 391-395, 574-576

// State additions (extend existing state object)
// state.delaySeconds = null;
// state.hasDelay = false;
// state.delayScriptContent = null;

// In fetch response handler (after existing state assignments):
state.delaySeconds      = (data.summary && data.summary.delaySeconds)      || null;
state.hasDelay          = (data.summary && data.summary.hasDelay)           || false;
state.delayScriptContent = (data.summary && data.summary.delayScriptContent) || null;

var delayInput   = document.getElementById('delay-seconds');
var sectionDelay = document.getElementById('section-delay');
if (state.hasDelay && delayInput && sectionDelay) {
  delayInput.value = state.delaySeconds;
  showSection(sectionDelay);
}

// In export payload construction (after existing fields):
// Delay fields — only send if delay was detected
if (state.hasDelay && delayInput) {
  var delayVal = parseInt(delayInput.value, 10);
  if (!isNaN(delayVal) && delayVal >= 1) {
    payload.delaySeconds       = delayVal;
    payload.delayScriptContent = state.delayScriptContent;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cleanHtml returns `{ html, scriptsRemoved, vslDetected }` | Phase 4: add delay detection before cleanHtml, no change to cleanHtml return shape | Phase 4 | Delay detection is a pre-step, not inside cleanHtml — cleaner separation |
| buildExportHtml only appends pixel + preload to head | Phase 4: also appends delay script to body + idempotency sentinel | Phase 4 | Both export routes must pass new params |
| Frontend state has 3 fields | Phase 4: 6 fields | Phase 4 | State reset on second fetch must handle new fields |

**Pattern note:** The research doc ARCHITECTURE.md suggested modifying `cleanHtml()` to capture
the delay block internally. After reading the actual code (server.js lines 119-145), a
pre-`cleanHtml()` call in the fetch handler is cleaner: it keeps `cleanHtml()` single-purpose
(clean HTML, return what was done) and avoids extending its return shape further.

---

## Open Questions

1. **Should section C.5 (delay row) be inside section C or a separate card?**
   - What we know: Delay is logically related to the VTURB player (section C)
   - What's unclear: Section C may become crowded in future phases; standalone keeps clear boundaries
   - Recommendation: Standalone minimal card between C and D, hidden by default. Minimal DOM impact.

2. **What if `delaySeconds` in the original page is a float (e.g., 10.5)?**
   - What we know: `parseFloat` captures it; `<input type="number" step="1">` truncates to integer on UI
   - What's unclear: Whether fractional seconds are intentional or a page bug
   - Recommendation: Use `step="0.5"` on the input to allow halves; use `parseFloat` not `parseInt` on server

3. **Should the sentinel `data-vsl-injected` attribute survive in the downloaded HTML?**
   - What we know: It is added to `<head>` and will appear in the output file
   - What's unclear: Whether affiliates deploying the HTML might find this attribute confusing
   - Recommendation: Acceptable — it is a minor, harmless annotation. Document in comment.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is a pure code/config change. No external tools, databases, or
services are required beyond the already-running Node.js process (verified present, used in all
prior phases).

---

## Validation Architecture

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is
omitted per the research instructions.

The existing test infrastructure (`test-integration.js`) uses a custom assertion helper and runs
via `node test-integration.js`. The planner should add new test cases to this file covering:
- DELAY-01: fetch with delay fixture returns `hasDelay === true` and correct `delaySeconds`
- DELAY-03: export with modified `delaySeconds` contains the new value in output, old value absent
- EXPORT-06: calling `buildExportHtml` twice with same input produces identical output (no duplicates)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Frontend `state.fetchedHtml` is never overwritten after fetch (export always sends canonical clean HTML) | Pattern 3 / EXPORT-06 | If wrong, idempotency is already broken in v1.0 and sentinel guard becomes critical path |
| A2 | The real-world delay block always contains both `delaySeconds` and `displayHiddenElements` in the same `<script>` tag | Pattern 1 / Pitfall 2 | If pattern varies, detection misses; `hasDelay` stays false; user gets no delay input but export still works (graceful degradation) |
| A3 | `String.replace('</body>', ...)` reliably finds the closing body tag in all fetched pages after cheerio serialization | Pattern 2 | If tag is missing post-serialization (malformed input), fallback append handles it; no crash |

**A1 is verified by direct read** — index.html line 574 sets `state.fetchedHtml` once on fetch;
line 634 export handler reads it directly without mutation. [VERIFIED]

**A2 and A3 are ASSUMED** based on real VSL page structure analysis in FEATURES.md.

---

## Sources

### Primary (HIGH confidence)
- `/Users/victorroque/Downloads/Extrator2000/server.js` — full direct read; all function signatures,
  `SCRIPT_REMOVE_KEYWORDS`, `cleanHtml` internals, `buildExportHtml` signature, both export routes
- `/Users/victorroque/Downloads/Extrator2000/public/index.html` — full direct read; state object,
  fetch handler, export handler, all DOM references
- `/Users/victorroque/Downloads/Extrator2000/.planning/research/ARCHITECTURE.md` — milestone
  architecture research; Feature 3 (VTURB Delay) component map
- `/Users/victorroque/Downloads/Extrator2000/.planning/research/PITFALLS.md` — Pitfalls 1-3, 7,
  10, 12 directly apply to Phase 4
- `/Users/victorroque/Downloads/Extrator2000/.planning/research/FEATURES.md` — Feature 3 edge
  cases, detection pattern, critical edge case analysis
- `/Users/victorroque/Downloads/Extrator2000/.planning/REQUIREMENTS.md` — DELAY-01, DELAY-02,
  DELAY-03, EXPORT-06 verbatim
- `/Users/victorroque/Downloads/Extrator2000/test-integration.js` — existing test pattern for
  new test coverage additions
- `/Users/victorroque/Downloads/Extrator2000/package.json` — confirmed no new dependencies needed
- `/Users/victorroque/Downloads/Extrator2000/.planning/config.json` — `nyquist_validation: false`

### Tertiary (ASSUMED — flagged in Assumptions Log)
- A2: Real-world VTURB delay block structure (dual-condition regex anchor)
- A3: cheerio serialization always emits `</body>` for well-fetched pages

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies confirmed from package.json
- Architecture: HIGH — all decisions derived from direct code read; call order and function
  signatures verified from server.js lines 113-206, 415-431, 294-305
- Pitfalls: HIGH — all critical pitfalls sourced from milestone research docs that were themselves
  based on direct codebase inspection
- EXPORT-06 idempotency: HIGH — frontend contract already correct (verified); sentinel adds
  defense in depth at zero cost

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable stack; no external dependencies)
