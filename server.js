'use strict';

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Constants: cleanup patterns ──────────────────────────────────────────────

/**
 * Script src/content keywords that indicate a tracking or player script
 * to be removed (CLEAN-01)
 */
const SCRIPT_REMOVE_KEYWORDS = [
  'vturb',
  'smartplayer',
  'fbq',
  'facebook.net',
  'gtag',
  'googletagmanager',
  'hotjar',
  'clarity.ms',
  'tiktok',
  'kwai',
  'taboola',
  'pixel',
  'adroll',
  'snap.licdn',
];

/**
 * Iframes src patterns to remove (CLEAN-05)
 */
const IFRAME_REMOVE_PATTERNS = [
  'smartplayer.vturb.com.br',
  'cdn.vturb.com',
  'player.vturb.com',
  'youtube.com/embed',
  'player.vimeo.com',
];

/**
 * Checkout link URL patterns (CHECK-01)
 */
const CHECKOUT_URL_PATTERNS = [
  /hop\.clickbank\.net/i,
  /pay\.hotmart\.com/i,
  /go\.hotmart\.com/i,
  /kiwify\.com\.br/i,
  /eduzz\.com/i,
  /monetizze\.com\.br/i,
  /\/checkout/i,
  /\/buy/i,
  /\/order/i,
  /\/purchase/i,
];

/**
 * Bundle context keywords (CHECK-02)
 */
const BUNDLE_KEYWORDS = {
  2: ['2 pote', '2pote', 'dois pote', '2 frasco', 'starter', 'basico', 'básico', 'básica', 'basic'],
  3: ['3 pote', '3pote', 'três pote', 'tres pote', '3 frasco', 'popular', 'mais popular', 'most popular'],
  6: ['6 pote', '6pote', 'seis pote', '6 frasco', 'best value', 'melhor valor', 'maior desconto', 'premium'],
};

// ── Helpers: Checkout platform classification ────────────────────────────────

function classifyPlatform(url) {
  if (!url) return 'unknown';
  if (/hop\.clickbank\.net/i.test(url)) return 'ClickBank';
  if (/pay\.hotmart\.com|go\.hotmart\.com/i.test(url)) return 'Hotmart';
  if (/kiwify\.com\.br/i.test(url)) return 'Kiwify';
  if (/eduzz\.com/i.test(url)) return 'Eduzz';
  if (/monetizze\.com\.br/i.test(url)) return 'Monetizze';
  return 'generic';
}

function detectBundle(text) {
  const lower = (text || '').toLowerCase();
  for (const [qty, keywords] of Object.entries(BUNDLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return Number(qty);
    }
  }
  return null;
}

function buildCssSelector($, el) {
  const tag = el.name;
  const id = $(el).attr('id');
  if (id) return `${tag}#${id}`;
  const cls = $(el).attr('class');
  if (cls) {
    const first = cls.trim().split(/\s+/)[0];
    return `${tag}.${first}`;
  }
  return tag;
}

// ── Helpers: HTML cleanup ────────────────────────────────────────────────────

function cleanHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  let scriptsRemoved = 0;
  let vslDetected = false;
  let playerPosition = null; // store info about placeholder injection

  // CLEAN-01 & CLEAN-02: Remove tracking/player <script> tags
  $('script').each((_, el) => {
    const src = $(el).attr('src') || '';
    const content = $(el).html() || '';
    const dataVturb = $(el).attr('data-vturb');
    const dataPlayerId = $(el).attr('data-player-id');

    const shouldRemove =
      dataVturb !== undefined ||
      dataPlayerId !== undefined ||
      SCRIPT_REMOVE_KEYWORDS.some(
        (kw) => src.toLowerCase().includes(kw) || content.toLowerCase().includes(kw)
      );

    if (shouldRemove) {
      $(el).remove();
      scriptsRemoved++;
      if (src.includes('vturb') || content.includes('vturb') || dataVturb !== undefined) {
        vslDetected = true;
      }
    }
  });

  // CLEAN-03: Remove <noscript> containing tracking pixels
  $('noscript').each((_, el) => {
    const content = $(el).html() || '';
    if (
      /facebook|google|pixel/i.test(content) ||
      /<img[^>]+src="https?:\/\/(?!.*(?:your-site|localhost))/i.test(content)
    ) {
      $(el).remove();
    }
  });

  // CLEAN-04: Remove <link rel="preload/prefetch"> for video or vturb domains
  $('link[rel="preload"], link[rel="prefetch"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\.(mp4|m3u8)/i.test(href) || /vturb/i.test(href)) {
      $(el).remove();
    }
  });

  // CLEAN-05 & CLEAN-06: Remove VSL iframes and their wrapper divs
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || '';
    const isVslIframe = IFRAME_REMOVE_PATTERNS.some((p) => src.includes(p));
    if (isVslIframe) {
      vslDetected = true;
      const parent = $(el).parent();
      const parentClass = (parent.attr('class') || '').toLowerCase();
      const parentId = (parent.attr('id') || '').toLowerCase();
      const isWrapper =
        /smartplayer|vturb-player|vsl-player|video-container/.test(parentClass) ||
        /smartplayer|vturb-player|vsl-player|video-container/.test(parentId);

      const placeholder = `<!-- [VSL_PLACEHOLDER] -->\n<div id="vsl-placeholder" style="background:#f97316;color:#fff;padding:40px;text-align:center;font-size:1.2rem;border-radius:8px;">Player VSL será inserido aqui</div>`;

      if (isWrapper && parent[0].name !== 'body') {
        playerPosition = 'wrapper-replaced';
        parent.replaceWith(placeholder);
      } else {
        playerPosition = 'iframe-replaced';
        $(el).replaceWith(placeholder);
      }
      scriptsRemoved++;
    }
  });

  // If no iframe was detected but we found vturb scripts, inject placeholder at body start
  if (vslDetected && !playerPosition) {
    const placeholder = `<!-- [VSL_PLACEHOLDER] -->\n<div id="vsl-placeholder" style="background:#f97316;color:#fff;padding:40px;text-align:center;font-size:1.2rem;border-radius:8px;">Player VSL será inserido aqui</div>`;
    $('body').prepend(placeholder);
    playerPosition = 'body-prepended';
  }

  return { html: $.html(), scriptsRemoved, vslDetected };
}

