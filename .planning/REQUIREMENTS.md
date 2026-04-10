# Requirements: VSL Cloner

**Defined:** 2026-04-10
**Core Value:** Transformar qualquer página VSL em uma cópia 100% funcional com as credenciais do afiliado, em menos de 1 minuto.

## v1 Requirements

### Fetch & Parsing

- [ ] **FETCH-01**: POST /api/fetch aceita { url } e retorna HTML parseado
- [ ] **FETCH-02**: Requisição usa headers anti-bot (User-Agent Chrome, Accept, Accept-Language, Cache-Control)
- [ ] **FETCH-03**: Segue redirecionamentos (maxRedirects: 10)
- [ ] **FETCH-04**: HTML é parseado com cheerio para manipulação

### Cleanup Automático

- [ ] **CLEAN-01**: Remove `<script>` com src/conteúdo contendo: vturb, smartplayer, fbq, facebook.net, gtag, googletagmanager, hotjar, clarity.ms, tiktok, kwai, taboola, pixel, adroll, snap.licdn
- [ ] **CLEAN-02**: Remove `<script>` com atributos data-vturb ou data-player-id
- [ ] **CLEAN-03**: Remove `<noscript>` contendo facebook, google, pixel ou `<img>` de domínios de tracking
- [ ] **CLEAN-04**: Remove `<link rel="preload/prefetch">` para .mp4, .m3u8 ou domínios vturb
- [ ] **CLEAN-05**: Remove `<iframe>` de: smartplayer.vturb.com.br, cdn.vturb.com, player.vturb.com, youtube.com/embed, player.vimeo.com
- [ ] **CLEAN-06**: Remove `<div>` com class/id contendo "smartplayer", "vturb-player", "vsl-player", "video-container" quando wrapping iframe
- [ ] **CLEAN-07**: Preserva jQuery, Bootstrap, Slick, Swiper, FontAwesome, Google Fonts e scripts sem keyword de remoção
- [ ] **CLEAN-08**: Injeta `<!-- [VSL_PLACEHOLDER] -->` + div visual laranja na posição do player removido

### Detecção de Checkout

- [ ] **CHECK-01**: Detecta `<a>` e `<button>` com href/onclick contendo padrões de checkout (ClickBank, Hotmart, Kiwify, Eduzz, Monetizze, /checkout, /buy, /order, /purchase)
- [ ] **CHECK-02**: Classifica links em bundles por contexto (texto próximo: "2 pote", "3 pote", "6 pote", "popular", "best value")
- [ ] **CHECK-03**: Armazena: href original, selector CSS, texto âncora
- [ ] **CHECK-04**: Suporta os 5 padrões reais: VTURB embed, ClickBank hop link, Meta Pixel, VTURB preload, Hotmart pay link

### UI Frontend

- [ ] **UI-01**: Input de URL + botão "Extrair Página" com loading spinner
- [ ] **UI-02**: Card de resumo pós-fetch (scripts removidos, VSL detectado, links encontrados)
- [ ] **UI-03**: Dois textareas de header: "Pixel & Scripts de Rastreamento" e "Script VTURB / Preload"
- [ ] **UI-04**: Textarea full-width para embed do player VTURB
- [ ] **UI-05**: Inputs de checkout pré-preenchidos com URL original, editáveis pelo afiliado
- [ ] **UI-06**: Se 0 links detectados: exibir 3 inputs vazios (Bundle 2, 3 e 6 Potes)
- [ ] **UI-07**: Botão CTA "⬇️ Gerar Página Afiliado" que dispara download
- [ ] **UI-08**: Dark theme, Portuguese (BR), responsivo mobile

### Export

- [ ] **EXPORT-01**: POST /api/export aceita { html, headerPixel, headerPreload, vslembed, checkoutLinks }
- [ ] **EXPORT-02**: Injeta headerPixel + headerPreload antes de `</head>`
- [ ] **EXPORT-03**: Substitui placeholder div pelo vslembed na posição exata
- [ ] **EXPORT-04**: Substitui href de cada checkout link pelo link do afiliado
- [ ] **EXPORT-05**: Retorna HTML completo como download "pagina-afiliado.html"

## v2 Requirements

### Editor de Imagens

- **IMG-01**: Detectar `<img>` com class/alt contendo "bottle", "pote", "bundle", "kit"
- **IMG-02**: Expor imagens no frontend para substituição via upload

### Editor de Cores

- **COLOR-01**: Extrair CSS custom properties (--primary-color, --accent, background-color)
- **COLOR-02**: Expor seletores de cor editáveis com color picker no frontend

## Out of Scope

| Feature | Reason |
|---------|--------|
| Autenticação de usuários | App single-user local, sem necessidade |
| Deploy multi-user | Fora do escopo v1, complexidade desnecessária |
| Headless browser (Puppeteer) | Axios + cheerio suficiente para os padrões alvo |
| Banco de dados | Sem persistência necessária v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FETCH-01..04 | Phase 1 | Pending |
| CLEAN-01..08 | Phase 1 | Pending |
| CHECK-01..04 | Phase 1 | Pending |
| EXPORT-01..05 | Phase 1 | Pending |
| UI-01..08 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
