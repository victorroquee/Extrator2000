# Phase 6: Extra Scripts Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 06-extra-scripts-tab
**Areas discussed:** UI Layout, UX Add/Edit, Reorder, Posição da seção

---

## UI Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Section card (como C.5/C.6) | Card empilhado verticalmente, padrão já estabelecido, zero JS extra | ✓ |
| Tab real dentro do header | Abas clicáveis dentro do card de header (Pixel \| Scripts Extras) | |
| Card colapsável dedicado | Header clicável que expande/colapsa (accordion) | |

**User's choice:** Section card — mesmo padrão de C.5 e C.6.
**Notes:** "Aba dedicada" no requirement interpretado como seção dedicada, não tab real.

---

## UX Add/Edit

| Option | Description | Selected |
|--------|-------------|----------|
| Botão '+ Adicionar' cria textarea | Cada clique cria novo item com textarea expansível | ✓ |
| Textarea único + botão Adicionar | Um textarea fixo de rascunho + botão que move para lista compacta | |

**User's choice:** Lista dinâmica — cada script tem sua própria textarea.
**Notes:** Seção revelada sempre após o fetch (showSection incondicionalmente).

---

## Reorder

| Option | Description | Selected |
|--------|-------------|----------|
| Botões ↑ ↓ por item | Simples, vanilla JS puro, sem libs externas | ✓ |
| Drag-and-drop | Mais intuitivo mas complexo sem bibliotecas | |

**User's choice:** Botões ↑ ↓ por item.
**Notes:** Consistente com o constraint de vanilla JS sem libs.

---

## Posição da seção no layout

| Option | Description | Selected |
|--------|-------------|----------|
| Após Pixel & Scripts (C.1/C.2) | Logo depois dos textareas de header, antes do player embed | ✓ |
| Antes de Links de Checkout (final do C) | Depois de delay e bundle images, agrupando os "opcionais" | |

**User's choice:** Após Pixel & Scripts — lógico por scripts extras também irem no head.
**Notes:** Ordem final: Pixel/Preload → Scripts Extras → Embed Player → Delay → Bundle Images → Checkout.

---

## Claude's Discretion

- Label exato da seção (card-title)
- Placeholder text das textareas
- Comportamento dos botões ↑/↓ nas bordas da lista
- Shape de `state.extraScripts` (string[] vs objetos)

## Deferred Ideas

- Drag-and-drop para reorder — v2 se necessário
- Validação de sintaxe JS inline — fora do escopo
- Persistência entre sessões — sem banco de dados no projeto
