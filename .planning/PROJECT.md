# VSL Cloner

## What This Is

Aplicação web Node.js + Express para afiliados de marketing digital. Permite clonar páginas de VSL (Video Sales Letter), remover automaticamente rastreadores e players de vídeo originais, e injetar pixel, player VTURB e links de checkout do afiliado — gerando um arquivo HTML pronto para deploy.

## Core Value

Transformar qualquer página VSL em uma cópia 100% funcional com as credenciais do afiliado, em menos de 1 minuto.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Buscar qualquer URL de página VSL via axios com headers anti-bot
- [ ] Remover automaticamente scripts de rastreamento (Facebook Pixel, GTM, Hotjar, etc.)
- [ ] Remover player VSL original (VTURB, YouTube embed, Vimeo) e marcar posição com placeholder
- [ ] Detectar e classificar links de checkout (ClickBank, Hotmart, Kiwify, Eduzz, Monetizze)
- [ ] UI em português (BR) com dark theme, single HTML file
- [ ] Injetar pixel/scripts de header customizados do afiliado
- [ ] Injetar embed do player VTURB na posição exata do player original
- [ ] Substituir links de checkout pelos links do afiliado
- [ ] Exportar HTML final como arquivo downloadável

### Out of Scope

- Editor de imagens de produto (bottles/potes) — v2
- Editor de cores CSS — v2
- Autenticação/login de usuários — app single-user local
- Deploy em produção com múltiplos usuários — fora do escopo v1

## Context

- Público: afiliados de marketing digital brasileiros, especialmente produtos físicos (suplementos)
- Padrões comuns: páginas ClickBank com bundles de 2/3/6 potes, players VTURB, Meta Pixel
- App roda localmente na máquina do afiliado (port 3000)
- Interface em português (BR), dark theme
- O spec completo define todos os padrões de detecção e remoção

## Constraints

- **Tech Stack**: Node.js + Express + axios + cheerio — sem frameworks adicionais
- **Frontend**: Single HTML file com vanilla JS — sem bundler
- **Estrutura**: server.js + public/index.html + package.json apenas
- **Runtime**: Node.js local, porta 3000

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single HTML file para frontend | Simplicidade máxima, sem build step | — Pending |
| Cheerio para parsing HTML | Leve, API jQuery-like, sem headless browser | — Pending |
| Selector path para checkout links | Permite substituição precisa no export | — Pending |

## Evolution

Este documento evolui a cada transição de fase e milestone.

**Após cada fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope
2. Requirements validados? → Mover para Validated
3. Novos requirements? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value ainda correto?
3. Out of Scope ainda válido?

---
*Last updated: 2026-04-10 after initialization*
