---
title: Adicionar validacao de output antes de entregar ao afiliado
date: 2026-04-22
priority: high
---

Implementar checagens automaticas no output gerado antes de disponibilizar para download:

- CSS presente e valido (nao vazio, sem referencias quebradas)
- Imagens com URLs que resolvem (HEAD request ou checagem de padroes)
- JSON do Elementor valido (parse sem erro, estrutura esperada presente)

Se alguma checagem falhar, avisar o afiliado com mensagem clara sobre o que pode estar errado — nao bloquear, mas alertar.

**Contexto:** Hoje nao ha validacao pos-clone. O afiliado so descobre que quebrou quando sobe a pagina e ve o resultado.
