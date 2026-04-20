# Feature Research — Elementor JSON Export (v1.4)

**Domain:** Elementor JSON template generation from VSL Cloner output
**Researched:** 2026-04-20
**Confidence:** HIGH — based on direct inspection of a real Elementor export file (elementor-20405-2026-04-20.json, 258 nodes) plus official developer documentation

---

## Context: This milestone is additive

The following features already exist and must NOT be regressed:

- HTML fetch/parse/clean, checkout link detection, pixel injection
- VTURB player embed, delay control, bundle image replacement
- Extra scripts tab, HTML export, ZIP export, folder upload
- `/api/export` and `/api/export-zip` (both use `buildExportHtml()`)

The Elementor JSON export is a new export pathway: `/api/export-elementor` returns a `.json` file
that Elementor can import directly via its template library. The existing HTML export is unchanged.

---

## What Elementor JSON Import Expects

### Required top-level structure (HIGH confidence — from real file + official docs)

```json
{
  "version": "0.4",
  "title": "Page Title",
  "type": "page",
  "page_settings": {},
  "content": [ /* array of container elements */ ]
}
```

All five fields must be present. `version` must be the string `"0.4"` (not a number). `type`
must be `"page"` for standard page import. `page_settings` can be an empty object `{}`.
`content` is the flat array of top-level container elements.

### Required element structure (HIGH confidence — from real file + official docs)

Every element in `content` and every nested element must have these exact fields:

```json
{
  "id": "a1b2c3d4",
  "elType": "container",
  "isInner": false,
  "settings": {},
  "elements": []
}
```

