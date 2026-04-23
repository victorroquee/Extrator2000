---
title: Observabilidade e logs para producao
trigger_condition: Quando hospedar 24h para os afiliados
planted_date: 2026-04-22
---

Adicionar logging estruturado para diagnosticar problemas em producao sem depender de reclamacao dos afiliados:

- Logs de cada clone gerado (URL fonte, opcoes selecionadas, resultado)
- Erros capturados com contexto suficiente para reproduzir
- Metricas basicas (clones/dia, taxa de erro, tempo de processamento)

**Por que seed e nao todo:** Hoje o Victor testa sozinho. Logging se torna critico quando 200+ afiliados estiverem usando simultaneamente e nao da pra diagnosticar na mao.
