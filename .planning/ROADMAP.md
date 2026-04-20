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

- [x] **Phase 4: VTURB Delay + Export Idempotency** - extract and expose delay control; fix double-inject export bug (completed 2026-04-11)
- [x] **Phase 5: Bundle Images** - detect, preview, and replace product bottle images per pricing section (completed 2026-04-13)
- [x] **Phase 6: Extra Scripts Tab** - dedicated scripts tab with add/remove/reorder and head injection (completed 2026-04-13)

### Milestone v1.2 — Upload Local + Detecção Aprimorada

- [ ] **Phase 7: Checkout & Bundle Detection Fix** - fix CSS selector specificity and bundle keyword context so each button gets its correct pote number
- [x] **Phase 8: Folder Upload** - allow users to upload a local HTML project folder (index.html + assets) as an alternative to URL fetch (completed 2026-04-14)

### Milestone v1.3 — Extrator Interno (branch: extrator-interno)

- [ ] **Phase 10: Nome do Produto — Detecção e Substituição** - detectar o nome do produto na página e substituir todas as ocorrências por um novo nome fornecido pelo afiliado
- [ ] **Phase 11: Potes & Cores — Editor Visual** - editor visual de potes e paleta de cores por seção de pricing (promovido do backlog 999.1)

### Milestone v1.4 — Export JSON Elementor (branch: EXPORT-JSON-ELEMENTOR)

- [ ] **Phase 12: Core JSON Builder** - buildElementorJson function: valid Elementor structure, unique IDs, per-section containers, html widgets, all affiliate customizations included
- [ ] **Phase 13: Export Route** - POST /api/export-elementor endpoint: reuses buildExportHtml, validates output, returns .json download
- [ ] **Phase 14: Frontend Export Button** - "Exportar Elementor (.json)" button and tooltip in the UI alongside existing export options

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
**Plans**: 2 plans
Plans:
- [ ] 05-01-PLAN.md — server.js: detectBundleImages helper, /api/fetch extension, buildExportHtml image replacement, both export routes updated
- [ ] 05-02-PLAN.md — public/index.html: Section C.6 bundle images UI, state extension, fetch/export handler wiring

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
**Plans**: 2 plans
Plans:
- [ ] 05-01-PLAN.md — server.js: detectBundleImages helper, /api/fetch extension, buildExportHtml image replacement, both export routes updated
- [ ] 05-02-PLAN.md — public/index.html: Section C.6 bundle images UI, state extension, fetch/export handler wiring

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
- [x] 04-01-PLAN.md — server.js: detectVturbDelay helper, /api/fetch extension, buildExportHtml idempotency sentinel + delay inject, both export routes updated, new tests
- [x] 04-02-PLAN.md — public/index.html: Section C.5 delay UI, state extension, fetch/export handler wiring
**UI hint**: yes

### Phase 5: Bundle Images
**Goal**: Users can see and replace product bottle images for each pricing section directly in the editor
**Depends on**: Phase 4
**Requirements**: BUNDLE-01, BUNDLE-02, BUNDLE-03
**Success Criteria** (what must be TRUE):
  1. After fetching a VSL page, the editor shows a thumbnail and editable URL field for each detected bundle image (e.g. 2-pote, 3-pote, 6-pote sections)
  2. User can paste a new image URL and the exported HTML replaces every occurrence of that image — including duplicate desktop/mobile sections — with the new URL
  3. When no bundle images are detected, the section shows a graceful empty state without errors
**Plans**: 2 plans
Plans:
- [x] 05-01-PLAN.md — server.js: detectBundleImages helper, /api/fetch extension, buildExportHtml image replacement, both export routes updated
- [x] 05-02-PLAN.md — public/index.html: Section C.6 bundle images UI, state extension, fetch/export handler wiring
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
**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md — server.js: extraScripts destructuring in /api/export and /api/export-zip, buildExportHtml injection with auto-wrap
- [x] 06-02-PLAN.md — public/index.html: section #section-extra-scripts card HTML + CSS, JS state + add/remove/reorder handlers, fetch reveal + export payload wiring
**UI hint**: yes

---

### [Milestone v1.2 — Upload Local + Detecção Aprimorada]

### Phase 7: Checkout & Bundle Detection Fix
**Goal**: Cada botão de checkout recebe o número de pote correto e o link afiliado é aplicado ao botão certo — sem misturar links entre bundles
**Depends on**: Phase 6
**Requirements**: CHECK-02, CHECK-03, CHECK-04
**Success Criteria** (what must be TRUE):
  1. Ao buscar uma VSL com 3 botões de checkout (2, 3 e 6 potes), cada um recebe o label correto no editor
  2. O seletor CSS gerado é suficientemente específico para distinguir botões de classes iguais (usa nth-child ou índice quando necessário)
  3. O export aplica o link afiliado apenas ao botão correspondente ao bundle preenchido
  4. Quando bundle não é detectado, o campo mostra "Sem bundle detectado" em vez de ficar em branco sem contexto
