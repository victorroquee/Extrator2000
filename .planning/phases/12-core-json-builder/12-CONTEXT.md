# Phase 12: Core JSON Builder - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `buildElementorJson()` function in server.js that converts affiliate-customized HTML (output of `buildExportHtml()`) into a valid Elementor-importable JSON structure. This is a pure backend function — no routes or UI in this phase.

</domain>

<decisions>
## Implementation Decisions

### Section Splitting Strategy
- **D-01:** Use body direct children as container boundaries. Each direct child of `<body>` becomes a separate top-level container in the Elementor JSON content array. Simple, predictable, works for 90%+ of VSL pages.
- **D-02:** If `<body>` has only one child (wrapper div), look one level deeper — use that wrapper's children as containers. This prevents collapsing the entire page into one giant block.

### Head Scripts Handling
- **D-03:** Head scripts (pixel, preload, extra scripts) go in a dedicated first container at the top of the JSON content array. This container holds one `html` widget with all `<head>` content that `buildExportHtml()` injected (headerPixel, headerPreload, extraScripts). This makes scripts visible and editable inside the Elementor editor.
- **D-04:** The `<style>` and `<link>` tags from `<head>` should also be captured in the first container so CSS survives the import.

### Element IDs
- **D-05:** Generate 8-character lowercase hex IDs using `crypto.randomBytes(4).toString('hex')`. This matches the pattern found in the reference Elementor file. Every element (container and widget) gets a unique ID.

### JSON Envelope
- **D-06:** Root JSON structure: `{ version: "0.4", type: "page", title: "<extracted from page>", page_settings: {}, content: [...] }`. Version 0.4 matches the reference file.
- **D-07:** Each container: `{ id, elType: "container", isInner: false, settings: { flex_direction: "column" }, elements: [<widget>] }`.
- **D-08:** Each widget: `{ id, elType: "widget", widgetType: "html", isInner: false, settings: { html: "<section markup>" }, elements: [] }`.

### Filename
- **D-09:** Download filename derived from page `<title>`: slugified, prefixed with "elementor-". Example: `<title>BurnSlim - Official</title>` → `elementor-burnslim-official.json`. Fallback to `elementor-page.json` if no title found.

### Claude's Discretion
- How to handle edge cases where `<body>` children are text nodes or comments (skip them)
- Whether to include `<meta>` tags in the head container (not needed — Elementor manages its own meta)
- Error handling for malformed HTML input

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Elementor JSON Structure
- `elementor-20405-2026-04-20.json` — Reference Elementor export file (258 elements, 17 sections, 8 widget types). Study the container/widget nesting and settings patterns.

### Existing Export Pipeline
- `server.js` §1095-1142 — `buildExportHtml()` function signature and injection logic
- `server.js` §1297-1314 — `/api/export` route (payload shape reference)
- `server.js` §1394+ — `/api/export-zip` route (payload shape reference)
- `server.js` §9 — `crypto` import (already available)

### Research
- `.planning/research/STACK.md` — Stack decisions (zero new packages, crypto + cheerio sufficient)
- `.planning/research/ARCHITECTURE.md` — Integration architecture and data flow
- `.planning/research/PITFALLS.md` — 17 pitfalls to avoid (ID uniqueness, responsive settings, isInner semantics)
- `.planning/research/SUMMARY.md` — Synthesis of all research findings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `crypto` module — already imported in server.js line 9, use `crypto.randomBytes(4).toString('hex')` for IDs
- `cheerio` — already imported and used throughout for HTML parsing
- `buildExportHtml()` — produces the fully-injected HTML that this function will convert

### Established Patterns
- Export routes destructure the same payload shape: `{ html, headerPixel, headerPreload, vslembed, checkoutLinks, delaySeconds, ... }`
- `buildExportHtml()` returns an HTML string with all affiliate customizations applied
- `cheerio.load(html, { decodeEntities: false })` is the standard parsing pattern

### Integration Points
- `buildElementorJson()` will be called AFTER `buildExportHtml()` — takes the output HTML string as input
- New function sits alongside `buildExportHtml()` in server.js (around line 1095)
- Will be consumed by the new `/api/export-elementor` route (Phase 13)

</code_context>

<specifics>
## Specific Ideas

- The reference file `elementor-20405-2026-04-20.json` should be studied for exact field names and nesting patterns
- `isInner: false` for all top-level containers, `isInner: false` for html widgets inside them (flat structure)
- Container `settings.flex_direction: "column"` as default layout direction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-core-json-builder*
*Context gathered: 2026-04-20*
