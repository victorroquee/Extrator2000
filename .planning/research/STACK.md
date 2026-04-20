# Stack Research

**Domain:** Elementor JSON export — HTML-to-Elementor conversion
**Researched:** 2026-04-20
**Scope:** NEW capabilities only for v1.4. Existing stack (Express + axios + cheerio + archiver + multer) is validated; not re-researched.
**Confidence:** HIGH

---

## Verdict: No New npm Packages Required

The Elementor JSON export is fully implementable with the existing dependency set plus Node.js built-ins. After inspecting the real Elementor export file (`elementor-20405-2026-04-20.json`) and the complete `server.js` pipeline, there is no capability gap that requires a new package.

Key findings from the JSON inspection:
- Elementor JSON is a plain object: `{ content, page_settings, version, title, type }`
- All elements are either `elType: "container"` or `elType: "widget"`
- Widget types in use: `html`, `heading`, `text-editor`, `image`, `button`, `icon-list`, `icon-box`, `nested-accordion`
- Element IDs are lowercase hex strings of 6-8 chars (e.g., `"2f29558d"`)
- Responsive settings use `_mobile` suffix keys (e.g., `typography_font_size_mobile`)
- CSS parsing is NOT needed: the conversion strategy is wrapping content in `html` widgets, not reconstructing typography/layout from scratch

---

## Recommended Stack

### Core Technologies (unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| cheerio | ^1.0.0 | Parse cleaned HTML, extract sections/elements | Already in pipeline; `$.html(el)` produces the exact HTML string needed for `html` widget `settings.html` |
| Node.js `crypto` | built-in | Generate unique element IDs | Already in use (`crypto.randomUUID()`); short hex IDs generated via `randomBytes(4).toString('hex')` |
| `JSON.stringify` | built-in | Serialize final Elementor JSON | Native, no library needed |

### What the HTML-to-Elementor Conversion Actually Requires

Inspect the real Elementor file: all complex content (headings, text, images, buttons, video players, pixels) is stored either as native widget settings OR as raw HTML inside `html` widgets. This means the conversion strategy is:

**Strategy: Structural HTML wrapping, not CSS reconstruction.**

Each top-level `<section>` or `<div>` block in the cleaned HTML becomes one Elementor `container`. Its inner HTML goes into a single `html` widget. Injected VTURB, pixel, delay, checkout links are already in the cleaned+injected HTML string — they carry over verbatim.

This approach:
- Requires only cheerio (already present) to iterate top-level blocks
- Requires only `crypto.randomBytes` (already present) for unique hex IDs
- Requires zero CSS parsing because widget type `html` accepts raw HTML including inline styles
- Produces a valid, importable Elementor page — proven by the reference file structure

### Supporting Libraries

None needed. Specific rejections documented below.

---

## Element ID Generation

Elementor uses lowercase hex IDs of 6-8 characters. Node.js `crypto.randomBytes` is already imported:

```js
// Already in server.js: const crypto = require('crypto');

function elementorId() {
  return crypto.randomBytes(4).toString('hex'); // 8-char hex, matches Elementor's own format
}
```

Do NOT use `crypto.randomUUID()` for this — Elementor IDs are short hex strings, not UUIDs.

---

## JSON Structure Reference (from real export)

```json
{
  "content": [
    {
      "id": "2f29558d",
      "elType": "container",
      "isInner": false,
      "settings": {
        "flex_direction": "column",
        "background_background": "classic",
        "background_color": "#RRGGBB",
        "flex_gap": { "column": "0", "row": "0", "isLinked": true, "unit": "px", "size": 0 },
        "flex_gap_mobile": { "column": "0", "row": "0", "isLinked": true, "unit": "px", "size": 0 }
      },
      "elements": [
        {
          "id": "1d3fccd3",
          "elType": "widget",
          "widgetType": "html",
          "isInner": false,
          "settings": { "html": "<raw html string here>" },
          "elements": []
        }
      ]
    }
  ],
  "page_settings": {},
  "version": "0.4",
  "title": "Página Afiliado",
  "type": "page"
}
```

