# Domain Pitfalls

**Domain:** VSL Cloner v1.4 — Adding Elementor JSON export to existing Node.js + Express + cheerio HTML processor
**Researched:** 2026-04-20

---

## Critical Pitfalls

Mistakes that cause the import to silently fail, produce a blank page, or crash the Elementor editor.

---

### Pitfall 1: Non-Unique Element IDs Corrupt the Entire Page

**What goes wrong:** Every element in the Elementor JSON tree — containers and widgets at all depths — requires a unique `id` value. The reference file shows IDs that are between 6 and 8 hex characters (not a fixed length), and all 258 elements have distinct IDs. If two elements share the same ID, Elementor renders incorrectly: the editor may display one element where another should appear, CSS selectors targeting `.elementor-element-<id>` apply to the wrong element, and in some Elementor versions the editor crashes on load. This is a confirmed documented bug (Elementor GitHub issue #19137) where non-unique IDs cause accessibility failures and broken CSS isolation.

**Why it happens:** Naive generators reuse IDs by copying a template object for each element type (e.g., copy the "heading template" for every heading). Partial-tree generators produce IDs that are unique within a subtree but collide when the subtrees are joined. UUID truncation without collision checking produces collisions at scale when the output tree has 200+ elements.

**Consequences:** Wrong content renders in wrong place. Editor appears to import successfully but visual output is broken. Debugging is very hard because the import gives no error — the ID collision is invisible until you inspect the rendered CSS.

**Prevention:**
- Generate IDs using `crypto.randomBytes(4).toString('hex')` (Node.js built-in) — 4 bytes = 8 hex chars, matching the most common format in the reference file.
- Collect all generated IDs in a `Set` before writing the JSON; verify set size equals element count. If there is a collision, regenerate.
- Never copy an element object wholesale without regenerating its `id`. This applies to both the top-level element `id` field and the `_id` field on icon-list items and nested-accordion items (which use a separate `_id` key).
- Generate all IDs at tree-construction time, not lazily per-element, so the collision check covers the full tree.

**Detection:** After generating the JSON, run `jq '[.. | objects | .id? // empty] | length == ([.. | objects | .id? // empty] | unique | length)'` — must return `true`. Do the same for `_id` on leaf items.

**Phase:** Core JSON builder (initial implementation). Must be solved in Phase 1 before any widget-specific work.

---

### Pitfall 2: Missing or Wrong `isInner` Flag Breaks Container Layout

**What goes wrong:** Every element requires an `isInner` boolean. In the reference file: all 17 top-level containers have `isInner: false`; nested containers have `isInner: true` (84 of 101 containers total). If a nested container is marked `isInner: false`, Elementor treats it as a section-level block and applies wrong CSS — the container breaks out of its parent and renders at full viewport width. If a top-level container is marked `isInner: true`, it may be ignored or rendered with incorrect padding.

**Why it happens:** Generators that build the tree recursively often forget to thread a `depth` or `parentType` parameter down the call stack. The `isInner` value is derived from context (is this element a child of another container?), not from the element's own properties — so a stateless element factory has no way to set it correctly.

**Consequences:** Layout completely wrong. Multiple columns render as stacked full-width sections. Responsive layouts collapse. This is not recoverable by the affiliate after import; they would need to rebuild the layout manually.

**Prevention:**
- Pass a boolean `isTopLevel` parameter into the recursive tree builder. Top-level containers (direct children of `content[]`) get `isInner: false`. All other containers get `isInner: true`.
- Widgets always get `isInner: false` in the reference file — follow this convention (Elementor sets widget `isInner` based on whether it is inside an inner section, but in the flex-container model all widgets are peers, so `false` is safe for all widgets).
- Write a post-generation validator: walk the JSON tree, check that every `content[]` child has `isInner: false` and every deeper container has `isInner: true`.

**Detection:** Import the JSON in Elementor, switch to mobile view — layout breakage from wrong `isInner` is most visible at mobile widths where flex direction changes.

**Phase:** Core JSON builder.

---

### Pitfall 3: Third-Party Widget Types Break Import When Plugin is Absent

**What goes wrong:** The reference file contains `widgetType: "nested-accordion"` and settings keys prefixed with `eael_` (from the "Essential Addons for Elementor" plugin). If the affiliate's WordPress install does not have the same third-party plugins, Elementor cannot render those widget types. The import itself may succeed (the JSON is valid), but in the editor those elements show "Widget Type Not Found" or render as blank. The `eael_vto_writing_gradient_color_repeater` setting on `text-editor` widgets is also third-party and will be silently ignored.

**Why it happens:** The reference page was built with Essential Addons installed. The generated JSON inherits those widget types and settings. The generator does not know which plugins the importer has.

**Consequences:** Imported page has missing widgets. Affiliate must troubleshoot which plugin is needed. If `nested-accordion` is a key FAQ section, the entire section is blank.

**Prevention:**
- When converting HTML accordion/FAQ patterns to Elementor JSON, use only the native `accordion` widgetType (not `nested-accordion`) unless the generator explicitly targets Elementor Pro + Essential Addons installs.
- Do not copy `eael_*` setting keys from the reference file into generated output — they are settings from a third-party plugin and will be harmless (silently ignored) if present but never copy them as if they are required.
- `nested-accordion` is actually a native Elementor Core widget (added in Elementor 3.15), not a Pro widget. Verify this is available before using it. Use `html` widget as fallback for complex interactive elements if targeting broad compatibility.
- Document in the export UI: "Elementor JSON requires Elementor 3.15+ for accordion sections."

**Detection:** Import the generated JSON on a clean Elementor installation (no addons). Check that no widget shows "Widget Type Not Found."

**Phase:** Widget mapper implementation. Decide on widget type policy (native-only vs. specific plugin targets) before writing any widget converters.

---

### Pitfall 4: Image Widget `image.id` References a Non-Existent WordPress Attachment

**What goes wrong:** Elementor's image widget stores `settings.image = { "url": "...", "id": 2536 }`. The `id` is a WordPress media library attachment ID specific to the source site. When the JSON is imported to the affiliate's WordPress, that attachment ID does not exist. Elementor gracefully falls back to the `url` field for rendering, but certain features break: image size selection (thumbnail/medium/large) stops working, and any lightbox that resolves via attachment ID shows nothing. In WordPress multisite setups, a wrong attachment ID can cause a PHP fatal error in some Elementor versions.

**Why it happens:** The generator copies the `image.id` from the source page's Elementor data. The ID only has meaning in the original WordPress database.

**Consequences:** Images render correctly on first import (URL fallback works), but image controls in the editor break. Affiliate cannot swap the image from the Elementor panel — they must edit JSON manually.

**Prevention:**
- Always set `image.id` to `0` (zero) or omit it when generating JSON for cross-site use. Elementor uses the `url` field when `id` is 0 and gracefully degrades.
- Set `image.source` to `"library"` to signal that the image comes from the media library (rather than an external URL), which prevents Elementor from trying to resolve the attachment.
- For bundle images, the affiliate will supply a replacement URL — write that URL into `settings.image.url` and set `id: 0`.
- For images where `id` is unknown (all cases in the generator), use: `{ "url": "<absolute_url>", "id": 0, "alt": "", "source": "library" }`.

**Detection:** Import the JSON, open an image widget in the editor, and verify the Image tab shows the image thumbnail without a "Select Image" error.

**Phase:** Image widget converter.

---

### Pitfall 5: Responsive Settings Are Objects, Not Scalars — Wrong Type Fails Silently

**What goes wrong:** In Elementor JSON, responsive dimensional values (font sizes, padding, gap, width) are **objects** with a `unit` and `size` key, not raw numbers. Example: `"typography_font_size": { "unit": "px", "size": 50, "sizes": [] }`. If the generator writes `"typography_font_size": 50` (a bare number) or `"typography_font_size": "50px"` (a string), Elementor silently ignores the setting and uses the widget's default value. No import error is shown.

**Why it happens:** HTML/CSS parsing produces CSS values as strings like `"50px"`. The generator must decompose these strings into Elementor's `{ unit, size, sizes }` structure. A generator that skips this decomposition and copies raw CSS values directly into settings produces silently broken output.

**Consequences:** All font sizes, paddings, margins, gaps revert to Elementor defaults. The page looks completely different from the original after import. This is the most common silent failure in programmatic Elementor JSON generation.

**Prevention:**
- Write a CSS-value-to-Elementor-unit parser: `parseCSSValue("50px") → { unit: "px", size: 50, sizes: [] }`. Support `px`, `em`, `rem`, `%`, `vw`, `vh`.
- The `sizes` array is always `[]` in the reference file (it is for multi-breakpoint size arrays, unused in simple responsive setups).
- Mobile/tablet overrides follow the same structure: `"typography_font_size_mobile": { "unit": "px", "size": 28, "sizes": [] }`.
- Write a validator function that checks all known dimensional settings for the `{ unit, size, sizes }` shape before emitting JSON.
- For container flex-gap: `"flex_gap": { "unit": "px", "size": 20, "sizes": [] }` — same pattern.

**Detection:** Import the JSON and compare font sizes in the browser against the original page. If headings are all the same size (Elementor default), the object structure is wrong.

**Phase:** Responsive settings mapper — implement and test before any widget-specific work begins.

---

### Pitfall 6: HTML Widget Content With Inline `</script>` or `</style>` Breaks JSON Serialization

**What goes wrong:** The `html` widgetType stores arbitrary HTML in `settings.html`. In the reference file, HTML widgets contain Meta Pixel code, VTURB player embeds, and tracking scripts. These strings contain `</script>` tags. When this HTML is serialized into a JSON string without proper escaping, `JSON.stringify` in Node.js handles this correctly. However, if the generator builds the JSON using string concatenation or a template literal instead of `JSON.stringify`, the `</script>` inside the HTML value will terminate any surrounding `<script>` block that contains the JSON payload (a common pattern in WordPress where Elementor data is embedded as a `<script type="application/json">` block in the page source).

**Why it happens:** Direct string concatenation or template literals for JSON generation is a common shortcut. The issue only manifests when the JSON is embedded in a WordPress page's HTML source — it does not appear when the JSON is in a standalone `.json` file downloaded by the user.

**Consequences:** In a standalone `.json` file (the format the affiliate downloads), the issue does not break import. In a WordPress page source context, the `</script>` inside the HTML widget value terminates the JSON block early, causing a PHP parse error that corrupts the entire page. This is a latent defect that surfaces if the affiliate ever moves from JSON import to direct database population.

**Prevention:**
- Always use `JSON.stringify(payload, null, 2)` for the final JSON output — never string templates.
- For future resilience, escape `</script>` as `<\/script>` inside JSON strings when the JSON will be embedded in HTML (Node.js `JSON.stringify` does not do this automatically; use a post-processing replace).
- Write a generation test that includes a VTURB embed with `</script>` and verifies the output parses correctly via `JSON.parse`.

**Detection:** `JSON.parse(generatedJson)` in Node.js must succeed. This is the minimum test — add it as a required assertion in the export route before sending the response.

**Phase:** Core JSON builder (output serialization).

---

### Pitfall 7: Button `link.url` Must Be a Full Absolute URL — Relative or Empty Breaks Checkout

**What goes wrong:** Elementor button widgets store the CTA URL as `settings.link = { "url": "https://...", "is_external": "", "nofollow": "", "custom_attributes": "" }`. The `link` object must always be present with all four keys. If `url` is empty, the button renders without an `href` (dead link). If `url` is a relative path (`/checkout`), the button link resolves against the WordPress site's domain, not the original affiliate's checkout platform. The affiliate would not notice until the button is clicked on the live site.

**Why it happens:** Checkout link detection in the existing `detectCheckoutLinks` function returns the raw `href` value from the source page. If the source page uses a relative URL for the checkout (uncommon but possible), the generator will emit a relative `url` in the button widget.

**Consequences:** Checkout button is dead or links to the wrong URL. The affiliate loses sales. This is the most critical business logic failure in the export.

**Prevention:**
- Before writing `settings.link.url`, validate the URL is absolute (`/^https?:\/\//i.test(url)`). If it is relative, resolve it against the page's origin URL using `new URL(href, pageUrl).href`.
- Always emit all four keys in the `link` object. Never omit `is_external`, `nofollow`, or `custom_attributes` — Elementor expects the full object.
- The affiliate's checkout URL (their affiliate link) is always an absolute URL — write that into the button widget, not the original page's checkout URL.

**Detection:** Import the JSON. In the browser, hover over every button and verify `href` is an absolute `https://` URL.

**Phase:** Button widget converter and checkout link injection.

---

### Pitfall 8: Container `settings` Must Be `{}` (Object), Not `[]` (Array) When Non-Empty

**What goes wrong:** The Elementor JSON spec states that `settings` can be an empty array `[]` if no settings are defined, or a `settings` object `{}` when settings are present. In the reference file, all containers and widgets with actual settings use an object (`{}`), never an array. If a generator emits `settings: []` for an element that should have settings (e.g., a container that has flex direction, background, or padding), Elementor ignores all those settings and renders the container with defaults. If a generator emits `settings: { }` (empty object) where an empty array is acceptable, Elementor also handles this correctly — so the safe default is always `{}`.

**Why it happens:** JavaScript generators often initialize `settings` as `[]` (array) and push key-value entries into it. This works in JavaScript but produces an array, not an object. The correct pattern is to build settings as a plain object `{}` with direct key assignment.

**Consequences:** All layout settings (flex direction, padding, background color) silently ignored. Containers render with no background, no padding, wrong flex direction. The page looks like unstyled HTML.

**Prevention:**
- Always initialize settings as `{}` (empty object), never `[]`.
- Use object assignment: `settings.flex_direction = 'column'`, not `settings.push({ flex_direction: 'column' })`.
- Add a JSON schema assertion in the build pipeline: every `settings` value must be `typeof 'object' && !Array.isArray(settings)` when it has any keys.

**Detection:** `JSON.parse` and then iterate all elements checking `!Array.isArray(el.settings)` when `Object.keys(el.settings).length > 0`.

**Phase:** Core JSON builder.

---

## Moderate Pitfalls

---

### Pitfall 9: `nested-accordion` Items Use `_id` Not `id` — Inconsistent Key Name

**What goes wrong:** Top-level elements use `"id"` as their identifier key. But accordion items (in `settings.items[]`) and icon-list items (in `settings.icon_list[]`) use `"_id"` (with underscore). If a generator uses `id` for these sub-items, Elementor cannot track changes to them correctly in the editor. The page will render, but editing an accordion panel will update the wrong panel.

**Why it happens:** The inconsistency in Elementor's own data model is non-obvious. The `_id` key is documented only in practice, not in the official data structure reference.

**Prevention:**
- For `icon_list` items: `{ "text": "...", "selected_icon": {...}, "_id": "<7-char hex>" }`.
- For `nested-accordion` items: `{ "item_title": "...", "_id": "<7-char hex>" }`.
- Sub-item `_id` values must also be globally unique within the document. Generate them with the same collision-checked ID generator used for element `id` fields.

**Phase:** Widget-specific converters for accordion and icon-list.

---

### Pitfall 10: Font-Weight Must Be a String, Not a Number

**What goes wrong:** In the reference file, `"typography_font_weight": "700"` is a string, not the number `700`. If the generator emits `"typography_font_weight": 700` (number), Elementor may handle it, but the editor panel displays incorrectly because the control expects a string match to populate the dropdown.

**Why it happens:** CSS `font-weight` values are numbers in CSS parsing output. Generators copy the parsed numeric value without converting to string.

**Prevention:** Always convert font-weight to string: `String(parsedWeight)` before setting in the widget's `settings` object. Valid values are `"100"`, `"200"`, ..., `"900"`, `"normal"`, `"bold"`.

**Phase:** Typography settings mapper.

---

### Pitfall 11: Elementor JSON File Must Be UTF-8 Without BOM

**What goes wrong:** If the Node.js generator writes the JSON file with a UTF-8 BOM (Byte Order Mark, `\xEF\xBB\xBF` at the start), Elementor's importer rejects the file with "Invalid File" error. This is a confirmed Elementor bug (GitHub issue #13843) that has existed since at least 2021 and affects the import/upload flow even though the JSON content is otherwise valid.

**Why it happens:** Some text editors and older Node.js file writers prepend BOM to UTF-8 files. `fs.writeFileSync` in Node.js does NOT add BOM by default, so this is only a risk if the generator uses a BOM-adding library or if the file is hand-edited in certain Windows editors.

**Consequences:** Import completely fails with a cryptic "Invalid File" error. Affiliate cannot import at all.

**Prevention:**
- Use `fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')` — no BOM.
- In the HTTP response: `res.setHeader('Content-Type', 'application/json; charset=utf-8')` without adding BOM to the response body.
- Add a test: `Buffer.from(generatedJson)[0] !== 0xEF` (BOM starts with `0xEF`).

**Phase:** Export route implementation.

---

### Pitfall 12: CSS-to-Elementor-Settings Mapping Is Lossy — Many CSS Properties Have No Direct Equivalent

**What goes wrong:** HTML pages use arbitrary CSS properties (gradients, `clip-path`, `filter`, `mix-blend-mode`, `transform`, custom animations). Elementor's settings system only covers a subset of CSS: background color, border, padding, margin, font size, font weight, line height, and a handful of others. CSS that does not have a direct Elementor control cannot be expressed in the settings object. If the generator tries to map all CSS to settings, it will produce unknown setting keys that Elementor ignores — silently losing the styling.

**Why it happens:** The mapping is tempting to make comprehensive. It is not possible to be comprehensive; Elementor's controls are a curated subset.

**Consequences:** Generated page looks different from the original. Expected gradients, text shadows, transforms are absent.

**Prevention:**
- Limit settings mapping to what Elementor's controls definitively support: background color (solid), padding, margin, flex settings, font size, font weight, font family, line height, letter spacing, text color, border, border-radius.
- For any other CSS (gradients, transforms, animations, custom properties), use the `css_classes` setting to preserve the original class names, and document that the affiliate will need to add those CSS rules to the WordPress theme's Custom CSS.
- Alternatively, use the `html` widgetType with a `<div style="...">` wrapper for complex styled sections — this preserves all CSS exactly but loses Elementor editability.
- Do not attempt to generate `custom_css` control values from arbitrary CSS — the mapping is not deterministic.

**Phase:** CSS mapper implementation. This decision (map supported subset vs. html-widget fallback) must be made explicitly before implementation begins.

---

### Pitfall 13: `flex_direction` Default Is `row`, Not `column` — Wrong Default Breaks Column Layouts

**What goes wrong:** Elementor containers default to `flex_direction: "row"` when `flex_direction` is omitted. Most VSL page sections use vertical (column) stacking. If the generator omits `flex_direction` for a container that should be a column, all its children render side-by-side (row) instead of stacked, completely breaking the layout.

**Why it happens:** Generators that omit settings they think are "default" accidentally rely on a wrong default. `flex_direction: "column"` is the correct setting for most top-level VSL sections.

**Prevention:** Always emit `flex_direction` explicitly on every container. Do not rely on Elementor defaults. The reference file shows `flex_direction` set on all meaningful containers.

**Phase:** Container builder.

---

### Pitfall 14: Import via Editor Direct Upload vs. Backend Import — Elementor 4.0.x Regression

**What goes wrong:** Elementor 4.0.1 introduced a regression where importing a `.json` template directly inside the Editor (via the folder icon) fails with "Error occurred, this source does not support import". The same file imports correctly through the WordPress backend (Elementor → Templates → Import Templates). This is a confirmed regression (GitHub issue #35416) that affects the direct-upload workflow.

**Why it happens:** An internal change to Elementor's import source validation in version 4.0.x broke the in-editor import path for standalone JSON files.

**Consequences:** Affiliates who try to import via the editor's UI get a confusing error. They must use the backend Templates menu instead.

**Prevention:**
- In the export UI, provide explicit instructions: "Para importar, vá em Elementor → Templates → Importar Templates no painel WordPress (não use o botão de importação dentro do editor)."
- The JSON file format itself is not the problem — do not change the JSON in response to this error.

**Phase:** Export UI and user documentation. No code change required in the generator.

---

## Minor Pitfalls

---

### Pitfall 15: `type` Field Must Be `"page"`, Not `"container"` — Incorrect Type Changes Import Behavior

**What goes wrong:** The top-level JSON `type` field tells Elementor what kind of document is being imported. Valid values include `"page"`, `"section"`, `"header"`, `"footer"`, `"popup"`. If `type` is set to `"container"` (the element type for a flex container), Elementor treats the import as an unknown document type and may refuse it or import it as a library section rather than a full page.

**Prevention:** Always set `"type": "page"` for full-page imports. The reference file confirms `"type": "page"`.

**Phase:** Core JSON builder (top-level structure).

---

### Pitfall 16: `page_settings` Must Be `{}` (Object) When Empty, or `[]` (Array) — Not `null`

**What goes wrong:** The spec states `page_settings` is `[]` when empty or `{}` when populated. If a generator emits `"page_settings": null`, WordPress's PHP `json_decode` produces `null`, which Elementor cannot iterate, causing a PHP warning or fatal error on import.

**Prevention:** Emit `"page_settings": {}` as the safe default (empty object works in all Elementor versions; empty array also works per spec, but object is more consistent).

**Phase:** Core JSON builder (top-level structure).

---

### Pitfall 17: `typography_typography` Must Be Set to `"custom"` When Font Settings Are Present

**What goes wrong:** The reference file shows `"typography_typography": "custom"` on every element that has font-size, font-weight, or font-family settings. This control switch tells Elementor to use the custom values rather than a global kit typography preset. If `typography_typography` is omitted or set to `""`, Elementor ignores all other `typography_*` settings and applies the kit's global typography instead.

**Prevention:** Whenever generating any `typography_font_size`, `typography_font_weight`, or `typography_font_family` setting, always also emit `"typography_typography": "custom"`.

**Phase:** Typography settings mapper.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Core JSON builder | Non-unique element IDs (Pitfall 1) | Use crypto.randomBytes; collision-check full tree |
| Core JSON builder | Wrong `isInner` on containers (Pitfall 2) | Pass `isTopLevel` through recursive builder |
| Core JSON builder | `settings` as array instead of object (Pitfall 8) | Always initialize as `{}`, never `[]` |
| Core JSON builder | JSON serialization / BOM (Pitfalls 6, 11) | Use `JSON.stringify`; no BOM; parse-round-trip test |
| Core JSON builder | Wrong `type` or null `page_settings` (Pitfalls 15, 16) | Hardcode `"type": "page"`, emit `{}` for empty settings |
| Widget type policy | Third-party widgets (Pitfall 3) | Native Elementor widgets only; document plugin requirements |
| Image widget | WordPress attachment ID (Pitfall 4) | Always `"id": 0`; write affiliate URL into `image.url` |
| Responsive mapper | Dimensional values as scalars (Pitfall 5) | Parse CSS values to `{ unit, size, sizes }` objects |
| Typography mapper | Font-weight as number (Pitfall 10) | Convert to string; emit `typography_typography: "custom"` (Pitfall 17) |
| Container builder | Missing `flex_direction` (Pitfall 13) | Always emit explicitly; never rely on Elementor defaults |
| Button converter | Relative or missing checkout URL (Pitfall 7) | Resolve to absolute; emit all 4 link keys |
| Accordion/icon-list | Wrong key `id` vs `_id` on sub-items (Pitfall 9) | Use `_id` for all sub-item entries |
| CSS mapper | Unsupported CSS properties (Pitfall 12) | Map supported subset only; fallback to `css_classes` |
| Export UI | Elementor 4.0.x direct import regression (Pitfall 14) | Document backend import path in UI instructions |

---

## Sources

- Elementor Developers — General Elements structure: https://developers.elementor.com/docs/data-structure/general-elements/
- Elementor Developers — Widget Element: https://developers.elementor.com/docs/data-structure/widget-element/
- Elementor Developers — General Structure: https://developers.elementor.com/docs/data-structure/general-structure/
- Elementor Developers — Container Element: https://developers.elementor.com/docs/data-structure/container-element/
- Elementor GitHub Issue #19137 — Element IDs not unique (accessibility): https://github.com/elementor/elementor/issues/19137
- Elementor GitHub Issue #13843 — JSON export with BOM causes import failure: https://github.com/elementor/elementor/issues/13843
- Elementor GitHub Issue #35416 — Import error in Editor 4.0.x, works in backend: https://github.com/elementor/elementor/issues/35416
- Elementor GitHub Issue #21403 — Template Export/Import "invalid json" error: https://github.com/elementor/elementor/issues/21403
- Elementor JSON Validator tool: https://elementor.com/tools/json-validator/
- Reference file analysis: `/Users/victorroque/Downloads/Extrator2000/elementor-20405-2026-04-20.json` — direct inspection (258 elements, 17 top-level containers, 101 total containers, 6 widget types, responsive patterns, ID format distribution)
- Existing codebase: `/Users/victorroque/Downloads/Extrator2000/server.js` — `buildExportHtml`, `detectCheckoutLinks`, `applyCheckoutLinks` integration points
