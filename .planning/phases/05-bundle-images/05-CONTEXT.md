# Phase 5: Bundle Images - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Detectar imagens de produto (potes) por seção de bundle durante o fetch, exibir thumbnail + campo de URL editável no editor, e substituir todas as ocorrências dessas imagens no HTML exportado.

Fora do escopo desta fase: imagens JS-rendered (data-image, carregadas via runtime JS), editor de CSS, qualquer outra seção de imagem que não seja bundle de produto.

</domain>

<decisions>
## Implementation Decisions

### Detecção de imagens no backend (BUNDLE-01)

- **D-01:** Para cada checkout link já detectado que possui `bundle` classificado (2, 3 ou 6), subir o DOM via cheerio até o ancestor container (section/div) e pegar a **primeira `<img>`** encontrada dentro dele.
- **D-02:** O resultado é um mapa bundle → { src, selector } — uma imagem representativa por bundle.
- **D-03:** Somente imagens com `src` estático (atributo HTML) — imagens JS-rendered (data-image, lazy-load sem src) são explicitamente fora do escopo (v2).
- **D-04:** Se nenhum checkout link com bundle for encontrado, ou se o ancestor não tiver `<img>`, o mapa retorna vazio — sem erro.
- **D-05:** Detecção ocorre durante o `/api/fetch`, após `cleanHtml()` (as imagens de produto não são removidas pelo cleanup, apenas scripts/pixels).

### Quantidade de imagens por bundle

- **D-06:** Exibir **somente a primeira imagem** por bundle no editor (thumbnail + URL editável).
- **D-07:** No export, substituir **todas as ocorrências** daquele `src` original no HTML (BUNDLE-03) — não apenas a que foi detectada.

### Layout da seção no editor (BUNDLE-02)

- **D-08:** Nova seção card com padrão existente: `<section class="card section-hidden" id="section-bundle-images">`.
- **D-09:** Layout empilhado por bundle — cada linha: thumbnail 60×60px + label ("2 Potes", "3 Potes", "6 Potes") + input de URL editável pré-preenchido com o src atual.
- **D-10:** A seção é revelada com `showSection()` no callback do fetch somente quando ao menos uma imagem for detectada.
- **D-11:** Quando nenhuma imagem é detectada, a seção fica oculta (sem mensagem de empty state visível — comportamento igual ao `section-delay` quando hasDelay=false).

### Substituição no export (BUNDLE-03)

- **D-12:** Usar cheerio no `buildExportHtml()` para substituir `src` e `srcset` em todos os `<img>` e `<source>` cujo `src` (ou qualquer entrada do `srcset`) contenha o URL original da imagem detectada.
- **D-13:** Substituição é global — todas as ocorrências do mesmo src no DOM (incluindo seções duplicadas desktop/mobile) são trocadas.
- **D-14:** Idempotência garantida pelo sentinel `data-vsl-injected` já existente — o bundle image replacement ocorre dentro de `buildExportHtml()` junto com as outras substituições.

### Claude's Discretion

- Estratégia exata de subida no DOM (quantos níveis subir, qual ancestor usar — section, article, div genérico)
- Tratamento de srcset (parser simples de URLs vs regex)
- Fallback para imagens cujo ancestor não tenha `<img>` mas tenha `background-image` CSS (ignorar na v1)

</decisions>

<specifics>
## Specific Ideas

- Layout visual da seção de imagens igual ao mockup discutido:
  ```
  [ Imagens de Bundle ]
  [img] 2 Potes  [ https://cdn.exemplo.com/2pote.png ]
  [img] 3 Potes  [ https://cdn.exemplo.com/3pote.png ]
  [img] 6 Potes  [ https://cdn.exemplo.com/6pote.png ]
  ```
- A seção só aparece quando o fetch detectar pelo menos 1 imagem de bundle — mesma lógica do section-delay.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos da fase

- `.planning/REQUIREMENTS.md` §BUNDLE-01, BUNDLE-02, BUNDLE-03 — Acceptance criteria completos para detecção, exibição e substituição de imagens de bundle.

### Código existente relevante

- `server.js` — `detectCheckoutLinks()` (linha ~210): lógica de detecção de checkout e classificação de bundle. Nova função `detectBundleImages()` deve se integrar com o mesmo pipeline do `/api/fetch`.
- `server.js` — `buildExportHtml()` (linha ~482): ponto de injeção das substituições. Bundle image replacement vai aqui junto com checkout, delay, etc.
- `public/index.html` — `section-delay` (linha ~383): padrão de seção card com show/hide, state wiring, e integração com fetch/export handlers. Usar como template para a nova seção de bundle images.

### Constraints do projeto

- `CLAUDE.md` — Tech stack: Node.js + Express + cheerio. Sem frameworks adicionais. Single HTML file, vanilla JS.

No external specs beyond the above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `BUNDLE_KEYWORDS` (server.js): mapa de keywords por bundle qty (2/3/6) — já usado na detecção de checkout, reusável para validar context na detecção de imagens.
- `buildCssSelector()` (server.js): helper para gerar seletor CSS de elemento — pode ser útil mas provavelmente não necessário para imagens (src é o identificador).
- Padrão `section-hidden` + `showSection()` (index.html): padrão de show/hide de seção pós-fetch, pronto para replicar.

### Established Patterns

- Backend extrai dados ANTES ou DURANTE o fetch (detectVturbDelay antes do cleanHtml, detectCheckoutLinks depois). Bundle images deve ser APÓS cleanHtml (imagens não são removidas pelo cleanup).
- Estado do editor armazenado em objeto `state` (vanilla JS): `state.bundleImages = {}` para o novo dado.
- Payload do export enviado via POST body — adicionar `bundleImages` ao payload existente.

### Integration Points

- `/api/fetch` response: adicionar `bundleImages: { 2: { src, selector }, 3: {...}, 6: {...} }` ao campo `summary`.
- `buildExportHtml()`: adicionar parâmetro `bundleImages` e lógica de substituição via cheerio.
- Frontend fetch handler: ler `data.summary.bundleImages`, atualizar state, popular seção de imagens, revelar seção se não vazia.
- Frontend export handler: incluir `bundleImages` no payload somente quando state tiver imagens.

</code_context>

<deferred>
## Deferred Ideas

- Imagens JS-rendered (data-image, lazy-load) — explicitamente v2 (REQUIREMENTS.md §v2 / Out of Scope).
- background-image CSS replacement — não coberto pela fase, pode ser backlog.
- Preview ampliado ao clicar no thumbnail — nice-to-have, fora do escopo.

</deferred>

---

*Phase: 05-bundle-images*
*Context gathered: 2026-04-13*
