---
phase: 1
plan: 2
subsystem: backend-api
tags: [export, ssrf, static-files, cheerio, phase-1-complete]
dependency_graph:
  requires: [01-01]
  provides: [POST /api/export, SSRF validation, static file serving]
  affects: [server.js, public/]
tech_stack:
  added: []
  patterns:
    - "Cheerio re-parse on serialized HTML for comment-based placeholder replacement"
    - "Dual-instance cheerio ($ for head injection, $2 for post-embed checkout replacement)"
    - "SSRF URL validation via URL constructor before axios.get"
key_files:
  modified: [server.js]
  created: [public/.gitkeep]
decisions:
  - "affiliateHref field name matches plan schema; legacy affiliateUrl also accepted for forward compatibility"
  - "VSL_PLACEHOLDER regex covers both vsl-placeholder and vsl-cloner-placeholder div IDs"
  - "Checkout link replacement re-parses HTML after vslembed injection to operate on final DOM"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-10T21:17:03Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 1 Plan 2: POST /api/export route + static file serving + integration verification Summary

**One-liner:** POST /api/export with cheerio-based pixel injection, VSL placeholder replacement, checkout href swapping, and SSRF-hardened /api/fetch returning downloadable pagina-afiliado.html.

## What Was Built

### Task 1: POST /api/export route and public/ directory

Added the complete `/api/export` route to `server.js` and created `public/.gitkeep`:

**Route behavior:**
1. Validates `html` body field is present and a string
2. Loads HTML with `cheerio.load(html, { decodeEntities: false })`
3. Appends `headerPixel` and `headerPreload` to `<head>` via cheerio (EXPORT-02)
4. Serializes to string via `$.html()` then applies regex replacement of the `<!-- [VSL_PLACEHOLDER] -->` block with `vslembed` content (EXPORT-03)
5. Re-parses the post-embed HTML with a second cheerio instance and applies `affiliateHref` to each `selector` (EXPORT-04)
6. Returns with `Content-Disposition: attachment; filename="pagina-afiliado.html"` (EXPORT-05)

**SSRF mitigations added to /api/fetch (T-01-03, T-01-04):**
- Scheme validation: only `http:` and `https:` allowed
- Hostname blocklist: `localhost`, `127.0.0.1`, `192.168.*`, `10.*`, `172.*`, `*.local`
- `maxContentLength: 10 * 1024 * 1024` added to `axios.get` options

### Task 2: End-to-end integration verification

All Phase 1 verification criteria confirmed passing via curl:

| # | Test | Result |
|---|------|--------|
| 1 | Server starts with correct message | PASS |
| 2 | /api/fetch returns `{html, summary}` for https://example.com | PASS |
| 3 | /api/export returns `Content-Disposition: attachment; filename="pagina-afiliado.html"` | PASS |
| 4 | file:///etc/passwd rejected with JSON error | PASS |
| 5 | http://localhost/anything rejected with JSON error | PASS |
| 6 | Static middleware mounted (GET / responds) | PASS |

Additional tests confirmed:
- `headerPixel` content appears inside `<head>` of export output
- VSL placeholder block (`<!-- [VSL_PLACEHOLDER] --> <div id="vsl-cloner-placeholder"...>`) is replaced by `vslembed`
- Checkout link `href` is replaced by `affiliateHref` value via CSS selector

## Curl Commands Demonstrating Phase 1 Works

```bash
# Start the server
node server.js

# Fetch and clean a VSL page
curl -s -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log('html length:', d.html.length);
    console.log('summary:', JSON.stringify(d.summary));
  "

# Export with affiliate customizations (verify Content-Disposition header)
curl -sI -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{"html":"<html><head></head><body></body></html>","headerPixel":"","headerPreload":"","vslembed":"","checkoutLinks":[]}'

# Verify SSRF protection — file:// blocked
curl -s -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"file:///etc/passwd"}'
# Expected: {"error":"Only http and https URLs are allowed"}

# Verify SSRF protection — localhost blocked
curl -s -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost/anything"}'
# Expected: {"error":"Private/loopback URLs are not allowed"}

# Full export pipeline test
curl -s -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><head></head><body><!-- [VSL_PLACEHOLDER] -->\n<div id=\"vsl-cloner-placeholder\" style=\"\">Player VSL</div><a href=\"https://hop.clickbank.net/?affiliate=OLD\">Buy</a></body></html>",
    "headerPixel": "<!-- Meta Pixel -->",
    "headerPreload": "",
    "vslembed": "<div id=\"player\">VTURB EMBED</div>",
    "checkoutLinks": [{"selector":"a","affiliateHref":"https://hop.clickbank.net/?affiliate=MYID"}]
  }' -D -
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Field Support] Added affiliateHref + legacy affiliateUrl support**
- **Found during:** Task 1 — existing server.js used `affiliateUrl` but plan schema uses `affiliateHref`
- **Fix:** Route reads `link.affiliateHref || link.affiliateUrl` for backward compatibility
- **Files modified:** server.js
- **Commit:** 6134a6c

**2. [Rule 1 - Bug] Fixed VSL placeholder regex to cover both div ID variants**
- **Found during:** Task 1 — existing code used `vsl-placeholder` but plan specifies `vsl-cloner-placeholder`
- **Fix:** Regex pattern `vsl(?:-cloner)?-placeholder` matches both IDs
- **Files modified:** server.js
- **Commit:** 6134a6c

**3. [Rule 1 - Bug] Fixed EXPORT-04 to re-parse post-embed HTML**
- **Found during:** Task 1 — existing code applied checkout replacements on the pre-embed `$` instance, losing post-embed DOM state
- **Fix:** Re-parse `outputHtml` with a second cheerio instance `$2` after vslembed replacement
- **Files modified:** server.js
- **Commit:** 6134a6c

**4. [Rule 1 - Bug] Fixed startup message for verification criteria**
- **Found during:** Task 1 — message was "rodando em" but plan verification checks for "running at"
- **Fix:** Changed to `VSL Cloner running at http://localhost:${PORT}`
- **Files modified:** server.js
- **Commit:** 6134a6c

## Phase 1 ROADMAP Success Criteria — All Met

- [x] POST /api/export implemented and tested end-to-end
- [x] headerPixel and headerPreload injected before `</head>` in output HTML
- [x] VSL_PLACEHOLDER block replaced by vslembed content
- [x] Checkout link hrefs replaced by affiliateHref values
- [x] Output returned as "pagina-afiliado.html" download
- [x] SSRF mitigations active on /api/fetch (scheme + private IP + 10MB limit)
- [x] public/ directory exists and served as static files

## Known Stubs

None — all features are fully implemented and verified.

## Self-Check: PASSED

- server.js: FOUND at correct path
- public/.gitkeep: FOUND
- Commit 6134a6c: FOUND in git log
- All Phase 1 verification criteria: PASS (confirmed by curl tests above)
