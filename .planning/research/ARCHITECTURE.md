# Architecture Patterns: VSL Cloner v1.1

**Domain:** VSL page cloner — Node.js/Express + single-file frontend
**Researched:** 2026-04-11
**Confidence:** HIGH — based on direct codebase reading, no external research needed

---

## Existing Architecture (Baseline)

```
public/index.html  (vanilla JS, dark theme, PT-BR)
      |
      |  POST /api/fetch  { url }
      |  POST /api/export-zip  { html, headerPixel, headerPreload, vslembed, checkoutLinks[], pageUrl }
      v
server.js  (Express)
  cleanHtml(rawHtml)           → { html, scriptsRemoved, vslDetected }
  detectCheckoutLinks($, html) → checkoutLinks[]
  buildExportHtml(payload)     → outputHtml string
  applyCheckoutLinks(html, []) → outputHtml string
```

**Frontend state object (current):**
```js
state = {
  fetchedHtml: null,     // cleaned HTML string, held in memory only
  fetchedUrl: '',        // original URL (for ZIP asset resolution)
  checkoutLinks: [],     // [{ selector, href, anchorText, platform, bundle }]
}
```

**`/api/fetch` response shape (current):**
```json
{
  "html": "...",
  "summary": {
    "scriptsRemoved": 4,
    "vslDetected": true,
    "checkoutLinks": [{ "href": "...", "selector": "a.btn", "anchorText": "...", "platform": "ClickBank", "bundle": 2 }]
  }
}
```

**`/api/export-zip` request shape (current):**
```json
{
  "html": "...",
  "headerPixel": "...",
  "headerPreload": "...",
  "vslembed": "...",
  "checkoutLinks": [{ "selector": "a.btn", "affiliateHref": "..." }],
  "pageUrl": "https://..."
}
```

---

## Feature Integration Analysis

### Feature 1: Extra Scripts

**What it is:** A dynamic list of arbitrary `<script>` blocks the affiliate adds manually. On export they are injected into `<head>` after the existing pixel block.

**Server changes — `/api/fetch`:** None. The server does not detect extra scripts; this is purely user-supplied content.

**Server changes — `buildExportHtml`:** Add one extra `$('head').append()` call per extra script, after the existing `headerPixel` and `headerPreload` appends. The simplest shape is a single concatenated string:

```js
// export payload addition
extraScripts: "<script>...</script><script>...</script>"
```

Alternatively an array. A single string is simpler — the frontend concatenates entries before sending, the server appends the whole block once. Array adds flexibility but no real benefit here.

**Recommended export payload addition:**
```json
{ "extraScripts": "<script>block1</script>\n<script>block2</script>" }
```

**`buildExportHtml` change (server.js):**
```js
function buildExportHtml({ html, headerPixel, headerPreload, vslembed, checkoutLinks, extraScripts }) {
  const $ = cheerio.load(html, { decodeEntities: false });
  if (headerPixel && headerPixel.trim()) $('head').append(headerPixel);
  if (headerPreload && headerPreload.trim()) $('head').append(headerPreload);
  if (extraScripts && extraScripts.trim()) $('head').append(extraScripts);  // NEW
  // ... rest unchanged
}
```

**Frontend state addition:**
```js
state.extraScripts = [];  // [{ id: number, content: string }]
```

The frontend renders a tab/section "Scripts Extras" with an "Adicionar Script" button that appends a new `<textarea class="mono">` entry. Each entry gets a remove button. On export, all non-empty values are joined with `\n` and sent as `extraScripts`.

**Component touch points — Feature 1:**
- MODIFIED: `buildExportHtml()` — add `extraScripts` param and append
- MODIFIED: `/api/export` and `/api/export-zip` — destructure `extraScripts` from `req.body`, pass to `buildExportHtml`
- NEW: Section E in `index.html` — dynamic list UI with add/remove
- MODIFIED: `state` object — add `extraScripts` array
- MODIFIED: export click handler — join `state.extraScripts` and add to payload

---

### Feature 2: Bundle Images

**What it is:** The server detects product/bundle images (pote images) during fetch and returns them. The frontend shows a preview and lets the affiliate replace the `src` URL. On export the server swaps `src` attributes in the HTML.

