# Phase 6: Extra Scripts Tab - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar uma seção dedicada no editor onde o usuário pode gerenciar uma lista de scripts extras. Cada script é injetado no `<head>` do HTML exportado, após `headerPixel` e `headerPreload`, na ordem definida pelo usuário.

Fora do escopo: editor de CSS, validação de sintaxe JS, persistência entre sessões, qualquer outra seção de scripts que não seja a lista de extras.

</domain>

<decisions>
## Implementation Decisions

### UI Layout (SCRIPTS-01)

- **D-01:** A seção de Scripts Extras é um **section card** (padrão `section-hidden` + `showSection()`), idêntico ao padrão estabelecido nas phases 4 e 5 (C.5 delay, C.6 bundle images).
- **D-02:** Não é um tab real (sem troca de painel). É mais um card empilhado verticalmente na página.
- **D-03:** A seção é revelada **sempre após o fetch** (`showSection()` chamada incondicionalmente no callback do fetch), mesmo que o usuário não tenha scripts — a lista estará vazia mas visível.

### Posição no layout (SCRIPTS-01)

- **D-04:** A seção aparece **após os dois textareas de header** (`section-header`, que contém Pixel & Scripts de Rastreamento e Script VTURB/Preload) e **antes** do Embed Player VTURB. Ordem final:
  ```
  [ Pixel & Scripts de Rastreamento ] C
  [ Script VTURB / Preload          ] C
  [ Scripts Extras           ] ← nova C.3
  [ Embed Player VTURB              ]
  [ Delay VTURB                     ] C.5
  [ Imagens de Bundle               ] C.6
  [ Links de Checkout               ] D
  ```
- **D-05:** Justificativa: scripts extras também vão no `<head>`, é natural agrupá-los perto dos outros scripts de header.

### UX de Add/Remove (SCRIPTS-01, SCRIPTS-02)

- **D-06:** Cada clique em **"+ Adicionar Script"** cria um novo item na lista com uma **textarea expansível** onde o usuário cola o bloco de script.
- **D-07:** Cada item tem um botão **[x]** para remoção individual — remove aquele item da lista (SCRIPTS-02).
- **D-08:** Lista cresce dinamicamente no DOM (mesma abordagem do `checkout-inputs-container`).
- **D-09:** Estado da lista armazenado em `state.extraScripts` — array de strings, na ordem atual da lista.

### Reorder (SCRIPTS-03)

- **D-10:** Reordenação via **botões ↑ ↓ por item** — sem drag-and-drop.
- **D-11:** Botão ↑ do primeiro item e ↓ do último item ficam desabilitados (ou ignorados silenciosamente).
- **D-12:** Ao clicar ↑ ou ↓, o item troca de posição com o vizinho tanto no DOM quanto em `state.extraScripts`.

### Injeção no export (SCRIPTS-04)

- **D-13:** Scripts extras são injetados no `<head>` **após** `headerPixel` e `headerPreload`, na ordem de `state.extraScripts`.
- **D-14:** Auto-wrap: se o conteúdo da textarea **não** começar com `<script` (case-insensitive), o sistema envolve automaticamente em `<script>...</script>` na injeção. Se já vier com a tag, usa como está.
- **D-15:** Idempotência: coberta pelo guard `data-vsl-injected` já existente em `buildExportHtml()` — scripts extras são injetados dentro do mesmo bloco que headerPixel/headerPreload, então o sentinel os protege de duplicação (EXPORT-06 já implementado na Phase 4).
- **D-16:** O frontend envia `extraScripts: string[]` no payload do `/api/export`. O backend recebe e injeta em ordem.

### Claude's Discretion

- Label exato da seção (card-title, ex: "C.3 — Scripts Extras" ou "Scripts Extras")
- Placeholder text das textareas de script
- Comportamento exato de disable dos botões ↑/↓ nas bordas da lista
- Se `state.extraScripts` deve ser array de strings ou objetos `{ id, content }` — Claude decide conforme facilidade de reorder

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase

- `.planning/REQUIREMENTS.md` §SCRIPTS-01, SCRIPTS-02, SCRIPTS-03, SCRIPTS-04 — Acceptance criteria completos para add, remove, reorder e injeção no head.

### Código existente relevante

- `server.js` — `buildExportHtml()` (linha ~536): ponto de injeção. `extraScripts` deve ser injetado após `headerPixel` e `headerPreload`, dentro do mesmo bloco guardado pelo `data-vsl-injected` sentinel.
- `server.js` — exportação via `/api/export` (linha ~622): adicionar `extraScripts` ao destructuring do body.
- `public/index.html` — `section-delay` (linha ~413) e `section-bundle-images` (linha ~431): padrão de section card com show/hide. Usar como template para a nova seção.
- `public/index.html` — `checkout-inputs-container` (linha ~444): padrão de lista dinâmica no DOM. Referência para como `scripts-list-container` deve ser estruturado.
- `public/index.html` — fetch handler (linha ~757): onde `showSection()` é chamada. Scripts extras deve ser revelado aqui, sempre (sem condicional).
- `public/index.html` — export handler (linha ~804): onde o payload é montado. Adicionar `extraScripts: state.extraScripts` aqui.

### Constraints do projeto

- `CLAUDE.md` — Tech stack: Node.js + Express + cheerio. Sem frameworks adicionais. Single HTML file, vanilla JS, sem bundler.

No external specs beyond the above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Padrão `section-hidden` + `showSection()`: pronto para replicar — zero JS novo para o show/hide.
- `checkout-inputs-container`: referência de lista dinâmica (add/remove DOM items via JS) — mesmo padrão para `scripts-list-container`.
- `buildExportHtml()`: já aceita parâmetros nomeados via destructuring — adicionar `extraScripts` é uma adição cirúrgica.

### Established Patterns

- Estado do editor em objeto `state` (vanilla JS): adicionar `state.extraScripts = []`.
- Payload do export via POST body: adicionar `extraScripts` ao objeto enviado.
- `showSection()` chamada no fetch callback: adicionar `showSection(sectionExtraScripts)` incondicionalmente.

### Integration Points

- `buildExportHtml({ ..., extraScripts })`: injetar após headerPreload com auto-wrap lógico.
- Frontend fetch handler: revelar `section-extra-scripts` sempre após fetch.
- Frontend export handler: incluir `extraScripts` no payload.

</code_context>

<specifics>
## Specific Ideas

- Layout visual de cada item:
  ```
  Script 1:                    [↑][↓][x]
  ┌───────────────────────────────────┐
  │ <script>...</script>              │
  └───────────────────────────────────┘

  [ + Adicionar Script ]
  ```
- A seção fica entre `section-header` (C — pixel/preload) e o embed do player VTURB.
- Seção aparece sempre após fetch (sem condição de "só se tiver scripts detectados").

</specifics>

<deferred>
## Deferred Ideas

- Drag-and-drop para reorder — mais rico, mas complexidade desnecessária para v1.1.
- Validação de sintaxe JS inline — editor de script is out of scope.
- Persistência de scripts entre sessões — sem banco de dados no projeto.

</deferred>

---

*Phase: 06-extra-scripts-tab*
*Context gathered: 2026-04-13*
