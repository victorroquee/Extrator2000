---
slug: delay-not-working-vturb
status: resolved
trigger: "Delay personalizado não funciona na branch main — configurei 10 segundos mas após VTURB rodar por 10s o elemento .esconder não é revelado"
created: 2026-04-14
updated: 2026-04-14
---

## Symptoms

- expected: Após VTURB rodar pelo tempo configurado (ex: 10s), elementos com classe .esconder devem ser revelados
- actual: Após 10 segundos de VTURB rodando, nada acontece — elementos permanecem ocultos
- errors: Nenhum erro mencionado
- timeline: Ocorre na branch main ao adicionar VSL com delay ativo
- reproduction: 1) Clonar VSL com delay habilitado e 10s configurado; 2) Abrir página clonada; 3) VTURB começa a rodar; 4) Aguardar 10s; 5) Elementos .esconder não aparecem

## Test Assets

- URL para clonar: https://zennaturequest.com/jellylean/cb/vsl2/?hopId=ff29796f-63b4-44a2-9e2c-d6a320e67e1c&affiliate=cashclann&tid=d835b3051f1a4d4aafc27484d76213f5&aff_sub1=MAHATECHNIQUE
- VTURB embed de teste:
  <vturb-smartplayer id="vid-69de3cc8759336f867167828" style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"></vturb-smartplayer>
  <script type="text/javascript"> var s=document.createElement("script"); s.src="https://scripts.converteai.net/34fb1fe7-3bb6-47cb-bc23-7a91803090b2/players/69de3cc8759336f867167828/v4/player.js", s.async=!0,document.head.appendChild(s); </script>
- Branch: main (acabou de fazer checkout)
- Arquivo principal: public/index.html + server.js

## Current Focus

hypothesis: RESOLVED
next_action: N/A

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  observation: "buildExportHtml em server.js (linhas 814-840) usa if/else if: para delayType='attribute' apenas faz replace de data-vdelay, para delayType='js' re-injeta delayScriptContent — mas ambos dependem do VTURB player para funcionar. O player é removido durante clonagem, então nenhuma das abordagens revela .esconder."
  file: server.js:814-840

- timestamp: 2026-04-14T00:00:01Z
  observation: "A fix standalone (commits c05d25e e 128dbd8) existe na branch extrator-interno mas NÃO foi portada para main. Essa fix injeta setTimeout puro que revela .esconder sem depender do VTURB player."
  file: server.js

- timestamp: 2026-04-14T00:00:02Z
  observation: "public/index.html linha 1652: condição 'if (state.hasDelay && delayInput)' impede envio do delay ao export se hasDelay=false. Se o usuário digita delay manualmente sem detecção automática, o delay nunca é enviado ao servidor."
  file: public/index.html:1652

## Eliminated

- Event-based VTURB hook: não é o mecanismo — o script usa displayHiddenElements que pertence ao player removido
- Timing/comparação: a lógica de tempo estava correta na branch extrator-interno, o problema é ausência da fix em main

## Resolution

root_cause: "Dois bugs: (1) server.js buildExportHtml não injeta script standalone para revelar .esconder — dependia do VTURB player (removido) para chamar displayHiddenElements ou ler data-vdelay; (2) public/index.html linha 1652 guard 'state.hasDelay &&' impedia envio do delay ao export quando não auto-detectado. A fix standalone existia na branch extrator-interno (commits c05d25e, 128dbd8) mas não foi portada para main."

fix: "server.js: substituído DELAY-03 block para sempre injetar <script>(function(){setTimeout revela .esconder após delay*1000ms})()</script> antes de </body>, além de atualizar data-vdelay. public/index.html: removida condição state.hasDelay do guard de envio do delay — agora envia sempre que delayInput tem valor >= 1."

verification: "Exportado HTML de teste com delay=10s via POST /api/export — output contém '<script>(function(){var delay = 10; setTimeout(...)})();</script>' antes de </body> e data-vdelay='10'. Arquivo salvo em /tmp/test-delay-clone.html. Node syntax check passa sem erros."

files_changed:
  - server.js (linhas 814-842 — DELAY-03 block reescrito)
  - public/index.html (linha 1652 — removido state.hasDelay do guard)
