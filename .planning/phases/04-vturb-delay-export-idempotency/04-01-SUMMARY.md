---
phase: 04-vturb-delay-export-idempotency
plan: "01"
subsystem: server
tags: [delay-detection, idempotency, export, vturb, testing]
dependency_graph:
  requires: []
  provides: [detectVturbDelay, buildExportHtml-idempotency, delay-injection]
  affects: [/api/fetch, /api/export, /api/export-zip]
tech_stack:
  added: []
  patterns: [dual-condition-regex, string-replace-not-cheerio, idempotency-sentinel]
key_files:
  created: []
  modified:
    - server.js
    - test-integration.js
decisions:
  - detectVturbDelay called before cleanHtml in /api/fetch — order critical (PITFALLS.md Pitfall 1)
  - delay script rebuilt via String.replace on captured content — NOT cheerio re-parse (avoids serialization mangling)
  - data-vsl-injected sentinel on <head> guards idempotency at zero cost
  - safeDelay clamped to Math.max(1, Math.round(Number(delaySeconds) || 1)) for T-04-01 mitigation
  - buildExportHtml exported as named export to enable direct unit testing
metrics:
  duration_minutes: 15
  completed_date: "2026-04-11"
  tasks_completed: 2
  files_modified: 2
---

# Phase 04 Plan 01: VTURB Delay Detection + Export Idempotency Summary

**One-liner:** VTURB delay block extracted from raw HTML before cleanup, rebuilt via targeted String.replace on export, with data-vsl-injected sentinel guarding idempotency.

## What Was Built

Two tightly-coupled server-side changes delivering the stable API contract for Plan 02 (frontend):

1. **`detectVturbDelay(rawHtml)`** — new helper that scans `<script>` tags using a dual-condition regex (requires both `(?:var|let|const)\s+delaySeconds\s*=\s*(\d+)` AND `displayHiddenElements` in the same block). Returns `{ delaySeconds, delayScriptContent }` or `null`. Called in `/api/fetch` BEFORE `cleanHtml()` so the block is captured before VTURB keywords trigger removal.

2. **Updated `buildExportHtml()`** — extended signature with `delaySeconds` and `delayScriptContent`. Adds `data-vsl-injected="1"` to `<head>` on first call; returns `html` unchanged if the attribute is already present (EXPORT-06). Injects rebuilt delay script near `</body>` using `String.replace` with `safeDelay` clamp (`Math.max(1, Math.round(...))`); falls back to appending at end of string for malformed HTML lacking `</body>`.

3. **Both export routes updated** — `/api/export` and `/api/export-zip` both destructure `delaySeconds` and `delayScriptContent` from `req.body` and pass them through to `buildExportHtml`.

4. **9 new test assertions** in `test-integration.js` covering DELAY-01, DELAY-03, EXPORT-06. Total: 24/24 passing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add detectVturbDelay helper and extend /api/fetch response | 1c5412a | server.js |
| 2 | Update buildExportHtml, both export routes, and add tests | aca17a2 | server.js, test-integration.js |

## Verification

```
node test-integration.js
PASSED 24/24 assertions — all VSL patterns handled correctly
```

Zero regressions. All 15 original assertions pass alongside 9 new Phase 4 assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DELAY-03 test fixture used raw HTML instead of cleaned HTML**
- **Found during:** Task 2 verification (first test run failed DELAY-03)
- **Issue:** The plan's test code used `delayFixtureHtml` (which still contained `var delaySeconds = 10` in the original script) as input to `buildExportHtml`, then asserted the old value was absent. In real usage, `cleanHtml()` removes the VTURB script before the HTML reaches `buildExportHtml`. The synthetic fixture didn't contain VTURB keywords so `cleanHtml()` left it intact — making the assertion impossible to satisfy.
- **Fix:** Changed DELAY-03 test to use `cleanBaseHtml` (`<html><head></head><body><p>page content</p></body></html>`) as the `html` input to `buildExportHtml`, matching the real flow where the delay block is already removed before export.
- **Files modified:** test-integration.js
- **Commit:** aca17a2

**2. [Rule 2 - Missing export] buildExportHtml not exported for testing**
- **Found during:** Task 2 — the plan's test code used `require('./server').buildExportHtml` but the function was not a named export
- **Fix:** Added `module.exports.buildExportHtml = buildExportHtml` to server.js named exports block
- **Files modified:** server.js
- **Commit:** aca17a2

## Known Stubs

None — all data paths are fully wired. `detectVturbDelay` returns real extracted values; `buildExportHtml` injects real rebuilt content.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The `delaySeconds` input clamping (T-04-01) is applied via `Math.max(1, Math.round(Number(delaySeconds) || 1))` as specified in the threat model. No new threat flags.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| server.js | FOUND |
| test-integration.js | FOUND |
| 04-01-SUMMARY.md | FOUND |
| commit 1c5412a (Task 1) | FOUND |
| commit aca17a2 (Task 2) | FOUND |
