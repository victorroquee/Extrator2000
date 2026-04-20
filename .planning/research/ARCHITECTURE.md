# Architecture Research

**Domain:** HTML-to-Elementor JSON conversion integrated into existing VSL Cloner pipeline
**Researched:** 2026-04-20
**Confidence:** HIGH (based on direct inspection of real Elementor JSON export file + full codebase reading)

---

## Prior Architecture (Baseline — v1.x)

The baseline architecture is documented in commits prior to this milestone. Key facts:

```
public/index.html  (vanilla JS, PT-BR)
      |
      |  POST /api/fetch               { url }
      |  POST /api/upload-folder       { files, paths }
      |  POST /api/export-validate     { html, ...affiliate fields }
      |  POST /api/export-zip          { html, ...affiliate fields }
      v
server.js (Express)
  cleanHtml(rawHtml)             → { html, scriptsRemoved, vslDetected }
  detectVturbDelay(rawHtml)      → { delaySeconds, delayScriptContent, delayType } | null
  detectCheckoutLinks($, html)   → checkoutLinks[]
  detectBundleImages($, links)   → bundleImages{}
  detectPageColors(html, url)    → pageColors[]
  detectProductName(html)        → { productName }
  detectAllProductImages($)      → allProductImages[]
  buildExportHtml(payload)       → outputHtml string
  applyCheckoutLinks(html, [])   → outputHtml string
```

---

## System Overview: Current + New Elementor Route

```
┌─────────────────────────────────────────────────────────────────────┐
│                     public/index.html (Vanilla JS UI)               │
│                                                                     │
│  [URL Input / Folder Upload]  →  [Affiliate Config Fields]          │
│         ↓                                                           │
│  buildExportPayload()   ←── same function, unchanged                │
│         ↓                              ↓                            │
│  doExport()                   [NEW] doExportElementor()             │
│  → validate → /api/export-zip        → /api/export-elementor        │
└───────────────────────┬────────────────────────┬────────────────────┘
                        │                        │
┌───────────────────────▼────────────────────────▼────────────────────┐
│                          server.js (Express)                        │
│                                                                     │
│  POST /api/fetch                POST /api/upload-folder             │
│       ↓                               ↓                             │
│  [detection pipeline — unchanged]     [same detection pipeline]     │
│       ↓ returns { html, summary }                                   │
│                                                                     │
│  POST /api/export-validate   POST /api/export-zip                   │
│       ↓ (existing)                ↓ (existing)                      │
│  buildExportHtml()            buildExportHtml()                     │
│                                   ↓                                 │
│                               archiver → ZIP                        │
│                                                                     │
│  [NEW] POST /api/export-elementor                                   │
│       ↓                                                             │
│  buildExportHtml()  ←── reuse exact existing function               │
│       ↓  affiliateHtml string                                       │
│  buildElementorJson(affiliateHtml)  ←── new function                │
│       ↓  Elementor JSON object                                      │
│  res.json() → Content-Disposition: attachment; filename=".json"     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Elementor JSON Schema (from real export: elementor-20405-2026-04-20.json)

Inspected a 184KB real Elementor export (258 nodes, 17 top-level containers, max nesting depth 7). Key findings:

**Root envelope — always this shape:**
```json
{
  "version": "0.4",
  "title": "Page Title",
  "type": "page",
  "page_settings": {},
  "content": [ /* array of top-level containers */ ]
}
```

**Container node:**
```json
{
  "id": "2f29558d",
  "elType": "container",
  "isInner": false,
  "settings": {
    "flex_direction": "column",
    "background_color": "#A60B0D",
    "padding": { "unit": "px", "top": "15", "right": "15", "bottom": "15", "left": "15", "isLinked": true },
    "css_classes": "esconder"
  },
  "elements": []
}
```

**HTML widget (the universal workhorse — used for pixel, player, custom sections, timers):**
```json
{
  "id": "4e345984",
  "elType": "widget",
  "widgetType": "html",
  "isInner": false,
  "settings": { "html": "<script>...</script>" },
  "elements": []
}
```

**Button widget (for checkout links with clean URL):**
```json
{
  "id": "fa1b2c3d",
  "elType": "widget",
  "widgetType": "button",
  "isInner": false,
  "settings": {
    "text": "BUY NOW",
    "link": { "url": "https://...", "is_external": "", "nofollow": "", "custom_attributes": "" },
    "background_color": "#hex",
    "button_text_color": "#hex",
    "align": "center"
  },
  "elements": []
}
```

**Image widget (for bundle/product images):**
```json
{
  "id": "3aa3c4f0",
  "elType": "widget",
  "widgetType": "image",
  "isInner": false,
  "settings": {
    "image": { "url": "https://cdn.example.com/image.webp" },
    "_element_width": "initial",
    "_element_custom_width": { "unit": "%", "size": 100, "sizes": [] },
    "_flex_align_self": "center"
  },
  "elements": []
}
```

**Critical observation:** The real Elementor export uses `html` widgets for the majority of content — pixel scripts, VTURB player, ticker animations, countdown timers, CSS blocks. This validates using `html` widgets as the primary conversion target rather than attempting full DOM decomposition.

---

## Recommended Architecture for buildElementorJson()

### Conversion pipeline

```
affiliateHtml (output of buildExportHtml)
    ↓
