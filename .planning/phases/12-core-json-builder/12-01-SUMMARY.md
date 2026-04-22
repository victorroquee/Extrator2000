---
phase: 12-core-json-builder
plan: "01"
subsystem: json-builder
tags:
  - elementor
  - json-export
  - server.js
  - backend
dependency_graph:
  requires: []
  provides:
    - buildElementorJson function in server.js
    - module.exports.buildElementorJson named export
  affects:
    - Phase 13 (will wire buildElementorJson to /api/export-elementor route)
tech_stack:
  added: []
  patterns:
    - cheerio.load with decodeEntities:false for HTML parsing
    - crypto.randomBytes(4).toString('hex') for unique 8-char hex IDs
    - Set-based collision guard for ID uniqueness
key_files:
  created:
    - path: test-elementor-json.js
      purpose: Standalone validation script — 8 test scenarios, 25 assertions, exit 0 on pass
  modified:
    - path: server.js
      purpose: Added buildElementorJson function (~114 lines) + module.exports.buildElementorJson
decisions:
  - "Use html widget for all content (no DOM-to-widget decomposition) — matches Anti-Pattern 2 avoidance from ARCHITECTURE.md"
  - "D-02 single-wrapper unwrap: only unwrap div/main/article, not semantic section elements"
  - "Head container: filter out <title> and <meta charset>; keep all other head tags"
  - "Skip loose <script>/<style> at body level (not inside sectioning elements)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-20T13:03:10Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
  tests_added: 25
  tests_passing: 25
requirements_satisfied:
  - ELEM-01
  - ELEM-02
  - ELEM-03
  - ELEM-04
  - ELEM-05
---

# Phase 12 Plan 01: Core JSON Builder Summary

**One-liner:** `buildElementorJson()` converts affiliate HTML into importable Elementor JSON v0.4 — head scripts in first container, body sections as per-section html-widget containers, unique 8-char hex IDs with collision guard.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Implement buildElementorJson function in server.js | 92a16b1 | server.js |
| 2 | Create validation script for buildElementorJson | 698e15d | test-elementor-json.js |

## What Was Built

### buildElementorJson(html) — server.js

The core conversion engine for the Elementor JSON export feature. Takes a fully-baked affiliate HTML string (output of `buildExportHtml()`) and returns a valid Elementor JSON object.

**Function structure:**
1. Parse HTML with `cheerio.load(html, { decodeEntities: false })`
2. Extract `<title>` for the root `title` field (D-09)
3. Local `genId()` helper using `crypto.randomBytes(4).toString('hex')` with `Set` collision guard (D-05, Pitfall 1)
4. Extract head content (excluding `<title>` and `<meta charset>`) → first container (D-03, D-04)
5. Get body direct children; if single wrapper div/main/article, unwrap one level (D-01, D-02)
6. Each body section element (non-script, non-style, non-text-node) → separate container (D-07)
7. Each container holds one `html` widget with `$.html(el)` markup (D-08)
8. Root envelope: `{ version: '0.4', title, type: 'page', page_settings: {}, content }` (D-06, Pitfalls 15, 16)

**Pitfalls explicitly avoided:**
- Pitfall 1: ID collision via Set + do-while regeneration
- Pitfall 2: `isInner: false` for all containers and widgets
- Pitfall 8: `settings` always `{}` object, never `[]` array
- Pitfall 13: `flex_direction: 'column'` always explicit on containers
- Pitfall 15: `type: 'page'` hardcoded
- Pitfall 16: `page_settings: {}` not null

### test-elementor-json.js

Standalone Node.js validation script (no test framework — matches project constraint). 8 test scenarios, 25 total assertions.

| Test | Coverage |
|------|---------|
| 1: Basic structure | version, type, page_settings, content.length (ELEM-01) |
| 2: Unique IDs | all 26 IDs unique, 8-char hex format (ELEM-02) |
| 3: Per-section containers | elType, isInner, count (ELEM-03) |
| 4: HTML widget wrapping | widgetType, settings.html, single element (ELEM-04) |
| 5: Affiliate customizations | pixel, VTURB, checkout survive; roundtrip (ELEM-05, Pitfall 6) |
| 6: Wrapper child fallback | D-02 unwrap logic, no monolithic block |
| 7: Settings type | every settings object is `{}` not `[]` (Pitfall 8) |
| 8: Empty body | graceful handling, no throw, content is array |

**Result:** 25/25 passing (`node test-elementor-json.js` exits 0)

## Verification

All three verification commands from the plan pass:

1. `node -e "... console.log(typeof s.buildElementorJson)"` → `function`
2. `node test-elementor-json.js` → `Results: 25 passed, 0 failed`
3. JSON output shows valid `{ version: "0.4", type: "page", page_settings: {}, content: [...] }`

## Deviations from Plan

None — plan executed exactly as written.

The D-02 single-wrapper check is scoped to `div`/`main`/`article` tag names only (not `section`) — this is a reasonable implementation detail not specified in the plan and was applied using Claude's discretion as noted in CONTEXT.md.

## Threat Model Coverage

All three threats from the plan's `<threat_model>` were accepted:
- T-12-01 (Injection): `html` widget stores raw HTML by design — no additional sanitization needed
- T-12-02 (Information Disclosure): title from page's own `<title>` tag — no server info exposed
- T-12-03 (DoS): Express 10mb body limit already in place at line 16 of server.js

No new threat surface introduced.

## Self-Check: PASSED

- `/Users/victorroque/Downloads/Extrator2000/server.js` — contains `function buildElementorJson` and `module.exports.buildElementorJson`
- `/Users/victorroque/Downloads/Extrator2000/test-elementor-json.js` — exists, exits 0
- Commits `92a16b1` and `698e15d` exist in git log
