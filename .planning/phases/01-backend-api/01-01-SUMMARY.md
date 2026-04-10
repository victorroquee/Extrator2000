---
phase: "01-backend-api"
plan: "01-01"
subsystem: "backend"
tags: [express, api, cheerio, axios, cleanup, checkout-detection, export]
dependency_graph:
  requires: []
  provides: ["/api/fetch", "/api/export", "/api/health"]
  affects: ["Phase 2 UI", "Phase 3 Integration"]
tech_stack:
  added: ["express@4.18", "axios@1.6", "cheerio@1.0"]
  patterns: ["Express REST API", "Cheerio HTML manipulation", "Axios anti-bot headers"]
key_files:
  created:
    - server.js
    - public/index.html
    - package.json
    - .gitignore
    - package-lock.json
  modified: []
decisions:
  - "CLEAN-07: jQuery, Bootstrap, Slick, Swiper, FontAwesome e Google Fonts são preservados por exclusão da lista de remoção (whitelist implícita via keyword matching)"
  - "CLEAN-08: Placeholder é injetado como div laranja com id=vsl-placeholder para fácil substituição no export"
  - "CHECK-02: Bundle context detectado por keywords no texto âncora + contexto do elemento pai imediato"
  - "EXPORT-04: Substituição de links usa seletor CSS armazenado no checkout link para precisão"
metrics:
  duration: "~20min"
  completed: "2026-04-10"
  tasks_completed: 4
  files_created: 5
---

# Phase 1 Plan 01: Backend API — Server Setup, Fetch, Cleanup, Checkout Detection & Export Summary

**One-liner:** Express API com axios (anti-bot headers) + cheerio para remover 14 categorias de trackers/players, detectar checkout links por plataforma/bundle, e exportar HTML com substituições do afiliado.

## What Was Built

Implementação completa do backend API (`server.js`) com:

### POST /api/fetch
- Busca qualquer URL VSL via axios com headers anti-bot (User-Agent Chrome, Accept-Language pt-BR, Cache-Control)
- maxRedirects: 10 para seguir encadeamentos
- Pipeline de cleanup via cheerio:
  - Remove scripts de rastreamento (fbevents, GTM, hotjar, clarity, tiktok, vturb, pixel, adroll, etc.)
  - Remove scripts com atributos data-vturb ou data-player-id
  - Remove noscripts com pixels de rastreamento (Facebook, Google)
  - Remove link preload/prefetch para .mp4, .m3u8 ou domínios vturb
  - Remove iframes de players (vturb, YouTube embed, Vimeo)
  - Remove divs wrapper com class/id contendo smartplayer/vturb-player/vsl-player/video-container
  - Preserva jQuery, Bootstrap e outros scripts sem keyword de remoção
  - Injeta `<!-- [VSL_PLACEHOLDER] -->` + div visual laranja na posição do player removido
- Detecção de checkout links: `<a>` e `<button>` com href/onclick contendo padrões ClickBank, Hotmart, Kiwify, Eduzz, Monetizze, /checkout, /buy, /order, /purchase
- Classificação por bundle (2/3/6 potes) via keywords no contexto textual
- Retorna `{ html, summary: { scriptsRemoved, vslDetected, checkoutLinks } }`

### POST /api/export
- Injeta headerPixel e headerPreload antes de `</head>`
- Substitui o placeholder div pelo embed do player VTURB
- Substitui href de cada checkout link pelo URL do afiliado (via seletor CSS)
- Retorna HTML completo como download `pagina-afiliado.html`

### GET /api/health
- Health check simples: `{ ok: true }`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Project initialization | 04d49ca | package.json, .gitignore |
| 2 | Server bootstrap + todas as rotas | 25ffeba | server.js, public/index.html |
| 3 | (incluído no Task 2) POST /api/fetch | 25ffeba | server.js |
| 4 | (incluído no Task 2) POST /api/export | 25ffeba | server.js |

## Deviations from Plan

### Auto-implemented Inclusions

**1. [Rule 2 - Missing functionality] Tasks 3 e 4 implementadas junto com Task 2**
- As rotas foram desenvolvidas de forma coesa num único arquivo, sem commits separados por rota
- Todos os requisitos FETCH-01 a FETCH-04, CLEAN-01 a CLEAN-08, CHECK-01 a CHECK-04, EXPORT-01 a EXPORT-05 estão cobertos no mesmo commit

**2. [Rule 2 - Missing functionality] GET /api/health adicionado**
- Encontrado durante: Task 2
- Motivo: Necessário para verificação básica do servidor
- Arquivos modificados: server.js

**3. [Rule 2 - Missing functionality] Placeholder injection fallback no body**
- Encontrado durante: Task 3
- Issue: Se nenhum iframe VSL é detectado mas scripts vturb são removidos, a posição do player é perdida
- Fix: Quando vslDetected=true mas nenhum iframe foi substituído, injeta placeholder no início do body

## Verification

Testes executados inline:
- Cleanup: 5 itens removidos do HTML de teste, jQuery preservado
- VSL detection: vslDetected=true quando iframe vturb presente
- Checkout detection: ClickBank e Hotmart detectados, texto de bundle classifica corretamente
- Export: headerPixel injetado, placeholder substituído, link afiliado aplicado — todos true

## Known Stubs

- `public/index.html`: Placeholder minimalista — será substituído na Fase 2 (Frontend UI)

## Self-Check: PASSED

- [x] server.js existe
- [x] package.json existe
- [x] public/index.html existe
- [x] Commits 04d49ca, 25ffeba, 68bf7a4 existem
- [x] Servidor inicia sem erros (testado)
- [x] Lógica de cleanup e export verificada
