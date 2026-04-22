# Phase 12: Core JSON Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 12-core-json-builder
**Areas discussed:** Splitting de seções, Head scripts, Nome do arquivo

---

## Splitting de seções

| Option | Description | Selected |
|--------|-------------|----------|
| Body direct children | Cada filho direto do `<body>` vira um container. Simples, previsível | ✓ |
| Bloco único | Todo o HTML do `<body>` em um único container. Máxima fidelidade | |
| Heurística inteligente | Detectar sections, divs principais. Mais granular mas frágil | |

**User's choice:** Body direct children (Recommended)
**Notes:** Abordagem mais equilibrada entre fidelidade e editabilidade no Elementor

---

## Head scripts

| Option | Description | Selected |
|--------|-------------|----------|
| Container dedicado no topo | Primeiro container com html widget contendo head scripts | ✓ |
| Dentro do HTML de cada seção | Scripts embutidos no `<head>` do HTML completo em cada widget | |
| Você decide | Claude escolhe | |

**User's choice:** Container dedicado no topo (Recommended)
**Notes:** Scripts visíveis e editáveis dentro do Elementor editor

---

## Nome do arquivo

| Option | Description | Selected |
|--------|-------------|----------|
| elementor-page.json (fixo) | Simples e previsível | |
| Baseado no título da página | Ex: 'elementor-burnslim.json' extraído do `<title>` | ✓ |

**User's choice:** Baseado no título da página
**Notes:** Mais descritivo, facilita organização quando afiliado trabalha com múltiplas páginas

---

## Claude's Discretion

- Edge cases de text nodes/comments como filhos do body
- Inclusão de meta tags no head container
- Error handling para HTML malformado

## Deferred Ideas

None