**Detection logic (new helper in server.js):**

Bundle images on VSL pages are almost always `<img>` tags inside sections that contain bundle/checkout context. The reliable heuristic is: find all `<img>` tags inside the closest `section`, `div`, `td`, or `li` ancestor of a checkout link. De-duplicate by `src`.

```js
function detectBundleImages($) {
  const images = [];
  const seen = new Set();

  $('a, button').each((_, el) => {
    const href = $(el).attr('href') || '';
    const isCheckout = CHECKOUT_URL_PATTERNS.some(p => p.test(href));
    if (!isCheckout) return;

    const container = $(el).closest('section, div, td, li').first();
    container.find('img').each((_, img) => {
      const src = $(img).attr('src') || '';
      if (!src || src.startsWith('data:') || seen.has(src)) return;
      seen.add(src);
      images.push({ src, index: images.length });
    });
  });

  return images;
}
```

**`/api/fetch` response shape addition:**
```json
{
  "html": "...",
  "summary": {
    "scriptsRemoved": 4,
    "vslDetected": true,
    "checkoutLinks": [...],
    "bundleImages": [
      { "src": "https://cdn.example.com/pot-6.png", "index": 0 },
      { "src": "https://cdn.example.com/pot-3.png", "index": 1 }
    ]
  }
}
```

**Export replacement logic (new helper in server.js):**

Use cheerio `src` attribute replacement. Match by original `src` value exactly:

```js
function applyBundleImageReplacements(html, replacements) {
  if (!Array.isArray(replacements) || replacements.length === 0) return html;
  const $ = cheerio.load(html, { decodeEntities: false });
  for (const { originalSrc, newSrc } of replacements) {
    if (!originalSrc || !newSrc || !newSrc.trim()) continue;
    $('img').each((_, el) => {
      if ($(el).attr('src') === originalSrc) $(el).attr('src', newSrc);
    });
  }
  return $.html();
}
```

**`/api/export-zip` request shape addition:**
```json
{
  "bundleImageReplacements": [
    { "originalSrc": "https://cdn.example.com/pot-6.png", "newSrc": "https://new-cdn.com/my-pot-6.png" }
  ]
}
```

**`buildExportHtml` change:** Add `bundleImageReplacements` param; call `applyBundleImageReplacements` after all other transforms.

**Frontend state addition:**
```js
state.bundleImages = [];  // [{ src, index }] — from server response
```

The frontend renders a new section "Imagens de Bundle" that maps `state.bundleImages` to rows: `<img src="..." style="max-height:60px">` preview + `<input type="url">` for new URL. On export, build array of `{ originalSrc, newSrc }` for entries where `newSrc` is non-empty.

**Component touch points — Feature 2:**
- NEW: `detectBundleImages($)` helper in server.js
- MODIFIED: `/api/fetch` handler — call `detectBundleImages`, include in `summary.bundleImages`
- NEW: `applyBundleImageReplacements(html, replacements)` helper in server.js
- MODIFIED: `buildExportHtml()` — add `bundleImageReplacements` param, call new helper last
- MODIFIED: `/api/export` and `/api/export-zip` — destructure `bundleImageReplacements`, pass through
- NEW: Section F in `index.html` — image preview grid
- MODIFIED: `state` object — add `bundleImages` array
- MODIFIED: fetch response handler — store `data.summary.bundleImages`
- MODIFIED: export click handler — build and add `bundleImageReplacements` to payload

---

### Feature 3: VTURB Delay

**What it is:** VSL pages commonly contain a script block like:
```js
var delaySeconds = 10;
function displayHiddenElements() { ... }
```
The server extracts the current `delaySeconds` value during fetch. The frontend shows an editable number input. On export the server rebuilds the script block with the new value.

**Detection (modify `cleanHtml` or add separate helper):**

The delay block is removed by `cleanHtml` because it matches `vturb` keywords. It must be extracted BEFORE removal, or the detection must be added to the cleanup loop. The cleanest approach: add detection inside the `scriptsToRemove` collection loop in `cleanHtml`, capturing the delay value when a VTURB script is flagged.