**Plans:** 0 plans

Plans:
- [ ] TBD

### Phase 8: Folder Upload
**Goal**: Usuários podem enviar uma pasta local com projeto HTML (index.html + assets) como alternativa ao fetch por URL — sem precisar de um link público
**Depends on**: Phase 7
**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04
**Success Criteria** (what must be TRUE):
  1. Interface exibe duas abas no topo do input: "URL" e "Pasta de Arquivos" — troca o campo sem recarregar
  2. Na aba "Pasta de Arquivos", o usuário seleciona uma pasta local; todos os arquivos (HTML, CSS, JS, imagens) são enviados via multipart para `/api/upload-folder`
  3. O servidor identifica o index.html, processa-o com o mesmo pipeline de limpeza/detecção do `/api/fetch`, e retorna o mesmo formato de resposta (html, summary, checkoutLinks, bundleImages, delay)
  4. O export ZIP inclui o index.html processado + todos os assets originais da pasta — estrutura de diretórios preservada
  5. O fluxo pós-upload (editor de afiliado, export) é idêntico ao fluxo pós-URL
**Plans:** 2/2 plans complete

Plans:
- [x] 08-01-PLAN.md — server.js: multer + sessionStore + /api/upload-folder route + /api/export-zip uploadSessionId branch
- [x] 08-02-PLAN.md — public/index.html: tab toggle UI (URL/Pasta), folder input, upload handler JS, export uploadSessionId integration

### Phase 9: Export Verification Flow
**Goal**: Ao gerar a página afiliado, o usuário vê uma tela de progresso com verificações reais — e só pode baixar quando tudo estiver OK (ou com avisos explicados)
**Depends on**: Phase 8
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03
**Success Criteria** (what must be TRUE):
  1. Ao clicar "Gerar Página Afiliado", uma modal/overlay mostra os passos em sequência: Criando página → Verificando scripts → Confirmando botões de checkout → Confirmando delay
  2. Cada passo faz uma verificação real no HTML gerado: scripts de tracking removidos, checkout links presentes, delay injetado se configurado
  3. Se checkout não for encontrado no HTML exportado, o passo fica vermelho e bloqueia o download — exibe "Rever configuração" para o usuário corrigir
  4. Scripts e delay não encontrados mostram ⚠ (aviso amarelo) mas não bloqueiam — o botão "Baixar mesmo assim" fica disponível
  5. Quando todos os passos passam (ou apenas warnings), aparece "Sua página está pronta!" com botão de download destacado
  6. Funciona tanto para export de página via URL quanto via pasta de arquivos
**Plans:** 0 plans

Plans:
- [ ] TBD

---

### [Milestone v1.3 — Extrator Interno] (branch: extrator-interno)

- [ ] **Phase 10: Nome do Produto — Detecção e Substituição** - detectar o nome do produto na página e substituir todas as ocorrências por um novo nome fornecido pelo afiliado
- [ ] **Phase 11: Potes & Cores — Editor Visual** - editor visual de potes e paleta de cores por seção de pricing (promovido do backlog 999.1)

### Phase 10: Nome do Produto — Detecção e Substituição
**Goal**: O afiliado pode ver o nome do produto detectado na página, opcionalmente substituí-lo por um nome novo, e o export troca todas as ocorrências do nome original pelo novo em todo o HTML
**Depends on**: Phase 9
**Branch**: extrator-interno
**Requirements**: PRODUCT-01, PRODUCT-02, PRODUCT-03
**Success Criteria** (what must be TRUE):
  1. Após fetch/upload, o editor exibe o nome do produto detectado automaticamente (extraído de title, h1, meta og:title, ou padrões recorrentes de texto)
  2. O afiliado pode editar o campo "Nome do Produto" com o novo nome desejado
  3. Se o campo for preenchido, o export substitui TODAS as ocorrências do nome original pelo novo — em texto visível, atributos alt, title, meta tags e og tags
  4. Se o campo ficar vazio, nenhuma substituição é feita (comportamento preservado)
  5. A detecção funciona tanto para páginas obtidas por URL quanto por upload de pasta
**Plans:** 0 plans

Plans:
- [ ] TBD

### Phase 11: Potes & Cores — Editor Visual
**Goal**: O afiliado pode ver e editar a quantidade de potes e as cores de fundo/borda de cada seção de pricing diretamente na interface, sem tocar no HTML
**Depends on**: Phase 10
**Branch**: extrator-interno
**Requirements**: POTES-01, POTES-02, CORES-01, CORES-02
**Success Criteria** (what must be TRUE):
  1. Após fetch/upload, as seções de pricing (2, 3, 6 potes) são detectadas e exibidas no editor com seus rótulos atuais
  2. O afiliado pode alterar a quantidade de potes exibida em cada seção (ex: trocar "6 Potes" por "3 Potes")
  3. O afiliado pode escolher cor de fundo e cor de borda para cada seção via color picker
  4. O export aplica todas as alterações de texto e cor no HTML gerado
  5. Se nenhuma alteração for feita, o HTML de saída é idêntico ao original nessas seções
