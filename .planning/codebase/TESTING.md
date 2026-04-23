# Testing Patterns

**Analysis Date:** 2026-04-22

## Test Framework

**Runner:**
- No test framework (no Jest, Vitest, or Mocha). Tests are plain Node.js scripts with custom assertion helpers.
- Tests run directly via `node test-*.js` and exit with code 0 (pass) or 1 (fail).

**Assertion Library:**
- Custom `assert()` functions defined inline in each test file
- No assertion library (no `chai`, no `assert` module)

**Dev Dependencies:**
- `jsdom` ^29.0.2 -- used only in `test-delay-ui.js` for DOM simulation

**Run Commands:**
```bash
node test-integration.js       # Core cleanup + detection pipeline (24 assertions)
node test-elementor-json.js    # Elementor JSON builder (9 tests, ~25 assertions)
node test-delay-ui.js          # UI behavior tests via jsdom (5 behavioral tests)
```

No `npm test` script defined in `package.json`. No watch mode. No coverage tool.

## Test File Organization

**Location:**
- Test files live at project root alongside `server.js`
- Co-located, not in a `test/` directory

**Naming:**
- `test-{feature}.js` pattern
- `test-fixture.html` for HTML fixture data

**Current test files:**
```
/
├── test-integration.js      # Pipeline tests: cleanHtml + detectCheckoutLinks + detectVturbDelay + buildExportHtml
├── test-elementor-json.js   # Unit tests for buildElementorJson
├── test-delay-ui.js         # jsdom-based UI behavioral tests for delay feature
└── test-fixture.html        # HTML fixture simulating a real VSL page with all patterns
```

## Test Structure

**Suite Organization (test-integration.js pattern):**
```javascript
'use strict';

const { cleanHtml, detectCheckoutLinks, detectVturbDelay, buildExportHtml } = require('./server');

const failures = [];

function assert(condition, description, expected, actual) {
  if (!condition) {
    failures.push({ description, expected, actual });
  }
}

function assertContains(str, substring, description) { ... }
function assertNotContains(str, substring, description) { ... }

// Load fixture
const fixtureHtml = fs.readFileSync('./test-fixture.html', 'utf8');

// Run pipeline
const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(fixtureHtml);
const $ = cheerio.load(cleanedHtml);
const links = detectCheckoutLinks($, cleanedHtml);

// Assertions (flat, no describe/it blocks)
assert(vslDetected === true, 'vslDetected === true', true, vslDetected);
assertNotContains(cleanedHtml, 'fbq(', 'Meta Pixel removed');
// ...

// Results
if (failures.length > 0) {
  console.error(`FAILED ${failures.length}/${total}`);
  process.exit(1);
} else {
  console.log(`PASSED ${passed}/${total}`);
}
```

**Suite Organization (test-elementor-json.js pattern):**
```javascript
'use strict';

const { buildElementorJson } = require('./server.js');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) { passed++; console.log(`  PASS: ${testName}`); }
  else { failed++; console.error(`  FAIL: ${testName}`); }
}

// Test N: Description
console.log('\nTest N: Description');
{
  const html = `<!DOCTYPE html>...`;
  const result = buildElementorJson(html);
  assert(result.version === '0.4', 'version is "0.4"');
  assert(Array.isArray(result.content), 'content is array');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

**Patterns:**
- Each test file defines its own assertion helpers (no shared test utility module)
- Block scoping `{ ... }` used to isolate test variables (test-elementor-json.js)
- Test IDs map to spec codes: `CLEAN-01`, `ELEM-01`, `DELAY-01`, etc.
- No setup/teardown hooks -- each test constructs its own fixture inline

## Mocking

**Framework:** Manual mocking only (no sinon, no jest.mock)

**Patterns (test-delay-ui.js):**
```javascript
// Mock fetch in jsdom window
window.fetch = async function(_url, _opts) {
  return {
    ok: true,
    json: async () => ({
      html: '<html>...</html>',
      summary: summaryOverrides,
    }),
  };
};
```

**What IS Mocked:**
- `window.fetch` in jsdom tests (returns controlled API responses)
- No server started -- tests import functions directly from `server.js`

**What is NOT Mocked (and should be for unit tests):**
- `axios.get` -- functions like `fetchImageDimensions`, `inlineExternalCss`, `detectPageColors` make real HTTP calls
- `crypto.randomBytes` / `crypto.randomUUID` -- makes IDs non-deterministic
- File system reads -- `test-integration.js` reads `test-fixture.html` from disk

## Fixtures and Factories

**Test Data:**
```javascript
// Inline HTML fixtures (test-elementor-json.js)
const html = `<!DOCTYPE html><html>
  <head><script>pixel</script><style>.x{}</style></head>
  <body><div>Section 1</div></body>
</html>`;