```js
// Inside the scriptsToRemove loop, before pushing:
const delayMatch = content.match(/var\s+delaySeconds\s*=\s*(\d+)/);
if (delayMatch) {
  detectedDelay = parseInt(delayMatch[1], 10);
}
```

`cleanHtml` currently returns `{ html, scriptsRemoved, vslDetected }`. Extend to:
```js
return { html, scriptsRemoved, vslDetected, delaySeconds: detectedDelay, hasDelay: detectedDelay !== null };
```

**`/api/fetch` response shape addition:**
```json
{
  "html": "...",
  "summary": {
    "scriptsRemoved": 4,
    "vslDetected": true,
    "checkoutLinks": [...],
    "bundleImages": [...],
    "delaySeconds": 10,
    "hasDelay": true
  }
}
```

**Export rebuild logic:**

The original delay script block was removed during `cleanHtml`. On export, if `delaySeconds` is provided, the server must inject a new script block containing the delay and the `displayHiddenElements` call:

```js
function buildDelayScript(delaySeconds) {
  return `<script>
var delaySeconds = ${Number(delaySeconds)};
function displayHiddenElements() {
  var elements = document.querySelectorAll('.hidden-element, [data-hidden]');
  elements.forEach(function(el) { el.style.display = ''; });
}
setTimeout(displayHiddenElements, delaySeconds * 1000);
</script>`;
}
```

This is a partial reconstruction — the original `displayHiddenElements` body varies by page. The safe minimum is to reconstruct only the `var delaySeconds = N` and the `setTimeout` call. If the page's own inline body was removed alongside the vturb scripts, a full round-trip of the original function body is impossible without storing it. The practical approach: store the entire matching script block's content before removal, then re-emit it with the `delaySeconds` value substituted.

**Revised detection — store full content:**
```js
let capturedDelayBlock = null;
// Inside scriptsToRemove loop:
if (/var\s+delaySeconds\s*=\s*\d+/.test(content)) {
  detectedDelay = parseInt(content.match(/var\s+delaySeconds\s*=\s*(\d+)/)[1], 10);
  capturedDelayBlock = content;  // preserve full text
}
```

`cleanHtml` returns additionally: `delayScriptContent` (the full original script body). The `/api/fetch` response includes `delayScriptContent` in the summary (not in `html`). The frontend does not display it — it is opaque state. On export, the server swaps the `delaySeconds` value inside `delayScriptContent` and appends the result as a `<script>` tag at end of `<body>`.

**`/api/export-zip` request shape addition:**
```json
{
  "delaySeconds": 5,
  "delayScriptContent": "var delaySeconds = 10;\nfunction displayHiddenElements() { ... }"
}
```

**`buildExportHtml` change:** Add `delaySeconds` and `delayScriptContent` params. If both are present, rebuild and append to `<body>`:
```js
if (delayScriptContent && delaySeconds !== undefined) {
  const rebuilt = delayScriptContent.replace(
    /var\s+delaySeconds\s*=\s*\d+/,
    `var delaySeconds = ${Number(delaySeconds)}`
  );
  $('body').append(`<script>${rebuilt}<\/script>`);
}
```

**Frontend state addition:**
```js
state.delaySeconds = null;       // number or null
state.hasDelay = false;
state.delayScriptContent = null; // opaque string, re-sent to server on export
```

The frontend renders a small row inside an existing section (or a new minimal section) showing: label "Delay VTURB", `<input type="number" min="0">` pre-populated with `state.delaySeconds`. The input is only shown when `state.hasDelay` is true.

**Component touch points — Feature 3:**
- MODIFIED: `cleanHtml()` — extract `delaySeconds`, `delayScriptContent` before/during removal, add to return value
- MODIFIED: `/api/fetch` handler — include `delaySeconds`, `hasDelay`, `delayScriptContent` in `summary`
- MODIFIED: `buildExportHtml()` — add `delaySeconds`, `delayScriptContent` params, append rebuilt block
- MODIFIED: `/api/export` and `/api/export-zip` — destructure and pass through new params
- NEW: Delay input row in `index.html` (inside section C or a dedicated minimal section)
- MODIFIED: `state` object — add `delaySeconds`, `hasDelay`, `delayScriptContent`
- MODIFIED: fetch response handler — store delay fields from `data.summary`
- MODIFIED: export click handler — add delay fields to payload