For widgets, add `"widgetType"`:

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "html",
  "isInner": false,
  "settings": { "html": "<p>content</p>" },
  "elements": []
}
```

**`id` format:** 7–8 lowercase hex characters (e.g. `"2f29558d"`, `"3940bbed"`). The real file
uses 8 chars for ~90% of IDs. Use `crypto.randomBytes(4).toString('hex')` in Node.js.

**`isInner`:** `false` for top-level containers and all direct children of `content[]`.
`true` for containers nested inside other containers (depth ≥ 2, context-dependent).
Elementor does not crash on wrong `isInner` values — it is used for internal rendering hints.
Safe default: always `false` for simplicity, Elementor will accept it.

**`settings`:** Can be an empty object `{}` — Elementor uses defaults for all missing settings.
Only include settings you explicitly want to override.

**`elements`:** Always present, always an array (empty `[]` for leaf widgets).

### Import mechanism (HIGH confidence — from official docs)

Elementor imports `.json` files via:
- Elementor Editor > Templates > Import Template (Upload file)
- Elementor Editor > Library > Import button
- wp-cli: `wp elementor library import path/to/file.json`

The import validates: (1) valid JSON, (2) top-level keys present, (3) `version` field exists.
It does NOT validate widget settings deeply — unknown or missing settings are silently ignored.
This means a JSON with minimal settings is safe to import; Elementor renders with defaults.

### Version compatibility (MEDIUM confidence — from docs + community)

Version `"0.4"` is the current and only version documented. Elementor has used it since at least
2021. No migration from other versions is performed — if you emit `"0.4"`, it imports on any
Elementor version that supports containers (Elementor 3.6+, released 2022). Before 3.6, only
`section`/`column` elTypes existed; containers are now the standard. The real file uses containers
exclusively — no `section` or `column` elements. Use containers.

### Containers Feature must be enabled (MEDIUM confidence — from community reports)

Elementor has a "Containers" experiment/feature flag. In older WordPress installs it may be
disabled. When importing a container-based JSON on a site with containers disabled, the import
may silently produce a blank page. This is a user environment issue, not a JSON generation issue.
The generated JSON should use containers because that is the current standard; document this
caveat for the affiliate.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single top-level HTML widget containing all content | Affiliates need something importable that works, even if not perfectly structured | LOW | Simplest approach: one container with one `html` widget holding the entire page body HTML. Always importable. |
| Pixel injection in HTML widget at top | Affiliate's pixel must fire on the Elementor page | LOW | Insert pixel HTML as a separate `html` widget in the first container, just like the existing HTML export does |
| VTURB player embed as HTML widget | Affiliate's video player must appear in the JSON | LOW | `html` widget with the VTURB embed code at the placeholder position |
| Checkout links replaced in content | The affiliate's links must be in the exported JSON | LOW | Run same `buildExportHtml()` logic before converting to JSON — reuse existing link replacement |
| Downloadable `.json` file | User expects a file they can upload directly to Elementor | LOW | Set `Content-Disposition: attachment; filename="elementor-template.json"` |
| Export button in UI | New export option alongside HTML and ZIP | LOW | Add third button to existing export section |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured widget mapping (heading, image, text-editor, button) | Better fidelity — Elementor can style widgets individually instead of treating everything as raw HTML | HIGH | Requires HTML-to-Elementor tree walking with cheerio. Significant complexity. |
| Responsive mobile settings preserved (`_mobile` suffix) | Page looks correct on mobile without affiliate tweaking | HIGH | Only valuable if doing structured mapping; flat HTML widget approach has no responsive settings |
| Bundle images as `image` widgets with external URLs | Images render natively in Elementor as media widgets, can be swapped in the editor | MEDIUM | `image` widget uses `{"url": "...", "id": 0}` — `id: 0` is safe for external URLs |
| Container color/background settings from detected page colors | Preserves visual identity (background colors, section colors) | MEDIUM | Populate `background_color` in container `settings` |
| Extra scripts tab content preserved as HTML widgets | All affiliate scripts appear in the JSON | LOW | Same as pixel injection — each script block becomes an `html` widget |

### Anti-Features (Do Not Attempt)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Full pixel-perfect HTML-to-Elementor tree conversion | Affiliates want perfect fidelity | Elementor's widget model does not 1:1 map to arbitrary HTML. CSS classes, JS behavior, custom layouts all break. Estimated 200+ hours for full fidelity. Never complete. | Use flat HTML widget containing all body content — 100% fidelity for behavior |
| Elementor CSS/style recreation from computed styles | Affiliates want exact fonts, colors | Requires parsing full CSS cascade, resolving inheritance, mapping to Elementor control IDs (typography_font_family, etc.). Fragile, always wrong for complex pages. | Inline styles in the HTML widget carry the visual — affiliates adjust in Elementor editor |
| WordPress media library integration | Affiliates want images to be in WP library | Requires WP API authentication, media upload endpoints, cross-origin sessions. Out of scope for a local Node.js tool. | Use external URL in `image` widget `settings.image.url` — works perfectly without library ID |
| `nested-accordion` generation from FAQ sections | Affiliates want FAQ sections as Elementor accordions | Detecting FAQ patterns reliably requires semantic understanding of arbitrary HTML. The `nested-accordion` widget has a complex data model (items array + child containers per item). | Output FAQ as `text-editor` or `html` widget — fully functional |
| `icon-box` / `icon-list` generation | Nice semantic structure | Requires FontAwesome library detection and icon mapping from HTML. Icon names in source HTML rarely match FA class names directly. | Output as `html` widget with inline styles — icons render via FA CSS already on the page |
| CSS injection via Elementor custom CSS fields | Some affiliates use custom CSS | Elementor's custom CSS per-widget is a separate control field. Mapping arbitrary `<style>` blocks to these fields is fragile. | Embed `<style>` blocks inside an `html` widget at the top of the page — identical behavior |

---

## Recommended Implementation Strategy

### The practical approach: "HTML envelope" pattern

Generate a single-container JSON where the Elementor structure is:

```
content[]
  └─ container (top-level, column direction, full-width)
       ├─ widget:html  ← pixel + extra scripts
       ├─ widget:html  ← page body content (entire cleaned HTML)
       └─ (optional) widget:html ← VTURB player at body end