// File-based fixture (test-integration.js)
const fixtureHtml = fs.readFileSync('./test-fixture.html', 'utf8');
```

**Location:**
- `test-fixture.html` -- comprehensive fixture with all VSL patterns (trackers, iframes, checkout links, bundles)
- Inline HTML strings for focused unit tests

**Fixture coverage:**
- `test-fixture.html` covers: Meta Pixel, VTURB embed, ClickBank links, Hotmart links, bundle detection (2/3/6 potes), preload links, survivor elements (jQuery, Bootstrap, Google Fonts)
- Missing fixtures: Elementor import roundtrip, CSS inlining, relative URL resolution, color detection, product name detection, image replacement

## Coverage

**Requirements:** None enforced. No coverage tool configured.

**Current coverage estimate by function:**

| Function | Tested | Test File | Notes |
|----------|--------|-----------|-------|
| `cleanHtml` | Yes | `test-integration.js` | Good coverage of removal patterns |
| `detectCheckoutLinks` | Yes | `test-integration.js` | ClickBank + Hotmart + bundle detection |
| `detectVturbDelay` | Yes | `test-integration.js` | Pattern 2 (same-script) tested; patterns 1,3,4 untested |
| `buildExportHtml` | Partial | `test-integration.js` | Delay injection + idempotency tested; checkout/color/image replacement untested |
| `buildElementorJson` | Yes | `test-elementor-json.js` | Structure, IDs, settings shape, empty body, title extraction |
| `inlineExternalCss` | No | -- | Makes HTTP calls; needs axios mock |
| `rewriteRelativeUrls` | No | -- | Pure function; easy to test |
| `detectPageColors` | No | -- | Makes HTTP calls for external CSS |
| `detectProductName` | No | -- | Pure function; easy to test |
| `detectBundleImages` | No | -- | Async; needs axios mock for image fetching |
| `detectAllProductImages` | No | -- | Pure function; easy to test |
| `parseImageDimensions` | No | -- | Pure function with binary buffers; high-value test target |
| `applyCheckoutLinks` | No | -- | Critical for affiliate links; selector + bulk modes |
| `classifyPlatform` | No | -- | Trivial but used in output |
| `detectBundle` | No | -- | Keyword matching; easy to test |
| `buildCssSelector` | No | -- | Generates selectors; subtle edge cases |
| `resolveUrl` | No | -- | Thin wrapper around `new URL` |
| `assetLocalPath` | No | -- | Path generation with collision avoidance |
| `collectAssets` | No | -- | DOM traversal for asset URLs |
| Route handlers | No | -- | No HTTP-level integration tests |

## Test Types

**Unit Tests:**
- `test-elementor-json.js` -- tests `buildElementorJson` in isolation with inline HTML fixtures
- Tests import functions directly: `const { buildElementorJson } = require('./server.js')`
- Pure input-output testing; no side effects

**Integration Tests:**
- `test-integration.js` -- runs the full pipeline: `cleanHtml` -> `detectCheckoutLinks` -> `detectVturbDelay` -> `buildExportHtml`
- Uses a fixture file that simulates a real VSL page
- Tests the pipeline end-to-end but does not start the HTTP server

**UI/Behavioral Tests:**
- `test-delay-ui.js` -- uses jsdom to load `public/index.html`, mocks `fetch`, simulates clicks
- Tests that UI state updates correctly based on API responses
- 5 scenarios covering delay section visibility, state storage, export payload

**E2E Tests:**
- Not used. No Playwright, Cypress, or Puppeteer.
- No tests that start the Express server and make HTTP requests.

## Common Patterns

**Asserting HTML contains/excludes content:**
```javascript
function assertContains(str, substring, description) {
  assert(!str.toLowerCase().includes(substring.toLowerCase()), description,
    `string NOT to contain "${substring}"`,
    str.toLowerCase().includes(substring.toLowerCase()) ? 'FOUND' : 'absent');
}

