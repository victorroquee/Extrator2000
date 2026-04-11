# Roadmap: VSL Cloner

## Overview

Three phases build the VSL Cloner from API to interface to integrated product. Phase 1 delivers a fully testable backend (curl-verifiable). Phase 2 delivers the complete dark-theme PT-BR UI as a static file. Phase 3 wires them together, validates all 5 real VSL patterns, and produces a downloadable affiliate page end-to-end.

Milestone v1.1 (Editor Avançado) extends the product with three additive editor features: VTURB delay control, bundle image replacement, and extra scripts injection. Phases 4–6 continue from where v1.0 ended.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### Milestone v1.0 (Shipped)

- [x] **Phase 1: Backend API** - server.js with fetch, cleanup, checkout detection, and export routes
- [x] **Phase 2: Frontend UI** - public/index.html complete dark-theme PT-BR interface
- [x] **Phase 3: Integration & Polish** - wire frontend to backend, validate 5 VSL patterns, ship working product

### Milestone v1.1 — Editor Avançado

- [ ] **Phase 4: VTURB Delay + Export Idempotency** - extract and expose delay control; fix double-inject export bug
- [ ] **Phase 5: Bundle Images** - detect, preview, and replace product bottle images per pricing section
- [ ] **Phase 6: Extra Scripts Tab** - dedicated scripts tab with add/remove/reorder and head injection

## Phase Details

---

### [ARCHIVED — Milestone v1.0]

### Phase 1: Backend API
**Goal**: All API routes are implemented and return correct results when called directly
**Depends on**: Nothing (first phase)
**Requirements**: FETCH-01, FETCH-02, FETCH-03, FETCH-04, CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08, CHECK-01, CHECK-02, CHECK-03, CHECK-04, EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05
**Success Criteria** (what must be TRUE):
  1. POST /api/fetch with a real VSL URL returns cleaned HTML and a summary (scripts removed count, VSL detected, checkout links found)
  2. Cleaned HTML has no Facebook Pixel, GTM, VTURB player scripts, or tracking iframes — and jQuery/Bootstrap are preserved
  3. POST /api/export with affiliate pixel, player embed, and checkout links returns a downloadable HTML file with all substitutions applied
  4. Checkout links in the returned summary are classified by platform (ClickBank, Hotmart, Kiwify, Eduzz, Monetizze) and bundle context
**Plans**: TBD

### Phase 2: Frontend UI
**Goal**: The UI renders correctly in a browser and all input fields, states, and sections are functional
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08
**Success Criteria** (what must be TRUE):
  1. User sees a dark-theme PT-BR page at localhost:3000 with a URL input and "Extrair Página" button
  2. After fetch, a summary card shows scripts removed, VSL detected status, and links found count
  3. Header textareas (Pixel & Scripts, Script VTURB/Preload), player embed textarea, and checkout link inputs are all visible and editable
  4. When 0 checkout links are detected, three labeled empty inputs appear (Bundle 2, 3, and 6 Potes)
  5. "Gerar Página Afiliado" button is present and triggers file download
**Plans**: 1 plan
Plans:
- [x] 02-01-PLAN.md — Complete public/index.html: dark theme, all sections, JS state management, API integration

### Phase 3: Integration & Polish
**Goal**: Users can clone any supported VSL page end-to-end — from URL input to downloaded affiliate HTML — in under 1 minute
**Depends on**: Phase 2
**Requirements**: FETCH-01, FETCH-02, FETCH-03, FETCH-04, CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, CLEAN-07, CLEAN-08, CHECK-01, CHECK-02, CHECK-03, CHECK-04, EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08
**Success Criteria** (what must be TRUE):
  1. User pastes a VSL URL, clicks "Extrair Página", and the summary card populates within a few seconds
  2. User fills in their pixel, player embed, and checkout links, clicks the export button, and receives a valid "pagina-afiliado.html" download
  3. The downloaded HTML contains the affiliate pixel before </head>, the VTURB embed in the exact player position, and affiliate checkout URLs on all buy buttons
  4. All 5 real VSL patterns (VTURB embed, ClickBank hop link, Meta Pixel, VTURB preload, Hotmart pay link) produce correct output without errors
**Plans**: TBD

---

### [Milestone v1.1 — Editor Avançado]

### Phase 4: VTURB Delay + Export Idempotency
**Goal**: Users can see and edit the VTURB delay value in the editor, and exporting the same page multiple times never duplicates injected content
**Depends on**: Phase 3
**Requirements**: DELAY-01, DELAY-02, DELAY-03, EXPORT-06
**Success Criteria** (what must be TRUE):
  1. After fetching a VSL page, the editor shows the current delay value in seconds (e.g. "5") extracted from the page's `displayHiddenElements` block
  2. User can change the delay value and the exported HTML uses the new number — the rest of the original delay script block is preserved verbatim
  3. Exporting the same page twice produces identical HTML output — no duplicate pixel, preload, or delay script blocks appear
  4. When no delay block is found in the page, the delay input is hidden or shows a "não detectado" state without errors
**Plans**: 2 plans
Plans:
- [ ] 04-01-PLAN.md — server.js: detectVturbDelay helper, /api/fetch extension, buildExportHtml idempotency sentinel + delay inject, both export routes updated, new tests
- [ ] 04-02-PLAN.md — public/index.html: Section C.5 delay UI, state extension, fetch/export handler wiring
**UI hint**: yes

### Phase 5: Bundle Images
**Goal**: Users can see and replace product bottle images for each pricing section directly in the editor
**Depends on**: Phase 4
**Requirements**: BUNDLE-01, BUNDLE-02, BUNDLE-03
**Success Criteria** (what must be TRUE):
  1. After fetching a VSL page, the editor shows a thumbnail and editable URL field for each detected bundle image (e.g. 2-pote, 3-pote, 6-pote sections)
  2. User can paste a new image URL and the exported HTML replaces every occurrence of that image — including duplicate desktop/mobile sections — with the new URL
  3. When no bundle images are detected, the section shows a graceful empty state without errors
**Plans**: TBD
**UI hint**: yes

### Phase 6: Extra Scripts Tab
**Goal**: Users can manage a list of additional scripts that are injected into the exported page head after the main pixel
**Depends on**: Phase 4
**Requirements**: SCRIPTS-01, SCRIPTS-02, SCRIPTS-03, SCRIPTS-04
**Success Criteria** (what must be TRUE):
  1. User sees a dedicated "Scripts Extras" tab in the editor where they can add one or more script blocks (full `<script>` tags or bare JS — both accepted)
  2. User can remove any individual script from the list
  3. User can reorder scripts in the list, and the exported HTML injects them in that exact order
  4. In the exported HTML, extra scripts appear in `<head>` after `headerPixel` and `headerPreload` — never duplicated on repeated exports
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend API | —/— | Shipped (v1.0) | 2026-04-10 |
| 2. Frontend UI | 1/1 | Shipped (v1.0) | 2026-04-10 |
| 3. Integration & Polish | —/— | Shipped (v1.0) | 2026-04-11 |
| 4. VTURB Delay + Export Idempotency | 0/2 | Not started | - |
| 5. Bundle Images | 0/? | Not started | - |
| 6. Extra Scripts Tab | 0/? | Not started | - |
