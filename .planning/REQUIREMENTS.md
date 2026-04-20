# Requirements: VSL Cloner

**Defined:** 2026-04-10
**Core Value:** Transformar qualquer página VSL em uma cópia 100% funcional com as credenciais do afiliado, em menos de 1 minuto.

## v1.4 Requirements — Export JSON Elementor

### Geração de JSON Elementor

- [ ] **ELEM-01**: Sistema gera JSON com estrutura válida para Elementor (version "0.4", type "page", content array, page_settings)
- [ ] **ELEM-02**: Cada elemento no JSON possui ID único hexadecimal de 8 caracteres
- [ ] **ELEM-03**: Cada seção distinta da página HTML vira um container separado no JSON (não um bloco único)
- [ ] **ELEM-04**: Conteúdo HTML de cada seção é encapsulado em widget tipo `html` dentro do container correspondente
- [ ] **ELEM-05**: JSON inclui todas as personalizações do afiliado já aplicadas (pixel, VTURB player, delay, checkout links, bundle images, scripts extras)

### Export Route

- [ ] **EXPRT-01**: POST /api/export-elementor aceita o mesmo payload dos outros exports e retorna arquivo .json
- [ ] **EXPRT-02**: Rota reutiliza `buildExportHtml()` para aplicar todas as injeções antes da conversão para JSON
- [ ] **EXPRT-03**: JSON é validado antes de retornar (IDs únicos, settings como objetos, estrutura de containers correta)

### UI Export Elementor

- [ ] **UIEXP-01**: Interface exibe botão "Exportar Elementor (.json)" junto aos outros botões de export
- [ ] **UIEXP-02**: Tooltip/info junto ao botão explica requisitos: Elementor 3.6+ com Containers habilitado, importar via Templates no backend do WordPress

## v1.1 Requirements — Editor Avançado (Shipped)

### Scripts Extras

- [ ] **SCRIPTS-01**: Usuário pode adicionar um ou mais scripts opcionais em uma aba dedicada do editor
- [ ] **SCRIPTS-02**: Usuário pode remover scripts individuais da lista
- [ ] **SCRIPTS-03**: Usuário pode reordenar scripts na lista (ordem de injeção)
- [ ] **SCRIPTS-04**: Scripts extras são injetados no `<head>` após headerPixel e headerPreload, na ordem definida pelo usuário

### Imagens de Bundle

- [ ] **BUNDLE-01**: Sistema detecta `<img>` de potes/produtos por proximidade a seções de bundle durante o fetch
- [ ] **BUNDLE-02**: Usuário vê thumbnail da imagem atual e campo editável com a URL no painel
- [ ] **BUNDLE-03**: Ao exportar, todas as ocorrências de cada imagem (seções duplicadas) são substituídas pela nova URL

### Delay VTURB

- [ ] **DELAY-01**: Sistema extrai `var delaySeconds = N` do bloco `displayHiddenElements` antes do cleanup do HTML
- [ ] **DELAY-02**: Usuário vê o valor atual em segundos e pode editá-lo no painel
- [ ] **DELAY-03**: Ao exportar, o bloco de script original é preservado e apenas o valor numérico é substituído

### Export (fix)

- [ ] **EXPORT-06**: Exportar a mesma página múltiplas vezes não duplica pixel, preload ou scripts extras injetados

## v1 Requirements (Shipped)

### Fetch & Parsing

- [x] **FETCH-01**: POST /api/fetch aceita { url } e retorna HTML parseado
- [x] **FETCH-02**: Requisição usa headers anti-bot (User-Agent Chrome, Accept, Accept-Language, Cache-Control)
- [x] **FETCH-03**: Segue redirecionamentos (maxRedirects: 10)
- [x] **FETCH-04**: HTML é parseado com cheerio para manipulação

### Cleanup Automático

- [x] **CLEAN-01**: Remove `<script>` com src/conteúdo contendo: vturb, smartplayer, fbq, facebook.net, gtag, googletagmanager, hotjar, clarity.ms, tiktok, kwai, taboola, pixel, adroll, snap.licdn
- [x] **CLEAN-02**: Remove `<script>` com atributos data-vturb ou data-player-id
- [x] **CLEAN-03**: Remove `<noscript>` contendo facebook, google, pixel ou `<img>` de domínios de tracking
- [x] **CLEAN-04**: Remove `<link rel="preload/prefetch">` para .mp4, .m3u8 ou domínios vturb
- [x] **CLEAN-05**: Remove `<iframe>` de: smartplayer.vturb.com.br, cdn.vturb.com, player.vturb.com, youtube.com/embed, player.vimeo.com
- [x] **CLEAN-06**: Remove `<div>` com class/id contendo "smartplayer", "vturb-player", "vsl-player", "video-container" quando wrapping iframe
- [x] **CLEAN-07**: Preserva jQuery, Bootstrap, Slick, Swiper, FontAwesome, Google Fonts e scripts sem keyword de remoção
- [x] **CLEAN-08**: Injeta `<!-- [VSL_PLACEHOLDER] -->` + div visual laranja na posição do player removido