// ── Helpers: Checkout detection ──────────────────────────────────────────────

function detectCheckoutLinks($, html) {
  const links = [];

  $('a, button').each((_, el) => {
    const href = $(el).attr('href') || '';
    const onclick = $(el).attr('onclick') || '';
    const url = href || onclick;

    const isCheckout = CHECKOUT_URL_PATTERNS.some((pattern) => pattern.test(url));
    if (!isCheckout) return;

    // Build surrounding text context for bundle detection
    const anchorText = $(el).text().trim();
    const parentText = $(el).closest('section, div, p, td, li').first().text().trim();
    const contextText = `${anchorText} ${parentText}`;
    const bundle = detectBundle(contextText);

    links.push({
      href: href || null,
      selector: buildCssSelector($, el),
      anchorText,
      platform: classifyPlatform(href),
      bundle,
    });
  });

  return links;
}

// ── Route: POST /api/fetch ───────────────────────────────────────────────────

app.post('/api/fetch', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Campo "url" é obrigatório.' });
  }

  // T-01-03 mitigation: reject non-http(s) schemes and private IP ranges
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are allowed' });
    }
    // Block private / loopback addresses
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.endsWith('.local')
    ) {
      return res.status(400).json({ error: 'Private/loopback URLs are not allowed' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  let rawHtml;
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // T-01-04: limit response size to 10 MB
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    rawHtml = response.data;
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.message;
    return res.status(502).json({ error: `Erro ao buscar URL: ${msg}` });
  }

  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);

  return res.json({
    html: cleanedHtml,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
    },
  });
});

// ── Route: POST /api/export ──────────────────────────────────────────────────

app.post('/api/export', (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  // EXPORT-02: Inject headerPixel + headerPreload before </head>
  if (headerPixel && headerPixel.trim()) {
    $('head').append(headerPixel);
  }
  if (headerPreload && headerPreload.trim()) {
    $('head').append(headerPreload);
  }

  // EXPORT-03: Replace <!-- [VSL_PLACEHOLDER] --> block with vslembed.
  // Operate on the serialised HTML string because cheerio cannot select comments.
  let outputHtml = $.html();

  if (vslembed && vslembed.trim()) {
    // Matches comment + the placeholder div (both id="vsl-placeholder" and id="vsl-cloner-placeholder")
    outputHtml = outputHtml.replace(
      /<!--\s*\[VSL_PLACEHOLDER\]\s*-->[\s\S]*?<div id="vsl(?:-cloner)?-placeholder"[\s\S]*?<\/div>/,
      vslembed
    );
  }

  // EXPORT-04: Replace checkout link hrefs.
  // Re-parse outputHtml (post-embed replacement) for selector-based substitution.
  if (Array.isArray(checkoutLinks) && checkoutLinks.length > 0) {
    const $2 = cheerio.load(outputHtml, { decodeEntities: false });
    for (const link of checkoutLinks) {
      // Support both affiliateHref (plan schema) and affiliateUrl (legacy)
      const affiliateHref = link.affiliateHref || link.affiliateUrl;
      if (!link.selector || !affiliateHref) continue;
      try {
        $2(link.selector).each((_, el) => {
          if ($2(el).attr('href') !== undefined) {
            $2(el).attr('href', affiliateHref);
          }
          if ($2(el).attr('onclick') !== undefined) {
            // Replace URL inside onclick string
            const onclick = $2(el).attr('onclick') || '';
            const updatedOnclick = onclick.replace(
              /https?:\/\/[^\s'"]+/g,
              affiliateHref
            );
            $2(el).attr('onclick', updatedOnclick);
          }
        });
      } catch (_) {
        // T-02-03 mitigation: Invalid selector — skip silently
        console.warn(`[export] invalid selector skipped: ${link.selector}`);
      }
    }
    outputHtml = $2.html();
  }

  // EXPORT-05: Return as downloadable HTML file
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.html"');
  return res.send(outputHtml);
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`VSL Cloner running at http://localhost:${PORT}`);
});

module.exports = app;
