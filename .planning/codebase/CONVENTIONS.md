# Coding Conventions

**Analysis Date:** 2026-04-22

## Naming Patterns

**Files:**
- `kebab-case` for all files: `server.js`, `test-integration.js`, `test-elementor-json.js`, `test-delay-ui.js`
- Test files prefixed with `test-`: `test-integration.js`, `test-elementor-json.js`, `test-delay-ui.js`
- Single `server.js` monolith for all backend logic
- Single `public/index.html` for all frontend code (HTML + CSS + JS in one file)

**Functions:**
- `camelCase` for all functions: `cleanHtml`, `detectCheckoutLinks`, `buildExportHtml`, `buildElementorJson`
- Verb-noun pattern: `detectVturbDelay`, `collectAssets`, `applyCheckoutLinks`, `resolveUrl`
- Helper prefix style: `build*` for constructors, `detect*` for analyzers, `collect*` for gatherers

**Variables:**
- `camelCase` for local variables: `rawHtml`, `cleanedHtml`, `pageUrl`, `delayInfo`
- `UPPER_SNAKE_CASE` for module-level constants: `SCRIPT_REMOVE_KEYWORDS`, `IFRAME_REMOVE_PATTERNS`, `CHECKOUT_URL_PATTERNS`, `SESSION_TTL_MS`

**Types:**
- No TypeScript; no JSDoc type annotations on most functions
- Some functions have JSDoc `@param` / `@returns` comments (inconsistent coverage)

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome configured -- no auto-formatting enforced
- 2-space indentation throughout `server.js`
- Single quotes for strings in `server.js`
- Semicolons used consistently
- Trailing commas used in multi-line arrays and objects
- Line length: no enforced limit; some lines exceed 120 characters (especially regex patterns)

**Linting:**
- No linter configured. Zero automated style enforcement.
- `'use strict';` declared at top of every JS file

## Import Organization

**Order (server.js):**
1. Node.js built-in modules: `path`, `crypto`
2. Third-party packages: `express`, `axios`, `cheerio`, `archiver`, `multer`
3. No local module imports (everything is in one file)

**Path Aliases:**
- None. No module aliasing. Single-file architecture eliminates the need.

## Error Handling

**Patterns:**
- Route handlers: try/catch around `axios.get()` calls, return structured JSON errors with `res.status(N).json({ error: '...' })`
- Silent catch in helpers: many utility functions use `try { ... } catch { return null; }` with empty catch blocks (no error logging)
- Example from `fetchImageDimensions` at `server.js:343-355`:
  ```javascript
  async function fetchImageDimensions(url) {
    try {
      const resp = await axios.get(url, { ... });
      return parseImageDimensions(Buffer.from(resp.data));
    } catch {
      return null;
    }
  }
  ```
- Cheerio selector errors caught with `try { el = $(link.selector); } catch (_) { continue; }` -- silent skip
- URL parsing errors caught with `try { new URL(url); } catch { continue; }` -- silent skip
- Express error middleware only for multer errors (`server.js:955-963`); no global error handler for unhandled exceptions

**Error messages:** Mixed Portuguese and English. Route error messages in Portuguese for user-facing APIs. Console warnings in English.

## Logging

**Framework:** `console` only (no structured logging library)

**Patterns:**
- `console.log` for startup message only: `VSL Cloner running at http://localhost:${PORT}`
- `console.warn` for non-fatal issues: `[export] invalid selector skipped: ${link.selector}`
- `console.error` for archive errors: `[export-zip] archive error:`
- No request logging middleware
- No log levels, no log rotation, no structured JSON output

## Comments

**When to Comment:**
- Section headers use ASCII art dividers: `// -- Section Name --------`
- Inline code IDs reference a spec/ticket system: `CLEAN-01`, `CLEAN-05`, `DELAY-01`, `EXPORT-06`, `T-01-03`, `D-14`
- These IDs appear in both code and test files for traceability

**JSDoc:**
- Present on ~40% of functions, usually with `@param` and `@returns`
- Missing on route handlers and simpler utility functions
- Example quality varies: `parseImageDimensions` has good docs; `cleanHtml` has none

## Function Design

**Size:**
- `server.js` is 1925 lines -- monolithic single-file backend
- `cleanHtml`: ~120 lines (lines 132-249)
- `buildExportHtml`: ~200 lines (lines 1095-1293)
- `buildElementorJson`: ~115 lines (lines 1420-1532)
- `detectPageColors`: ~120 lines (lines 502-621)
- Functions are generally well-scoped but long due to inline helper closures

**Parameters:**
- Helper functions take `($, ...)` where `$` is a cheerio instance -- passed explicitly, never global
- `buildExportHtml` uses destructured object parameter with 15+ fields
- Route handlers destructure `req.body` inline at the top of each handler

**Return Values:**
- Detection functions return `null` for "not found" (not `undefined`, not empty object)
- Pipeline functions return objects: `{ html, scriptsRemoved, vslDetected }`
- Builder functions return the constructed object directly

## Module Design

**Exports:**
- `module.exports = app` (Express app as default export)
- Named exports appended individually for test access:
  ```javascript
  module.exports.cleanHtml = cleanHtml;
  module.exports.detectCheckoutLinks = detectCheckoutLinks;
  module.exports.buildElementorJson = buildElementorJson;
  // ... 10 more named exports
  ```
- All exported functions are defined at module scope in `server.js`

**Barrel Files:**
- None. Single-file architecture.

## Frontend Conventions (public/index.html)

**JavaScript style:**
- Vanilla JS, no framework, no build step
- `var` used throughout (not `const`/`let`) -- intentional ES5 compatibility in frontend
- All frontend logic wrapped in a single `DOMContentLoaded` listener
- DOM elements accessed via `document.getElementById()` -- no query abstraction
- State managed via a plain object: `var state = { fetchedHtml: null, ... }`

**CSS style:**
- All CSS inline in `<style>` block within `index.html`
- BEM-like class naming: `.card-title`, `.pvw-link-row`, `.section-hidden`
- Custom scrollbar styling
- No CSS preprocessor, no utility classes

**HTML structure:**
- Semantic sectioning with `<section>`, `<div class="card">` wrappers
- Portuguese labels and placeholder text throughout the UI

## Code Organization Pattern

All backend logic follows this structure in `server.js`:
1. Imports and constants (lines 1-82)
2. Pure helper functions -- no side effects (lines 84-746)
3. Express routes (lines 748-1848)
4. Server startup with `require.main` guard (lines 1904-1908)
5. Module exports for testing (lines 1910-1925)

Use this same ordering when adding new functions: place helpers before routes, exports at the end.

## Anti-Patterns to Avoid

- Do NOT add new files for backend logic -- the constraint is single `server.js`
- Do NOT use `let`/`const` in `public/index.html` JS -- the frontend uses `var` for compatibility
- Do NOT add external CSS/JS dependencies to the frontend -- it must remain a single HTML file
- Do NOT use `async/await` in frontend code -- the existing code uses `.then()` chains and callbacks

---

*Convention analysis: 2026-04-22*
