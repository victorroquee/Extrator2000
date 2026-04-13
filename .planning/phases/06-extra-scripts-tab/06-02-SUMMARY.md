---
phase: 06-extra-scripts-tab
plan: 02
subsystem: frontend
tags: [extra-scripts, vanilla-js, dynamic-dom, event-delegation, export-payload]
dependency_graph:
  requires: []
  provides: [section-extra-scripts-ui, extraScripts-state, extraScripts-export-payload]
  affects: [public/index.html]
tech_stack:
  added: []
  patterns: [section-hidden+showSection, dynamic DOM list with event delegation, data-attribute keyed state]
key_files:
  created: []
  modified:
    - public/index.html
decisions:
  - "Placeholder string containing </script> escaped as <\/script> to avoid HTML parser premature script tag termination"
  - "removeScript uses .script-item[data-script-id] selector on wrapper div (not textarea) for correct DOM removal"
  - "state.extraScripts uses {id, content} objects (not plain strings) to support stable reordering by id"
metrics:
  duration_seconds: 173
  completed_date: "2026-04-13"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 1
---

# Phase 06 Plan 02: Extra Scripts Frontend — Summary

**One-liner:** Dynamic extra-scripts section card with add/remove/reorder controls wired into export payload via vanilla JS event delegation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add section HTML and CSS classes | 16c090e | public/index.html |
| 2 | Add JS state, DOM refs, render function, event handlers, and export wiring | 395cda7 | public/index.html |

## What Was Built

### HTML (Task 1)
- Inserted `#section-extra-scripts` card between `#section-header` and `#section-player` (D-04 position)
- Section contains `#scripts-list-container` (dynamic list target) and `#btn-add-script` (`.btn .btn-primary`)
- Card title: "C.3 — Scripts Extras"

### CSS (Task 1)
Added classes to `<style>` block:
- `.script-item` — flex column, gap 8px, border-bottom separator
- `.script-item:last-child` — removes bottom border
- `.script-item-header` — flex row, space-between, label left / controls right
- `.script-item-label` — 0.8rem, #ccc, ellipsis overflow
- `.script-item-controls` — flex row, gap 4px, flex-shrink 0
- `.btn-script-control` — 28x28px, transparent bg, #444 border, #888 text; hover and disabled states
- `@media (max-width: 600px)` — `#btn-add-script` full-width

### JavaScript (Task 2)
- `state.extraScripts = []` added to state object — array of `{ id, content }` in display order
- DOM refs: `sectionExtraScripts`, `scriptsListContainer`, `btnAddScript`
- `renderScriptLabels()` — re-numbers labels ("Script 1"…N), sets ↑/↓ disabled states and aria-labels
- `addScript()` — generates UUID id, pushes to state, creates `.script-item` DOM node with textarea and control buttons, calls `renderScriptLabels()`, focuses new textarea
- `removeScript(id)` — filters state array, removes `.script-item[data-script-id]` from DOM, re-renders labels
- `moveScript(id, direction)` — swaps in state array, swaps DOM nodes via `insertBefore`, re-renders labels
- `buildExtraScriptsPayload()` — reads textarea values by `data-script-id`, returns string array in order
- Event listener: `btnAddScript` click → `addScript()`
- Event delegation: `scriptsListContainer` click → finds `[data-action]` button → finds `.script-item` ancestor → dispatches to `removeScript`/`moveScript`
- `showSection(sectionExtraScripts)` called unconditionally in fetch success callback (D-03)
- `extraScripts: buildExtraScriptsPayload()` added to export payload object (SCRIPTS-04 frontend side)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `</script>` in JS string literal breaking HTML parser**
- **Found during:** Task 2, JS syntax check
- **Issue:** The textarea placeholder string in `addScript()` contained `</script>` literal inside a JS string within the `<script>` block. The browser HTML parser terminates the script element at the first `</script>` token regardless of string context, causing a syntax error.
- **Fix:** Escaped as `<\/script>` in the JS string — the backslash is invisible to the JS parser but prevents the HTML tokenizer from closing the script element prematurely.
- **Files modified:** `public/index.html` (line 662)
- **Commit:** 395cda7

## Checkpoint Pending

Task 3 is a `checkpoint:human-verify` — manual browser verification required before this plan can be marked fully complete.

**What to verify:**
1. Start server: `node server.js`
2. Open http://localhost:3000
3. Fetch any VSL URL — confirm "C.3 — Scripts Extras" section card appears
4. Click "+ Adicionar Script" — confirm Script 1 with textarea and ↑/↓/× controls
5. Add Script 2 — confirm ↓ on Script 1 enables, ↑ on Script 2 enables
6. Test ↑/↓ reorder — items swap correctly
7. Test × removal — item removed, remaining renumber
8. Export — confirm `extraScripts` array in payload (check via browser devtools network tab)

## Known Stubs

None — all functionality is fully wired.

## Self-Check: PASSED

- `public/index.html` exists and was modified
- Commit 16c090e exists (Task 1 — HTML + CSS)
- Commit 395cda7 exists (Task 2 — JS state + handlers)
- `grep -c "extraScripts" public/index.html` returns 11 (> 8 required)
- `showSection(sectionExtraScripts)` appears exactly once (unconditional in fetch callback)
- `buildExtraScriptsPayload` appears at least 2 lines (definition + call in payload)
- JS syntax validated via `new Function()` check — PASSED