cheerio.load(affiliateHtml)
    ↓
Extract <head> content  → head_scripts_container (html widget)
    ↓
Extract <body> children → section_containers[]
    ↓
For each body section:
  - Detect background color from style/class → container settings.background_color
  - Detect .esconder class → container settings.css_classes = "esconder"
  - Detect padding from style → container settings.padding
  - Wrap section innerHTML in html widget (default path)
  - Upgrade to image widget if section is a lone <img> tag
  - Upgrade to button widget if section is a simple <a> checkout link
    ↓
Assemble root envelope + emit JSON
```

### ID generation

Elementor uses 8-character hex IDs (e.g., `"2f29558d"`). Implementation: `crypto.randomBytes(4).toString('hex')`. The `crypto` module is already imported in server.js with `const crypto = require('crypto')` — zero new dependencies.

### Section detection heuristic

VSL pages are single-column landing pages. The reliable strategy: direct `<body>` children that are block-level elements become top-level Elementor containers. Depth of nesting inside each section is preserved inside the `html` widget's raw HTML content.

Priority order for section boundaries:
1. `<section>` elements at body level → one container each
2. `<div>` with `id` or a distinctive class (not utility/layout classes) at body level → one container each
3. The `#vsl-placeholder` or VTURB embed after injection → one dedicated container (the player section)
4. `<div class="esconder ...">` → container gets `css_classes: "esconder"` so the delay system keeps working
5. Remaining content that does not fit clean sectioning → one catch-all html widget container

---

## Data Flow: New Route

### Request / response

```
[User clicks "Exportar JSON Elementor" in UI]
    ↓
doExportElementor() in index.html
    ↓  payload = buildExportPayload()  (same function, unchanged)
POST /api/export-elementor  { html, headerPixel, vslembed, checkoutLinks, delaySeconds, ... }
    ↓
buildExportHtml({ ...payload })   ← existing function, returns affiliateHtml string
    ↓
buildElementorJson(affiliateHtml, opts)   ← new function
    ↓  returns JS object: { version, title, type, page_settings, content }
    ↓
res.setHeader('Content-Type', 'application/json')
res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.json"')
res.json(elementorJson)
```

### Where affiliate customizations land in the Elementor JSON

| Customization | Applied by | Where it appears in Elementor JSON |
|--------------|-----------|-------------------------------------|
| Meta Pixel (`headerPixel`) | `buildExportHtml` → injected into `<head>` | First `html` widget (extracted from `<head>`) |
| VTURB embed (`vslembed`) | `buildExportHtml` → replaces `<!-- [VSL_PLACEHOLDER] -->` | `html` widget inside the player container |
| Checkout links | `buildExportHtml` → `applyCheckoutLinks` rewrites hrefs | `button` widget or raw in `html` widget |
| Delay script | `buildExportHtml` → appended before `</body>` | `html` widget in last container |
| Color replacements | `buildExportHtml` → CSS override `<style>` in `<head>` | First `html` widget (head content) |
| Product name | `buildExportHtml` → string replace in HTML | Wherever it appears in `html` widget content |
| Bundle images | `buildExportHtml` → swaps `src` attrs | `image` widget or raw in `html` widget |

Key insight: because `buildExportHtml()` is called first, `buildElementorJson()` receives a fully-baked HTML string. It does not need to understand or replicate any affiliate injection logic — it only needs to convert structure.

---

## Component Map: New vs Modified

| Component | Status | What changes |
|-----------|--------|--------------|
| `buildElementorJson(html, opts)` | NEW in server.js | Core conversion function; cheerio traversal → JSON |
| `POST /api/export-elementor` | NEW route in server.js | Calls buildExportHtml → buildElementorJson → res.json |
| `doExportElementor()` | NEW function in index.html | Sends payload, triggers .json download |
| `btn-export-elementor` | NEW button in index.html HTML | Lives alongside existing export buttons in export section |
| `setExportEnabled()` | MODIFIED in index.html | Must include the new button |
| `buildExportHtml()` | UNTOUCHED | No changes required |
| `buildExportPayload()` | UNTOUCHED | Existing payload shape works as-is |
| `cleanHtml()` | UNTOUCHED | No changes required |
| All detection helpers | UNTOUCHED | No changes required |
| All existing routes | UNTOUCHED | No changes required |

---

## Recommended Build Order

Dependencies are linear. Build in this exact sequence:

**Step 1 — `buildElementorJson()` function (server.js only)**

