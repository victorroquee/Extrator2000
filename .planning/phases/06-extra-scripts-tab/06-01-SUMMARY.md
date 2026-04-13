---
phase: 06-extra-scripts-tab
plan: "01"
subsystem: server
tags: [export, scripts, injection, head, idempotency]
dependency_graph:
  requires: [EXPORT-06 (Phase 4 idempotency guard)]
  provides: [extraScripts injection in buildExportHtml]
  affects: [/api/export, /api/export-zip]
tech_stack:
  added: []
  patterns: [named-parameter destructuring with default, Array.isArray guard, case-insensitive regex auto-wrap]
key_files:
  modified:
    - server.js
decisions:
  - Auto-wrap bare JS content (not starting with <script, case-insensitive) into <script> tags at injection time (D-14)
  - Idempotency covered by existing data-vsl-injected sentinel from EXPORT-06 — no additional guard needed (D-15)
  - extraScripts defaults to [] in buildExportHtml signature so absent/null/undefined from body causes no error
metrics:
  duration: "~5 minutes"
  completed: "2026-04-13"
  tasks_completed: 1
  files_modified: 1
---

# Phase 6 Plan 1: Extra Scripts Backend Injection Summary

**One-liner:** extraScripts array injected into `<head>` after headerPreload with case-insensitive auto-wrap, forwarded by both export routes, idempotency preserved by existing data-vsl-injected sentinel.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add extraScripts injection to buildExportHtml and both export routes | ff59e54 | server.js |

## What Was Built

Extended `buildExportHtml` in server.js to accept and inject an `extraScripts: string[]` parameter into `<head>` immediately after `headerPixel` and `headerPreload`. Each element is injected in order. If an element does not start with `<script` (case-insensitive), it is automatically wrapped in `<script>...</script>` tags before injection.

Both POST routes (`/api/export` and `/api/export-zip`) now destructure `extraScripts` from `req.body` and forward it to `buildExportHtml`.

The existing `data-vsl-injected` sentinel from Phase 4 (EXPORT-06) causes `buildExportHtml` to return early when HTML has already been exported, preventing any duplicate injection of extra scripts.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired end-to-end on the server side.

## Threat Flags

No new security surface introduced beyond what is documented in the plan's threat model (T-06-01, T-06-02, T-06-03 — all accepted for single-user local tool).

## Self-Check: PASSED

- server.js modified: confirmed
- Commit ff59e54 exists: confirmed
- `grep -c "extraScripts" server.js` returns 7 (>= 6 required): confirmed
- All 6 inline verification assertions pass with "ALL TESTS PASSED": confirmed