**Plans:** 0 plans

Plans:
- [ ] TBD

---

### [Milestone v1.4 — Export JSON Elementor] (branch: EXPORT-JSON-ELEMENTOR)

### Phase 12: Core JSON Builder
**Goal**: Server-side buildElementorJson function converts any affiliate-customized HTML into a valid, importable Elementor JSON structure
**Depends on**: Phase 11
**Branch**: EXPORT-JSON-ELEMENTOR
**Requirements**: ELEM-01, ELEM-02, ELEM-03, ELEM-04, ELEM-05
**Success Criteria** (what must be TRUE):
  1. Calling buildElementorJson with a processed HTML string returns a JSON object with version "0.4", type "page", a content array, and a page_settings object — parseable by Elementor without errors
  2. Every element in the JSON (container or widget) has a unique 8-character hexadecimal ID — no two IDs are identical within the same export
  3. Each visually distinct section of the HTML becomes a separate top-level container in the content array — not one monolithic block
  4. Each container holds exactly one widget of type "html" whose settings.html contains the original section markup
  5. The HTML passed to buildElementorJson already contains the affiliate's pixel, VTURB embed, delay script, updated checkout links, bundle images, and extra scripts — all customizations survive into the JSON output unchanged
**Plans**: 1 plan
Plans:
- [ ] 12-01-PLAN.md — buildElementorJson function: valid Elementor structure, unique IDs, per-section containers, html widgets, head scripts container, validation script

### Phase 13: Export Route
**Goal**: Affiliates can trigger an Elementor JSON export from the server via a dedicated API route that returns a ready-to-import .json file
**Depends on**: Phase 12
**Branch**: EXPORT-JSON-ELEMENTOR
**Requirements**: EXPRT-01, EXPRT-02, EXPRT-03
**Success Criteria** (what must be TRUE):
  1. POST /api/export-elementor with the same payload shape as /api/export returns a file download named "elementor-page.json" with Content-Type application/json
  2. The JSON file returned is built from the HTML produced by buildExportHtml — all affiliate injections (pixel, player, checkout links, bundle images, delay, extra scripts) are present in the widget content
  3. Before the file is sent, the server validates the JSON structure: all IDs are unique 8-char hex strings, all settings values are objects (not strings), and the container hierarchy is correct — validation failures return a 422 with a clear error message
**Plans**: 1 plan
Plans:
- [ ] 12-01-PLAN.md — buildElementorJson function: valid Elementor structure, unique IDs, per-section containers, html widgets, head scripts container, validation script

### Phase 14: Frontend Export Button
**Goal**: Users see and can use the Elementor JSON export option directly in the interface, with enough context to use it correctly
**Depends on**: Phase 13
**Branch**: EXPORT-JSON-ELEMENTOR
**Requirements**: UIEXP-01, UIEXP-02
**Success Criteria** (what must be TRUE):
  1. After fetching a VSL page, a button labeled "Exportar Elementor (.json)" appears in the export section alongside the existing HTML and ZIP export buttons
  2. Clicking the button triggers the POST /api/export-elementor call and initiates a .json file download — same UX pattern as existing export buttons
  3. A tooltip or info note adjacent to the button states the requirements: Elementor 3.6+ with Containers enabled, import via Templates in the WordPress backend
**Plans**: 1 plan
Plans:
- [ ] 12-01-PLAN.md — buildElementorJson function: valid Elementor structure, unique IDs, per-section containers, html widgets, head scripts container, validation script
**UI hint**: yes

---

## Backlog

### Phase 999.1: Potes e Cores — Editor Visual (PROMOVIDO → Phase 11)

**Goal:** Promovido para Phase 11 no Milestone v1.3 (branch: extrator-interno)

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend API | —/— | Shipped (v1.0) | 2026-04-10 |
| 2. Frontend UI | 1/1 | Shipped (v1.0) | 2026-04-10 |
| 3. Integration & Polish | —/— | Shipped (v1.0) | 2026-04-11 |
| 4. VTURB Delay + Export Idempotency | 2/2 | Complete | 2026-04-11 |
| 5. Bundle Images | 2/2 | Complete | 2026-04-13 |
| 6. Extra Scripts Tab | 2/2 | Complete | 2026-04-13 |
| 7. Checkout & Bundle Detection Fix | 0/0 | Complete | 2026-04-14 |
| 8. Folder Upload | 2/2 | Complete   | 2026-04-14 |
| 9. Export Verification Flow | 0/0 | Planned | — |
| 10. Nome do Produto — Detecção e Substituição | 0/0 | Planned (extrator-interno) | — |
| 11. Potes & Cores — Editor Visual | 0/0 | Planned (extrator-interno) | — |
| 12. Core JSON Builder | 0/1 | Planning complete | — |
| 13. Export Route | 0/0 | Not started | — |
| 14. Frontend Export Button | 0/0 | Not started | — |