```

This is:
- **100% importable** — validated against real Elementor import behavior
- **Zero HTML parsing complexity** — the body is a single HTML string
- **Zero fidelity loss for behavior** — JS, CSS, links, forms all work inside an `html` widget
- **Immediately useful** to the affiliate — opens in Elementor editor, page is functional

This approach uses exclusively the `html` widget (`widgetType: "html"`), which accepts
arbitrary HTML including `<script>`, `<style>`, `<link>`, `<noscript>`.

### Optional upgrade: structured sections (differentiator, high complexity)

If the roadmap allocates time for structure, add a second pass that generates structured widgets
for high-confidence elements:

- `<h1>`, `<h2>` inside sections → `heading` widget with `title` setting
- `<img src="...">` not inside body text → `image` widget with `settings.image.url`
- `<a href="checkout-url">` buttons → `button` widget with `settings.link.url` and `settings.text`
- Everything else → `html` widget fallback

This is additive — the HTML envelope always ships; structured mapping is an enhancement.

---

## Widget Specifications (from real file — HIGH confidence)

### `html` widget

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "html",
  "isInner": false,
  "settings": { "html": "<p>your html here</p>" },
  "elements": []
}
```

The `html` setting accepts any valid HTML string including `<script>` and `<style>` tags.
This is the primary widget for pixel injection and full-body content.

### `heading` widget (if structured mapping is attempted)

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "heading",
  "isInner": false,
  "settings": {
    "title": "Heading text",
    "align": "center",
    "title_color": "#FFFFFF"
  },
  "elements": []
}
```

Optional styling settings (all omit-safe): `typography_typography: "custom"`,
`typography_font_family`, `typography_font_size: {"unit": "px", "size": 40, "sizes": []}`,
`typography_font_weight`, `typography_font_size_mobile`.

### `text-editor` widget (if structured mapping is attempted)

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "text-editor",
  "isInner": false,
  "settings": {
    "editor": "<p>Rich text HTML</p>",
    "align": "start"
  },
  "elements": []
}
```

The `editor` field accepts HTML (similar to `html` setting). Use for paragraphs and rich text.

### `image` widget (if structured mapping or bundle images)

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "image",
  "isInner": false,
  "settings": {
    "image": {
      "url": "https://example.com/product-6-bottles.webp",
      "id": 0
    },
    "_element_width": "initial",
    "_element_custom_width": {"unit": "%", "size": 60, "sizes": []}
  },
  "elements": []
}
```

Key finding: `id` can be `0` (or even omitted) when using external URLs. Elementor renders
via the `url` field. The `id` is only needed for WordPress media library functions.

### `button` widget (if structured mapping is attempted)

```json
{
  "id": "a1b2c3d4",
  "elType": "widget",
  "widgetType": "button",
  "isInner": false,
  "settings": {
    "text": "BUY NOW",
    "align": "justify",
    "link": {
      "url": "https://checkout.example.com/buy",
      "is_external": "",
      "nofollow": "",
      "custom_attributes": ""
    },
    "button_text_color": "#000000",
    "background_color": "#FFD800"
  },
  "elements": []
}
```

The `link` field is the checkout URL. This widget is useful for affiliate's checkout buttons.

### Container settings (layout control)

```json
{
  "id": "a1b2c3d4",
  "elType": "container",
  "isInner": false,
  "settings": {
    "flex_direction": "column",
    "background_background": "classic",
    "background_color": "#A60B0D",
    "padding": {"unit": "px", "top": "20", "right": "20", "bottom": "20", "left": "20", "isLinked": true}
  },
  "elements": []
}
```

All container settings are optional. A container with `"settings": {}` is valid and importable.

---

## Feature Dependencies

```
[Elementor JSON Export button in UI]
    └──requires──> [/api/export-elementor endpoint]
                       └──requires──> [buildExportHtml() output as HTML source]
                                          └──requires──> [existing pixel/checkout/VTURB injection — already built]

[Structured widget mapping (differentiator)]
    └──requires──> [HTML-to-Elementor tree walker (new code)]
                       └──requires──> [Cheerio parsing of buildExportHtml() output]
    └──enhances──> [Elementor JSON Export button in UI]

