---
slug: validacao-falsos-positivos-ui
status: resolved
trigger: "Validação pré-download com falsos positivos (Preload, VTURB e VSL aparecem como OK mesmo sem estar configurados) + popup precisa ser mais dinâmico com verificações aparecendo uma a uma animadas e maior presença visual na tela"
created: 2026-04-14
updated: 2026-04-14
---

## Symptoms

- expected: Preload/VTURB/VSL devem aparecer como ✗ vermelho quando não configurados pelo usuário; popup deve ter animação de verificação item por item com maior presença visual
- actual: (1) Preload, VTURB e VSL aparecem como ✓ verde mesmo sem estar configurados — falsos positivos; (2) popup aparece de forma estática sem animação e com pouca presença visual
- errors: Nenhum erro no console mencionado
- timeline: Feature recém implementada — nunca funcionou corretamente
- reproduction: Abrir http://localhost:3000, preencher apenas URL sem configurar VTURB/pixel/delay, clicar exportar, popup mostra todos os itens como OK

## Context

- Arquivo principal: public/index.html (modal de validação) + server.js (/api/export-validate endpoint)
- O endpoint /api/export-validate foi adicionado em server.js na sessão anterior
- O modal CSS/JS foi adicionado em public/index.html
- Branch: main, servidor rodando na porta 3000

## Current Focus

hypothesis: "As regexes/seletores cheerio no /api/export-validate podem estar muito permissivas — detectando scripts da página ORIGINAL (que não foram removidos durante a limpeza) como se fossem os scripts configurados pelo usuário (VTURB/preload/etc)"
next_action: "Ler o endpoint /api/export-validate em server.js e verificar exatamente quais padrões cada check usa; depois clonar a URL de teste sem configurar nada e verificar o HTML gerado para entender o que está sendo detectado"

## Evidence

## Eliminated

## Resolution
root_cause: "The /api/export-validate checks used regex/cheerio patterns that matched scripts from the ORIGINAL cloned page (converteai, smartplayer, preload tags, fbq) rather than only verifying what the USER actually configured. This caused false positives whenever the original page had those elements — regardless of user configuration."
fix: "Rewrote all 5 validation checks to be payload-first: each check first verifies the user supplied the relevant config field (headerPixel, headerPreload, vslembed, delaySeconds, checkoutLinks), then confirms the injected marker is present in the generated HTML. For VTURB: check vslembed non-empty AND VSL placeholder is replaced. For pixel: headerPixel non-empty AND fbq/facebook.net in output. For preload: headerPreload non-empty AND link[rel=preload] in output. For delay: delaySeconds set AND our injected esconder script is in output. For checkout: checkoutLinks non-empty AND href matches checkout pattern. Also rewrote the validation modal UI with sequential staggered animations (250ms between items), checking-spinner state, scale+fade icon reveal, summary line with pass count, and prominent download/fix buttons."
verification: "Tested via curl: (1) Original page with converteai/fbq/preload but empty user config — all 5 checks return false (no false positives). (2) Full user config with matching page — all 5 return true. Server syntax validated with node --check."
files_changed: "server.js (validation checks block ~line 901-953), public/index.html (CSS ~line 540-640, showValidationModal JS, modal HTML header)"

