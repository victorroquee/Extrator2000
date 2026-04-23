---
title: Criar suite de testes unitarios para pontos criticos
date: 2026-04-22
priority: high
---

Criar testes automatizados cobrindo os 3 pontos de falha identificados:

1. **Extracao de CSS** — garantir que estilos inline e externos sao preservados no clone
2. **Resolucao de URLs de imagens** — verificar que imagens com caminhos relativos/absolutos resolvem corretamente
3. **Geracao de JSON para Elementor** — validar que o JSON exportado e valido e importa sem erros no Elementor

**Contexto:** 200+ afiliados vao usar a ferramenta. Bugs silenciosos (clone sai quebrado sem aviso) sao o maior risco antes do lancamento.