assertNotContains(cleanedHtml, 'fbq(', 'Meta Pixel removed');
assertContains(cleanedHtml, '<!-- [VSL_PLACEHOLDER] -->', 'Placeholder injected');
```

**Testing Elementor JSON structure:**
```javascript
// Walk the JSON tree to collect all IDs
function collectIds(obj) {
  const ids = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === 'string') ids.push(node.id);
    Object.values(node).forEach(walk);
  }
  walk(obj);
  return ids;
}

const ids = collectIds(result);
assert(ids.every(id => /^[0-9a-f]{8}$/.test(id)), 'all IDs are 8-char hex');
assert(ids.length === new Set(ids).size, 'no duplicate IDs');
```

**Testing idempotency:**
```javascript
const firstExport = buildExportHtml({ html: pixelHtml, headerPixel: '<script>pixel</script>', ... });
const secondExport = buildExportHtml({ html: firstExport, headerPixel: '<script>pixel</script>', ... });
const count1 = (firstExport.match(/pixel/g) || []).length;
const count2 = (secondExport.match(/pixel/g) || []).length;
assert(count1 === 1, 'first export has 1 injection');
assert(count2 === 1, 'second export does not duplicate');
```

## Critical Gaps for Launch Readiness

**Priority 1 -- High-risk untested functions:**

1. **`applyCheckoutLinks`** (`server.js:1027-1083`): Handles affiliate link injection via CSS selectors AND bulk replacement. If a selector fails silently, affiliates lose revenue. Test selector-based, no-selector, and invalid-selector cases.

2. **`inlineExternalCss`** (`server.js:1302-1365`): Fetches external CSS and inlines it. If CSS url() rewriting fails, images/fonts break in Elementor exports. Test with relative url() paths, absolute URLs, data: URIs, and fetch failures.

3. **`rewriteRelativeUrls`** (`server.js:1377-1406`): Converts relative asset paths to absolute. If this breaks, all images in Elementor exports show as broken. Pure function -- easy to test with various relative path patterns.

4. **`parseImageDimensions`** (`server.js:290-338`): Binary buffer parsing for PNG, JPEG, WebP, GIF dimensions. Off-by-one errors here cause wrong dimensions in bundle image detection. Test with real image headers for each format.

**Priority 2 -- Partial coverage gaps:**

5. **`detectVturbDelay`** patterns 1, 3, 4 (`server.js:683-746`): Only pattern 2 (same-script `var delaySeconds`) is tested. Patterns for `data-vdelay` attribute, split scripts, and inline numbers are untested.

6. **`buildExportHtml` color/image replacement** (`server.js:1249-1293`): Color replacement uses regex on full HTML string -- could corrupt data: URIs or hex values in URLs. Image replacement with `originalSrc`/`newSrc` matching is untested.

7. **`buildElementorJson` CSS selector rewriting** (`server.js:1477-1488`): The regex `/(^|[,{}\s])(?:body|html|:root)(\s*[,{>+~\s])/gm` rewrites CSS selectors. Edge cases: `body.class`, `html > body`, `:root` inside `@media` blocks.

**Priority 3 -- Missing test infrastructure:**

8. **No HTTP-level tests**: Route handlers (`/api/fetch`, `/api/export-zip`, `/api/export-elementor`) are untested. SSRF protection (`server.js:757-785`) should be tested.

9. **No `npm test` script**: Add `"test": "node test-integration.js && node test-elementor-json.js && node test-delay-ui.js"` to `package.json`.

## How to Add New Tests

Follow the existing pattern -- create a `test-{feature}.js` file at the project root:

```javascript
'use strict';

const { functionUnderTest } = require('./server');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) { passed++; console.log(`  PASS: ${testName}`); }
  else { failed++; console.error(`  FAIL: ${testName}`); }
}

console.log('\nTest 1: Description');
{
  const result = functionUnderTest(input);
  assert(result === expected, 'assertion description');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

For functions that call `axios.get` (like `inlineExternalCss`), you will need to either:
- Extract the HTTP-calling logic into a parameter (dependency injection)
- Or use a library like `nock` to intercept HTTP requests
- The project currently has no HTTP mocking library installed

---

*Testing analysis: 2026-04-22*