The `html` widget is the universal escape hatch: it accepts arbitrary HTML. Pixel code, VTURB embeds, delay scripts, checkout buttons — all already injected by `buildExportHtml` — are placed as-is inside `html` widgets.

---

## Integration Points with Existing Pipeline

The export route pattern already exists for HTML and ZIP. Elementor JSON follows the same shape:

1. **Input:** Same payload as `/api/export` — `html`, `headerPixel`, `vslembed`, `checkoutLinks`, `delaySeconds`, `bundleImages`, etc.
2. **Processing:** Call `buildExportHtml(...)` exactly as the existing routes do. This returns the fully-injected HTML string.
3. **Conversion:** Parse the injected HTML with cheerio. Iterate top-level children of `<body>`. Each becomes a `container` with one inner `html` widget.
4. **Output:** `JSON.stringify(elementorDoc)` sent as `Content-Disposition: attachment; filename="pagina-afiliado.json"` with `Content-Type: application/json`.

New route: `POST /api/export-elementor` — mirrors `/api/export` but adds the cheerio-to-JSON conversion step and changes the response content type.

---

## Alternatives Considered and Rejected

| Considered | For | Rejected Because |
|------------|-----|-----------------|
| `css-tree` | Parsing CSS to extract computed styles for Elementor typography settings | Not needed — the `html` widget accepts raw HTML with inline styles; no need to reconstruct font-size/color as Elementor widget settings |
| `html-to-json` / custom recursive mapper | Full semantic conversion (heading → heading widget, p → text-editor widget) | Fragile — VSL pages use non-standard markup; html widget approach is robust and produces functionally identical pages |
| `uuid` npm package | Elementor element IDs | Overkill — `crypto.randomBytes(4).toString('hex')` already in the codebase produces the right format |
| `jsdom` | Richer DOM traversal than cheerio | Already rejected in v1.1; cheerio's `.children()` and `.html()` are sufficient for top-level section splitting |
| Puppeteer/headless browser | Getting "rendered" HTML to capture JS-generated content | Out of scope; the existing axios fetch handles VSL pages adequately |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Full semantic HTML→Elementor mapping (heading→heading widget, p→text-editor widget) | VSL pages use arbitrary markup; semantic mapping breaks on complex layouts, nested tables, custom CSS classes | `html` widget wrapping — robust, zero mapping logic, Elementor renders it identically |
| CSS parsing libraries (`css-tree`, `postcss`) | The responsive settings (`_mobile` keys) in Elementor native widgets require knowing the original Elementor widget that generated them — impossible to reconstruct from a cloned page | Omit per-element responsive settings; use a single container with `flex_direction: column` and sensible defaults |
| Generating native Elementor heading/text-editor/image widgets from HTML | Requires CSS extraction + style mapping + font detection; extremely fragile | `html` widget |

---

## Responsive Settings Strategy

The reference file shows `_mobile` suffix settings on containers and widgets (e.g., `typography_font_size_mobile`, `padding_mobile`, `flex_gap_mobile`). These are needed for native widgets. Since this implementation uses `html` widgets for all content, the mobile CSS is already embedded inside the raw HTML (inline styles, CSS classes from the original page's stylesheet references). No `_mobile` Elementor settings are required on the wrapper containers — set only the minimum:

```json
{
  "flex_direction": "column",
  "flex_gap": { "column": "0", "row": "0", "isLinked": true, "unit": "px", "size": 0 }
}
```

This is sufficient for a valid, importable Elementor page. The visual fidelity comes from the original page's CSS (which the `html` widgets preserve), not from Elementor's own style system.

---

## Sources

- Direct inspection of `elementor-20405-2026-04-20.json` (258 elements, 17 top-level containers, 8 widget types) — HIGH confidence
- `server.js` full read — confirmed `crypto` is already imported, `buildExportHtml` is the correct integration point — HIGH confidence
- Elementor export format: `version: "0.4"`, `type: "page"`, containers + widgets with `html` widget as universal content escape hatch — HIGH confidence from real file, not docs

---
*Stack research for: Elementor JSON export (v1.4 milestone)*
*Researched: 2026-04-20*
