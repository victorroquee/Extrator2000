---
slug: imagens-bundles-flutuante-sumindo
status: resolved
trigger: "Imagens dos bundles e imagem promocional flutuante não aparecem na página clonada — devem ser preservadas exatamente como na página original enquanto a feature de edição não é implementada"
created: 2026-04-14
updated: 2026-04-14
---

## Symptoms

- expected: Imagens dos bundles (potes/produtos) e imagem promocional flutuante devem aparecer na página clonada exatamente iguais às da página original
- actual: Imagens dos bundles e imagem flutuante não aparecem na página clonada
- errors: Nenhum erro mencionado
- timeline: Branch main, detectado durante teste local após fix do delay
- reproduction: 1) Clonar VSL via localhost:3000; 2) Abrir HTML exportado; 3) Imagens de bundle e imagem flutuante não aparecem

## Test Assets

- URL de referência: https://zennaturequest.com/jellylean/cb/vsl2/?hopId=ff29796f-63b4-44a2-9e2c-d6a320e67e1c&affiliate=cashclann&tid=d835b3051f1a4d4aafc27484d76213f5&aff_sub1=MAHATECHNIQUE
- Branch: main
- Arquivos principais: server.js + public/index.html
- Contexto: A feature de edição de imagens de potes ainda não foi implementada; por enquanto as imagens devem ser preservadas da fonte original sem modificação

## Current Focus

hypothesis: RESOLVED
next_action: N/A

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  observation: "bundle: null em todos os checkout links — detectBundle() retorna null pois os <a class=buylink> não têm texto interno; dados estão em data-bottles/data-image"
  source: /api/fetch response
  significance: high

- timestamp: 2026-04-14T00:00:00Z
  observation: "bundleImages: {} — detectBundleImages() não encontra <img src> nos ancestrais pois as imagens são renderizadas por JS (products.js) a partir de data-image"
  source: /api/fetch response
  significance: high

- timestamp: 2026-04-14T00:00:00Z
  observation: "assetsPath = '../../' no HTML clonado — quando exportado como arquivo flat, esse caminho relativo quebra e products.js não consegue carregar as imagens"
  source: Inspeção do HTML clonado
  significance: critical

- timestamp: 2026-04-14T00:00:00Z
  observation: "products.js usa: <img src='${assetsPath}assets/main/products/img/${image}'> onde image vem de data-image='img-6-bottles.webp'"
  source: https://zennaturequest.com/jellylean/cb/vsl2/assets/main/products/js/products.js
  significance: critical

## Eliminated

- Server stripping img src attributes: não é o caso — as imagens nunca existem no HTML estático
- Problema no cleanHtml(): nenhum processamento de imagens ocorre ali
- BUNDLE-03: o código de substituição só age quando newSrc != originalSrc, não interfere

## Resolution

root_cause: "assetsPath = '../../' é definido em um inline script no HTML clonado. As imagens dos bundles são renderizadas por products.js em runtime usando esse path. Quando a página é exportada como arquivo flat (ZIP), o path relativo '../../' aponta para um diretório inexistente e todas as imagens geradas por products.js ficam quebradas."

fix: "Em buildExportHtml(), quando pageUrl é fornecido, reescrever const/var/let assetsPath = 'RELATIVE' para assetsPath = 'ABSOLUTE_URL' usando URL resolution. O caminho '../../' relativo a 'https://zennaturequest.com/jellylean/cb/vsl2/' resolve para 'https://zennaturequest.com/jellylean/'. Products.js então carrega as imagens diretamente do servidor original. Editado server.js: assinatura de buildExportHtml, lógica ASSETS-01, destructuring e chamadas nas rotas /api/export e /api/export-zip."

verification: "Testado via /api/export com payload real: assetsPath reescrito corretamente para 'https://zennaturequest.com/jellylean/', data-image attrs preservados, products.js mantido no HTML."

files_changed: server.js
