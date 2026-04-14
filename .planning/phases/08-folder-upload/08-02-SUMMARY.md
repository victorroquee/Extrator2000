---
phase: 08-folder-upload
plan: "02"
status: complete
subsystem: frontend
tags: [upload, tabs, folder-input, webkitdirectory, FormData]
dependency_graph:
  requires: [08-01]
  provides: [folder-upload-ui, tab-toggle, upload-handler, uploadSessionId-export]
  affects: [public/index.html]
tech_stack:
  added: []
  patterns: [tab-toggle, FormData multipart upload, state-driven section reveal]
key_files:
  created: []
  modified:
    - public/index.html
decisions:
  - "setFetchLoading extended to cover btnUpload — single loading gate for both flows avoids duplicate loading logic"
  - "Upload handler mirrors URL fetch reveal sequence exactly (showSection calls in same order) for identical post-upload UX"
  - "No Content-Type header set on FormData fetch — browser adds multipart/form-data with boundary automatically"
  - "state.uploadSessionId cleared in btnFetch handler so URL re-fetch never carries a stale session ID into export"
  - "doExport sends uploadSessionId OR pageUrl, never both — server branches on uploadSessionId presence"
metrics:
  duration: ~20 min
  completed: 2026-04-14
  tasks_completed: 1
  files_modified: 1
---

# Phase 08 Plan 02: Folder Upload Frontend — Summary

Tab-based input toggle (URL | Pasta de Arquivos) added to section-fetch, with a webkitdirectory file input, FormData upload handler for /api/upload-folder, and doExport integration that sends uploadSessionId instead of pageUrl when the upload flow was used.

## What Was Implemented

### A. CSS
- `.input-tabs` / `.input-tab` / `.tab-active` — tab bar with purple active indicator matching dark theme
- `.folder-row` / `.folder-label` / `.folder-label.has-files` — folder selector row with styled label

### B. HTML — section-fetch refactored
- `.input-tabs` bar with `#tab-url` (active by default) and `#tab-folder` buttons placed above panels
- `#panel-url` wraps existing URL input + Analisar button (all existing IDs preserved)
- `#panel-folder` (initially `display:none`) contains `#folder-input` (webkitdirectory multiple), `#folder-label`, and `#btn-upload` ("Processar Pasta")
- `#fetch-error` and `#analyzing-box` remain outside panels — shared by both flows

### C. JavaScript — state + DOM refs
- `uploadSessionId: null` added to the state object
- 7 new DOM refs: `tabUrl`, `tabFolder`, `panelUrl`, `panelFolder`, `folderInput`, `folderLabel`, `btnUpload`

### D. Tab switching
- `switchInputTab('url' | 'folder')` toggles `tab-active` class and panel `display`
- Click listeners on both tab buttons

### E. Folder selection display
- `folderInput` change handler updates label text and `has-files` class

### F. setFetchLoading extended
- Now also disables/enables `btnUpload` and toggles its `loading` class — single loading gate for both flows

### G. Upload handler
- `uploadInFlight` guard prevents double-submit
- Builds `FormData` with `files` (File objects) + `paths[]` (webkitRelativePath strings)
- POSTs to `/api/upload-folder` via `fetchWithTimeout` with 60s timeout
- No `Content-Type` header set — browser handles multipart boundary
- On success: populates all state fields (fetchedHtml, uploadSessionId, checkoutLinks, delaySeconds, hasDelay, delayScriptContent, delayType, bundleImages)
- Reveals sections in identical order to URL fetch (summary, header, player, extraScripts, checkout, delay, bundleImages)
- Calls `stopAnalyzing(true)` and `renderSlots()` exactly as the URL handler

### H. btnFetch handler patched
- `state.uploadSessionId = null` set on every URL fetch to clear stale session IDs

### I. doExport payload
- `pageUrl: state.uploadSessionId ? undefined : state.fetchedUrl` — omitted when upload flow
- `uploadSessionId: state.uploadSessionId || undefined` — included only when upload flow

## Deviations from Plan

None — plan executed exactly as written. The `setFetchLoading` extension (step I in the plan) was implemented as an extension of the existing function rather than a separate `setUploadLoading`, as the plan preferred the "extension" approach.

## Known Stubs

None — all data flows are fully wired from upload response to state to editor sections to export payload.

## Threat Flags

No new trust-boundary surface beyond what is documented in the plan's threat model. T-08-08 (no manual Content-Type), T-08-09 (folder label display only), and T-08-10 (60s timeout) mitigations are all implemented.

## Self-Check: PASSED

- public/index.html committed: b615765
- All 17 automated verification checks: PASS
- tab-url, tab-folder, panel-url, panel-folder elements present
- webkitdirectory attribute present on folder-input
- uploadSessionId in state, switchInputTab function, /api/upload-folder call all confirmed
- url-input and btn-fetch IDs preserved (URL flow unaffected)
- No file deletions in commit (250 insertions, 20 deletions — deletions are lines replaced by the refactored section-fetch structure)