[Bundle images as image widgets]
    └──requires──> [bundleImages[] data from existing detection — already built]
    └──enhances──> [Structured widget mapping]
```

### Dependency Notes

- **`/api/export-elementor` requires `buildExportHtml()` output:** The cleanest approach is to call
  the same `buildExportHtml()` function that the HTML export uses, then wrap the resulting HTML in
  the Elementor JSON envelope. This guarantees identical pixel/checkout/VTURB injection behavior.

- **Structured widget mapping requires cheerio re-parse:** After `buildExportHtml()` produces the
  final HTML, parse it again with cheerio to extract elements into Elementor widget objects.

- **`image` widget with external URL has no dependency on WordPress media:** `id: 0` is the
  correct value for external images. Do not attempt WP API integration.

---

## MVP Definition

### Launch With (v1.4 — this milestone)

- [ ] `/api/export-elementor` endpoint — accepts same payload as `/api/export`, returns JSON file
- [ ] HTML envelope pattern: one container, pixel as `html` widget, body as `html` widget
- [ ] All existing injections applied first (pixel, VTURB, checkout links, delay, extra scripts, bundle image replacements) via `buildExportHtml()` call before JSON wrapping
- [ ] Export button in UI labeled "Exportar Elementor (.json)"
- [ ] File downloaded as `pagina-afiliado-elementor.json`
- [ ] JSON uses version `"0.4"`, `type: "page"`, valid 8-char hex IDs

### Add After Validation (v1.4.x)

- [ ] Structured `heading` + `image` + `button` widgets for high-confidence elements — when affiliates report they want to edit sections in Elementor editor rather than in the HTML widget
- [ ] Container `background_color` from detected page colors — when affiliates report visual mismatch

### Future Consideration (v2+)

- [ ] Full semantic HTML-to-Elementor tree conversion — only if there is a clear user demand and willingness to maintain the mapping
- [ ] `nested-accordion` generation from FAQ detection — complex, low ROI for launch

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| HTML envelope JSON (one `html` widget) | HIGH | LOW | P1 |
| Export button in UI | HIGH | LOW | P1 |
| Pixel/checkout/VTURB injected before wrapping | HIGH | LOW (reuse existing) | P1 |
| Structured heading/image/button widgets | MEDIUM | HIGH | P2 |
| Container color settings | LOW | MEDIUM | P3 |
| Nested-accordion generation | LOW | HIGH | P3 |

---

## Required JSON Fields Summary

| Field | Level | Value | Required? |
|-------|-------|-------|-----------|
| `version` | root | `"0.4"` (string) | YES |
| `title` | root | any string | YES |
| `type` | root | `"page"` | YES |
| `page_settings` | root | `{}` | YES (can be empty) |
| `content` | root | array of container elements | YES |
| `id` | element | 7–8 char hex string | YES — must be unique |
| `elType` | element | `"container"` or `"widget"` | YES |
| `widgetType` | widget | `"html"`, `"heading"`, etc. | YES for widgets |
| `isInner` | element | boolean | YES — `false` is safe default |
| `settings` | element | object | YES (can be `{}`) |
| `elements` | element | array | YES (can be `[]`) |

---

## Sources

- Direct inspection: `/Users/victorroque/Downloads/Extrator2000/elementor-20405-2026-04-20.json` (real Elementor page export, 258 nodes, all widget types present) — HIGH confidence
- Official documentation: https://developers.elementor.com/docs/data-structure/general-structure/
- Official documentation: https://developers.elementor.com/docs/data-structure/widget-element/
- Official documentation: https://developers.elementor.com/docs/data-structure/container-element/
- Official documentation: https://developers.elementor.com/docs/editor-controls/control-media/
- Community: https://github.com/elementor/elementor/issues/21403 (import failure patterns)
- Project context: `/Users/victorroque/Downloads/Extrator2000/.planning/PROJECT.md`
- Codebase inspection: `/Users/victorroque/Downloads/Extrator2000/server.js`

---
*Feature research for: Elementor JSON export — VSL Cloner v1.4*
*Researched: 2026-04-20*