Write and test the conversion function in isolation. Input: a known HTML string. Output: Elementor JSON object. Validate by importing the result into Elementor. No frontend work yet, no route needed — test via a temporary inline call or unit test.

**Step 2 — `POST /api/export-elementor` route (server.js)**

Wire `buildExportHtml()` → `buildElementorJson()` → file download. Test the complete server-side pipeline with curl or Postman using a real export payload before touching the UI.

**Step 3 — Frontend button + `doExportElementor()` (index.html)**

Add the "Exportar JSON Elementor" button to the existing export section. Write `doExportElementor()` which calls `buildExportPayload()` (unchanged) and sends to the new route. Trigger `.json` file download with a Blob URL, identical pattern to the existing `doActualDownload()` for ZIP.

**Step 4 — End-to-end validation**

Import the generated `.json` into WordPress/Elementor. Verify: pixel in head, VTURB player renders, checkout links correct, `.esconder` sections hidden initially, delay script fires.

Dependency graph:
```
buildElementorJson() (Step 1)
    └── POST /api/export-elementor (Step 2)
            └── doExportElementor() + button (Step 3)
                    └── Import validation (Step 4)
```

---

## Anti-Patterns

### Anti-Pattern 1: Convert from clean HTML instead of affiliate HTML

**What people do:** Call `buildElementorJson(state.fetchedHtml)` directly, bypassing `buildExportHtml()`.

**Why it's wrong:** The Elementor JSON would contain the cleaned page — no pixel, no VTURB embed, no affiliate checkout links, no delay script. The import would be completely wrong for the affiliate.

**Do this instead:** The `/api/export-elementor` route must call `buildExportHtml()` first, exactly like `/api/export-zip` does. Pass its output to `buildElementorJson()`.

### Anti-Pattern 2: Attempting full DOM-to-widget decomposition

**What people do:** Try to map every `<h1>`, `<p>`, `<ul>`, `<img>` to native Elementor `heading`, `text-editor`, `icon-list`, `image` widgets respectively.

**Why it's wrong:** VSL pages have hundreds of inline-styled elements, custom CSS classes, complex nested structures, and JS-dependent rendering. Full decomposition is unreliable and produces broken layouts. The real Elementor export (inspected directly) uses `html` widgets for most content, including pixel scripts, player, timers, and all custom sections.

**Do this instead:** Map page sections (structural body-level blocks) to containers, wrap each section's inner content in a single `html` widget. Selectively upgrade only obvious, unambiguous elements: a standalone `<img>` → `image` widget; a simple `<a>` or `<button>` checkout link → `button` widget.

### Anti-Pattern 3: Including full HTML document inside html widget

**What people do:** Pass the full `<html><head>...</head><body>...</body></html>` output from `buildExportHtml()` directly as the content of one `html` widget.

**Why it's wrong:** Elementor imports into WordPress which provides its own document structure. Injecting a full HTML document into a widget causes broken markup and double execution of scripts.

**Do this instead:** `buildElementorJson()` calls `cheerio.load(affiliateHtml)` and extracts `$('head').html()` (for head scripts container) and `$('body').children()` (for content containers) separately.

### Anti-Pattern 4: Sequential or patterned IDs

**What people do:** Generate IDs as `"el_0001"`, `"el_0002"`, or short hex `"1"`, `"2"`.

**Why it's wrong:** Elementor expects 8-character hex IDs. Non-conforming IDs may cause import validation failures or collide with existing page elements.

**Do this instead:** `crypto.randomBytes(4).toString('hex')` — already available via the existing `crypto` import.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `buildExportHtml` → `buildElementorJson` | Direct call, HTML string in / JS object out | `buildElementorJson` is stateless, pure function |
| `/api/export-elementor` route → both functions | Sequential calls within route handler | Same pattern as `/api/export-zip` |
| Frontend `doExportElementor` → route | HTTP POST, identical JSON body to export-zip | `buildExportPayload()` reused unchanged |
| ID generation | `crypto.randomBytes(4).toString('hex')` per node | `crypto` already imported in server.js |

### External Dependencies

None. No new npm packages required. The conversion is pure JavaScript + cheerio (already installed).

---

## Sources

- Direct inspection: `/Users/victorroque/Downloads/Extrator2000/elementor-20405-2026-04-20.json` — real Elementor JSON export (184KB, 258 nodes, 17 top-level containers, 7 nesting levels max)
- Direct reading: `/Users/victorroque/Downloads/Extrator2000/server.js` — full codebase
- Direct reading: `/Users/victorroque/Downloads/Extrator2000/public/index.html` — frontend export flow
- Direct reading: `/Users/victorroque/Downloads/Extrator2000/.planning/PROJECT.md` — milestone definition

---
*Architecture research for: Elementor JSON export integration into VSL Cloner*
*Researched: 2026-04-20*
