# Phase 8: Folder Upload — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Source:** User decisions via conversation

<domain>
## Phase Boundary

Esta fase adiciona uma segunda forma de entrada de conteúdo na interface: além de buscar por URL, o usuário pode enviar uma pasta local com projeto HTML já pronto (index.html + assets). O processamento pós-upload é idêntico ao fluxo de URL — mesmo pipeline de limpeza, detecção de checkout, bundle images e delay.

</domain>

<decisions>
## Implementation Decisions

### UI — Toggle de Entrada
- Interface exibe **duas abas** no topo do bloco de input: "URL" e "Pasta de Arquivos"
- Aba ativa troca o campo exibido sem recarregar a página
- Aba URL: comportamento existente (input de texto + botão "Extrair Página")
- Aba Pasta: área de seleção de pasta (botão ou drag-and-drop simples)

### Upload de Arquivos
- Usuário seleciona uma pasta local; **todos os arquivos** (HTML, CSS, JS, imagens) são enviados via `multipart/form-data` para `/api/upload-folder`
- O servidor identifica o arquivo `index.html` na raiz da pasta como entrada principal
- Se não houver `index.html` na raiz, retornar erro claro ao usuário
- Limite de tamanho: razoável para projetos HTML locais (ex: 50MB total)

### Processamento no Servidor
- `/api/upload-folder` recebe os arquivos, lê o `index.html`, e aplica o **mesmo pipeline** que `/api/fetch`: `cleanHtml` → `detectCheckoutLinks` → `detectBundleImages` → `detectVturbDelay`
- Retorna o mesmo formato de resposta JSON que `/api/fetch` (`html`, `summary`, `checkoutLinks`, `bundleImages`, `delayInfo`)
- Os assets (CSS, JS, imagens) são armazenados temporariamente no servidor para uso no export-zip

### Export ZIP
- O export ZIP inclui o `index.html` processado + **todos os assets originais da pasta**, com estrutura de diretórios preservada
- Comportamento idêntico ao export-zip atual, mas substituindo os assets obtidos por URL pelos assets enviados pelo usuário

### Fluxo Pós-Upload
- Após processar, o estado da aplicação é idêntico ao pós-fetch por URL
- Todas as seções do editor (checkout, delay, bundle images, extra scripts) funcionam normalmente
- Botão muda de "Extrair Página" para "Processar Pasta" na aba de pasta

### Claude's Discretion
- Estratégia de armazenamento temporário dos assets no servidor (memória vs disco temp vs multer)
- Limpeza dos arquivos temporários após export ou timeout
- Validação de tipos de arquivo aceitos no upload
- Feedback de progresso durante upload (loading state)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Pipeline (must replicate, not duplicate)
- `server.js` — `/api/fetch` handler (lines ~430–490): pipeline de referência a ser replicado no upload
- `server.js` — `cleanHtml`, `detectCheckoutLinks`, `detectBundleImages`, `detectVturbDelay` helpers
- `server.js` — `/api/export-zip` handler: modelo para o export ZIP com assets
- `public/index.html` — seção de input URL atual (para decidir onde inserir as abas)

### Roadmap
- `.planning/ROADMAP.md` — Phase 8 success criteria

</canonical_refs>

<specifics>
## Specific Decisions from User

1. **Assets no export**: ZIP com todos os arquivos (estrutura preservada) — não inline/base64
2. **UI**: Duas abas "URL" | "Pasta de Arquivos" no topo do bloco de input
3. **Pipeline**: Mesmo processamento do fetch por URL — sem desvios
4. **Dependência com Phase 9**: O fluxo de verificação (Phase 9) se aplica tanto a uploads quanto a URLs — Phase 8 não precisa incluir a tela de verificação

</specifics>

<deferred>
## Deferred Ideas

- Drag-and-drop visual avançado (arrastar pasta para a página) — Phase 8 usa selector nativo do OS
- Preview dos assets antes de processar — fora do escopo desta fase
- Tela de verificação do export — Phase 9

</deferred>

---

*Phase: 08-folder-upload*
*Context gathered: 2026-04-14 via conversation*
