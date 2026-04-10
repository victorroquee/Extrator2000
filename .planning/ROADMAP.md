# Roadmap: VSL Cloner

## Overview

Three phases build the VSL Cloner from API to interface to integrated product. Phase 1 delivers a fully testable backend (curl-verifiable). Phase 2 delivers the complete dark-theme PT-BR UI as a static file. Phase 3 wires them together, validates all 5 real VSL patterns, and produces a downloadable affiliate page end-to-end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Backend API** - server.js with fetch, cleanup, checkout detection, and export routes
- [ ] **Phase 2: Frontend UI** - public/index.html complete dark-theme PT-BR interface
- [ ] **Phase 3: Integration & Polish** - wire frontend to backend, validate 5 VSL patterns, ship working product

## Phase Details

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
- [ ] 02-01-PLAN.md — Complete public/index.html: dark theme, all sections, JS state management, API integration

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend API | 0/? | Not started | - |
| 2. Frontend UI | 0/1 | Planned | - |
| 3. Integration & Polish | 0/? | Not started | - |