### Detecção de Checkout

- [x] **CHECK-01**: Detecta `<a>` e `<button>` com href/onclick contendo padrões de checkout (ClickBank, Hotmart, Kiwify, Eduzz, Monetizze, /checkout, /buy, /order, /purchase)
- [x] **CHECK-02**: Classifica links em bundles por contexto (texto próximo: "2 pote", "3 pote", "6 pote", "popular", "best value")
- [x] **CHECK-03**: Armazena: href original, selector CSS, texto âncora
- [x] **CHECK-04**: Suporta os 5 padrões reais: VTURB embed, ClickBank hop link, Meta Pixel, VTURB preload, Hotmart pay link

### UI Frontend

- [x] **UI-01**: Input de URL + botão "Extrair Página" com loading spinner
- [x] **UI-02**: Card de resumo pós-fetch (scripts removidos, VSL detectado, links encontrados)
- [x] **UI-03**: Dois textareas de header: "Pixel & Scripts de Rastreamento" e "Script VTURB / Preload"
- [x] **UI-04**: Textarea full-width para embed do player VTURB
- [x] **UI-05**: Inputs de checkout pré-preenchidos com URL original, editáveis pelo afiliado
- [x] **UI-06**: Se 0 links detectados: exibir 3 inputs vazios (Bundle 2, 3 e 6 Potes)
- [x] **UI-07**: Botão CTA "⬇️ Gerar Página Afiliado" que dispara download
- [x] **UI-08**: Dark theme, Portuguese (BR), responsivo mobile

### Export

- [x] **EXPORT-01**: POST /api/export aceita { html, headerPixel, headerPreload, vslembed, checkoutLinks }
- [x] **EXPORT-02**: Injeta headerPixel + headerPreload antes de `</head>`
- [x] **EXPORT-03**: Substitui placeholder div pelo vslembed na posição exata
- [x] **EXPORT-04**: Substitui href de cada checkout link pelo link do afiliado
- [x] **EXPORT-05**: Retorna HTML completo como download "pagina-afiliado.html"

## v2 Requirements

### Editor de Cores

- **COLOR-01**: Extrair CSS custom properties (--primary-color, --accent, background-color)
- **COLOR-02**: Expor seletores de cor editáveis com color picker no frontend

### Bundle Images (deferred from v1.1)

- **BUNDLE-IMG-01**: Suporte a imagens JS-rendered via atributo `data-image` (sem `<img>` estático no HTML)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Autenticação de usuários | App single-user local, sem necessidade |
| Deploy multi-user | Fora do escopo, complexidade desnecessária |
| Headless browser (Puppeteer) | Axios + cheerio suficiente para os padrões alvo |
| Banco de dados | Sem persistência necessária |
| data-image JS-rendered images | Requer runtime JS; fora do escopo v1.1 |
| Full HTML-to-Elementor widget decomposition | Complexidade desproporcional; html widget é suficiente e validado |
| WordPress media library integration | Afiliado usa URLs externas; image id: 0 funciona corretamente |
| Third-party Elementor plugins (Essential Addons) | Não se pode garantir que o afiliado terá os plugins instalados |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DELAY-01 | Phase 4 | Pending |
| DELAY-02 | Phase 4 | Pending |
| DELAY-03 | Phase 4 | Pending |
| EXPORT-06 | Phase 4 | Pending |
| BUNDLE-01 | Phase 5 | Pending |
| BUNDLE-02 | Phase 5 | Pending |
| BUNDLE-03 | Phase 5 | Pending |
| SCRIPTS-01 | Phase 6 | Pending |
| SCRIPTS-02 | Phase 6 | Pending |
| SCRIPTS-03 | Phase 6 | Pending |
| SCRIPTS-04 | Phase 6 | Pending |

**Coverage v1.1:**
- v1.1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

### v1.4 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ELEM-01 | TBD | Pending |
| ELEM-02 | TBD | Pending |
| ELEM-03 | TBD | Pending |
| ELEM-04 | TBD | Pending |
| ELEM-05 | TBD | Pending |
| EXPRT-01 | TBD | Pending |
| EXPRT-02 | TBD | Pending |
| EXPRT-03 | TBD | Pending |
| UIEXP-01 | TBD | Pending |
| UIEXP-02 | TBD | Pending |

**Coverage v1.4:**
- v1.4 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10 ⚠️

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-20 — v1.4 requirements added*
