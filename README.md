# VSL Cloner

Ferramenta local para afiliados de marketing digital. Clona qualquer página VSL, remove os scripts de rastreamento e o player de vídeo original, e permite injetar seu próprio pixel, player VTURB e links de checkout — gerando um arquivo HTML pronto para publicar.

Roda 100% local na sua máquina, na porta 3000. Nenhum dado é enviado a servidores externos.

## Requisitos

- Node.js 18 ou superior

## Instalação

```bash
npm install
```

## Iniciar

```bash
node server.js
```

Acesse: **http://localhost:3000**

## Como usar

1. Cole a URL da página VSL no campo e clique **Extrair Página**
2. Aguarde o resumo aparecer: scripts removidos, VSL detectado, links de checkout encontrados
3. No campo **Pixel & Scripts de Rastreamento**, cole seu Meta Pixel, GTM ou TikTok Pixel
4. No campo **Script VTURB / Preload**, cole o script de preload do seu player (se necessário)
5. No campo **Embed do Player VTURB**, cole o código de embed completo do seu player
6. Nos inputs de **Checkout**, substitua cada URL pelo seu link de afiliado correspondente
7. Clique **⬇️ Gerar Página Afiliado** — o arquivo `pagina-afiliado.html` será baixado automaticamente

## Plataformas suportadas

- **Checkout:** ClickBank, Hotmart, Kiwify, Eduzz, Monetizze
- **Player:** VTURB / Smartplayer
- **Pixel:** Meta (Facebook) Pixel, Google Tag Manager, TikTok Pixel

## Notas técnicas

- O HTML da página original nunca é salvo em disco — fica apenas em memória durante a sessão
- A ferramenta roda inteiramente local; nenhum dado é enviado a servidores externos
- Testado com Node.js 18 e 20