---

## Complete Data Flow: v1.1

### `/api/fetch` response (final shape)
```json
{
  "html": "<cleaned page html>",
  "summary": {
    "scriptsRemoved": 4,
    "vslDetected": true,
    "checkoutLinks": [
      { "href": "https://hop.clickbank.net/...", "selector": "a.btn-buy", "anchorText": "Comprar", "platform": "ClickBank", "bundle": 6 }
    ],
    "bundleImages": [
      { "src": "https://cdn.example.com/6potes.png", "index": 0 },
      { "src": "https://cdn.example.com/3potes.png", "index": 1 }
    ],
    "delaySeconds": 10,
    "hasDelay": true,
    "delayScriptContent": "var delaySeconds = 10;\nfunction displayHiddenElements() { ... }"
  }
}
```

### `/api/export` and `/api/export-zip` request (final shape)
```json
{
  "html": "<cleaned page html>",
  "headerPixel": "<script><!-- affiliate pixel --></script>",
  "headerPreload": "<script data-vturb><!-- vturb preload --></script>",
  "vslembed": "<div id='smartplayer'>...</div>",
  "checkoutLinks": [
    { "selector": "a.btn-buy", "affiliateHref": "https://hop.clickbank.net/affiliate-id/..." }
  ],
  "extraScripts": "<script>/* script 1 */</script>\n<script>/* script 2 */</script>",
  "bundleImageReplacements": [
    { "originalSrc": "https://cdn.example.com/6potes.png", "newSrc": "https://newcdn.com/my-6potes.png" }
  ],
  "delaySeconds": 5,
  "delayScriptContent": "var delaySeconds = 10;\nfunction displayHiddenElements() { ... }",
  "pageUrl": "https://original-page.com/vsl"
}
```

### Frontend state (final shape)
```js
state = {
  fetchedHtml: null,           // string
  fetchedUrl: '',              // string
  checkoutLinks: [],           // [{ selector, href, anchorText, platform, bundle }]
  bundleImages: [],            // [{ src, index }]
  delaySeconds: null,          // number | null
  hasDelay: false,             // bool
  delayScriptContent: null,    // string | null (opaque, round-tripped to server)
  extraScripts: [],            // [{ id, content }] — managed locally, not from server
}
```

---

## Component Map: New vs Modified

| Component | Status | Changes |
|-----------|--------|---------|
| `cleanHtml()` | MODIFIED | Extract `delaySeconds`, `capturedDelayBlock` inside removal loop; expand return shape |
| `detectCheckoutLinks()` | UNCHANGED | No change |
| `detectBundleImages($)` | NEW | Called in `/api/fetch` handler after `cleanHtml` |
| `applyCheckoutLinks()` | UNCHANGED | No change |
| `applyBundleImageReplacements()` | NEW | Called in `buildExportHtml` after checkout replacement |
| `buildExportHtml()` | MODIFIED | Accept `extraScripts`, `bundleImageReplacements`, `delaySeconds`, `delayScriptContent`; call new helpers; append delay block |
| `/api/fetch` handler | MODIFIED | Call `detectBundleImages`; include new summary fields |
| `/api/export` handler | MODIFIED | Destructure new fields, pass to `buildExportHtml` |
| `/api/export-zip` handler | MODIFIED | Destructure new fields, pass to `buildExportHtml` |
| `index.html` — Section E (Extra Scripts) | NEW | Dynamic add/remove textarea list |
| `index.html` — Section F (Bundle Images) | NEW | Image preview + URL input grid |
| `index.html` — Delay row (in section C or standalone) | NEW | Number input, shown only when `hasDelay` |
| `index.html` — `state` object | MODIFIED | Add 5 new fields |
| `index.html` — fetch response handler | MODIFIED | Read and store new summary fields; render new sections |
| `index.html` — export click handler | MODIFIED | Add new fields to payload; build `bundleImageReplacements` and `extraScripts` before send |

---

## Build Order

Dependencies drive the order. Features share the `buildExportHtml` modification — tackle server-side first, then frontend per feature.

