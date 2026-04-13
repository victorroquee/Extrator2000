---
phase: 5
plan: "05-02"
subsystem: frontend
tags: [bundle-images, frontend, ui, state-management, export]
dependency_graph:
  requires: [05-01]
  provides: [bundle-images-section-ui, bundle-images-state-wiring, bundle-images-export-payload]
  affects: [public/index.html, /api/export-zip payload]
tech_stack:
  added: []
  patterns: [vanilla-JS-DOM-creation, data-attributes-for-payload-building, section-hidden-show-pattern]
key_files:
  created: []
  modified:
    - public/index.html
decisions:
  - "D-08: section-bundle-images uses standard card section-hidden pattern — same as section-delay"
  - "D-09: each bundle row renders thumbnail 60x60 + label (bundleLabel helper) + URL input pre-filled with detected src"
  - "D-10: section revealed only when Object.keys(state.bundleImages).length > 0 — hidden when no images detected"
  - "D-11: no empty-state message shown — section stays hidden (same as section-delay when hasDelay=false)"
  - "buildBundleImagesPayload reads data-bundle-qty and data-original-src attributes from live DOM inputs"
  - "Only entries where newSrc !== originalSrc are included in the export payload (BUNDLE-03)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13T12:30:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 5 Plan 02: Frontend Bundle Images UI and Export Wiring Summary

**One-liner:** Added bundle images editor section with thumbnail + label + editable URL per detected bundle qty, wired into fetch state and export payload using data attributes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add bundle images HTML section and CSS | 72b4d56 | public/index.html |
| 2 | Wire bundle images state, render, and export into frontend | d6cb191 | public/index.html |

## What Was Built

### Task 1 — HTML section and CSS

New CSS block added before `.section-hidden` rule:
- `.bundle-image-item` — flex row with gap, padding, border-bottom separator
- `.bundle-image-thumb` — 60x60px img with object-fit contain and #222 background
- `.bundle-image-label` — bold label, min-width 70px, nowrap
- `.bundle-image-item input[type="url"]` — flex:1, min-width 200px

New HTML section added between `#section-delay` and `#section-checkout`:
- `id="section-bundle-images"` with `class="card section-hidden"` (D-08)
- `id="bundle-images-container"` div for dynamic JS population
- Section title "C.6 — Imagens de Bundle"

### Task 2 — State, DOM refs, render function, export wiring

**State extension:** `bundleImages: {}` added to the `state` object after `delayScriptContent`.

**DOM refs:** `sectionBundleImages` and `bundleImagesContainer` added after delay refs.

**`renderBundleImages(images)`** function:
- Sorts keys numerically (2, 3, 6)
- For each bundle qty: creates flex row with `<img class="bundle-image-thumb">`, `<span class="bundle-image-label">`, `<input type="url">`
- Input pre-filled with detected `src`, `data-bundle-qty` and `data-original-src` attributes set
- `onerror` hides broken thumbnails
- `input` event listener live-updates thumbnail src

**`buildBundleImagesPayload()`** function:
- Queries `input[data-bundle-qty]` from container
- Reads `data-original-src` and current `input.value`
- Only includes entries where `newSrc !== originalSrc` (BUNDLE-03)

**Fetch handler wiring:**
- `state.bundleImages = (data.summary && data.summary.bundleImages) || {}` stored after delay state
- After delay section reveal: checks `Object.keys(state.bundleImages).length > 0`, calls `renderBundleImages` and `showSection(sectionBundleImages)` (D-10)

**Export handler wiring:**
- After delay payload block: if `state.bundleImages` is non-empty, calls `buildBundleImagesPayload()`
- `payload.bundleImages` set only when at least one URL was changed by the user

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The UI is fully wired: fetch response populates state, render creates DOM, export reads user edits via data attributes. No placeholder values flow to UI rendering.

## Threat Flags

No new threat surface beyond what was declared in the plan's threat model:
- T-05-04: `img.src` assignment from user input — browser sandbox handles it; `onerror` hides broken images.
- T-05-05: `newSrc` in payload — server-side URL validation (T-05-01, Plan 05-01) rejects non-parseable URLs; frontend uses `type="url"` input.
- T-05-06: `data-original-src` attribute — public page data only, not persisted.

## Self-Check: PASSED

- `public/index.html` exists: confirmed
- `id="section-bundle-images"`: 1 match
- `id="bundle-images-container"`: 1 match
- `class="card section-hidden"` on section-bundle-images: confirmed
- `.bundle-image-item` CSS: 4 matches (definition + JS usage)
- `.bundle-image-thumb` CSS: 2 matches (definition + JS usage)
- `function renderBundleImages`: 1 match
- `function buildBundleImagesPayload`: 1 match
- `state.bundleImages`: 4 matches (declaration, fetch assign, 2x export checks)
- `showSection(sectionBundleImages)`: 1 match
- `renderBundleImages(state.bundleImages)`: 1 match
- `payload.bundleImages`: 1 match
- Commits `72b4d56` and `d6cb191` present in git log: confirmed