### Phase order recommendation

**Step 1 — VTURB Delay (Feature 3) — server side only**

Rationale: the change is entirely within `cleanHtml()`, which already iterates scripts. It is the smallest, most contained server change and touches code that must not regress. Do this first while the script-removal logic is freshly understood.

Deliverable: `cleanHtml` returns `delaySeconds`, `hasDelay`, `delayScriptContent`. `/api/fetch` includes these in `summary`. `buildExportHtml` accepts and applies them.

**Step 2 — Bundle Images (Feature 2) — server side only**

Rationale: adds a new independent helper (`detectBundleImages`) and a new independent export helper (`applyBundleImageReplacements`). No dependency on Feature 3 or Feature 1. Do server side before building the frontend section so there is a working API to test against.

Deliverable: `/api/fetch` response includes `summary.bundleImages`. `buildExportHtml` accepts and applies `bundleImageReplacements`.

**Step 3 — Extra Scripts (Feature 1) — server side only**

Rationale: the smallest server change — one `$('head').append()` line in `buildExportHtml`. Do last on the server because it depends on `buildExportHtml` being in its final signature shape after Steps 1 and 2.

Deliverable: `buildExportHtml` accepts `extraScripts` string and appends to `<head>`.

**Step 4 — Frontend: Delay row (Feature 3)**

Now that the server API is stable, build the frontend for each feature in the same dependency order. Delay is a single input row — fast to implement, easiest to verify.

**Step 5 — Frontend: Bundle Images section (Feature 2)**

Grid of image previews with URL inputs. Requires `state.bundleImages` to be populated from the fetch response handler before the section can render.

**Step 6 — Frontend: Extra Scripts tab (Feature 1)**

Dynamic add/remove list. Pure frontend state management, no server dependency beyond Step 3.

**Dependency graph:**
```
cleanHtml change (Step 1)
  └── /api/fetch new fields
        └── Frontend delay row (Step 4)
detectBundleImages (Step 2)
  └── /api/fetch bundleImages
        └── Frontend bundle images section (Step 5)
buildExportHtml extraScripts (Step 3)
  └── Frontend extra scripts tab (Step 6)
```

Steps 1, 2, and 3 can be written in a single server.js edit pass since they touch distinct code paths. The frontend steps must follow after the server changes are stable.

---

## Pitfalls Specific to These Features

**Bundle image detection false positives:** The heuristic (find `<img>` inside a checkout link's ancestor container) may pick up decorative images (icons, badges). Adding a minimum-dimension filter (`width > 60 || height > 60` from attribute values, or simply accepting noise and letting the user ignore extras) is preferable over over-engineering. Keep the detection permissive and let the user decide which images to replace.

**`delayScriptContent` round-trip size:** Passing the full script body back to the server in every export is harmless at this scale (local app, single user, scripts are typically under 2 KB). No caching layer is needed.

**`cleanHtml` receives raw HTML, not the already-cleaned version:** `detectBundleImages` must operate on the cleaned HTML (after `cleanHtml` runs), since the cleaned version is what gets stored in `state.fetchedHtml` and re-sent on export. The `/api/fetch` handler already creates a second `cheerio.load(cleanedHtml)` instance for `detectCheckoutLinks` — `detectBundleImages` reuses that same `$` instance.

**Extra scripts injection order:** The spec says after the existing pixel. `buildExportHtml` appends `headerPixel` first, then `headerPreload`, then `extraScripts`. Append order in cheerio is sequential, so this is guaranteed by call order. No additional sequencing mechanism is needed.

**Section IDs and state reset:** If the user fetches a second URL without reloading the page, `state` must be fully reset before the new fetch response is applied. The current code does not have an explicit reset. With more state fields (bundleImages, delaySeconds, etc.), a `resetState()` helper should be added to the fetch click handler before the API call completes.

---

## Sources

- Direct reading of `/Users/victorroque/Downloads/Extrator2000/server.js` (commit 1d774b8)
- Direct reading of `/Users/victorroque/Downloads/Extrator2000/public/index.html`
- `.planning/PROJECT.md` milestone definition
- Confidence: HIGH — all findings are from direct codebase inspection, not external sources
