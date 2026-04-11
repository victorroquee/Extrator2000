'use strict';

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const archiver = require('archiver');

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
  /pay\.clickbank\.net/i,
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
  // Collect first, then remove — avoids cheerio iteration issues during DOM mutation
  const scriptsToRemove = [];
  $('script').each((_, el) => {
    const src = $(el).attr('src') || '';
    const content = $(el).html() || $(el).text() || '';
    const dataVturb = $(el).attr('data-vturb');
    const dataPlayerId = $(el).attr('data-player-id');

    const shouldRemove =
      dataVturb !== undefined ||
      dataPlayerId !== undefined ||
      SCRIPT_REMOVE_KEYWORDS.some(
        (kw) => src.toLowerCase().includes(kw) || content.toLowerCase().includes(kw)
      );

    if (shouldRemove) {
      scriptsToRemove.push({ el, src, content });
    }
  });
  for (const { el, src, content } of scriptsToRemove) {
    $(el).remove();
    scriptsRemoved++;
    if (src.includes('vturb') || content.includes('vturb') || $(el).attr('data-vturb') !== undefined) {
      vslDetected = true;
    }
  }

  // CLEAN-03: Remove <noscript> containing tracking pixels
  // Collect first, then remove — same pattern for safe DOM mutation
  const noscriptsToRemove = [];
  $('noscript').each((_, el) => {
    const outerHtml = $.html(el) || '';
    if (
      /facebook|google|pixel/i.test(outerHtml) ||
      /facebook\.com\/tr|connect\.facebook/i.test(outerHtml) ||
      /<img[^>]+src="https?:\/\//i.test(outerHtml)
    ) {
      noscriptsToRemove.push(el);
    }
  });
  for (const el of noscriptsToRemove) {
    $(el).remove();
  }

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

// ── Helper: VTURB delay detection ────────────────────────────────────────────

/**
 * Extracts the VTURB delay block from rawHtml BEFORE cleanHtml() removes it.
 * The block is identified by co-presence of delaySeconds declaration AND
 * displayHiddenElements in the same <script> tag. Returns null if not found.
 * DELAY-01
 */
function detectVturbDelay(rawHtml) {
  // { decodeEntities: false } required — matches cleanHtml() convention (PITFALLS.md Pitfall 7)
  const $ = cheerio.load(rawHtml, { decodeEntities: false });
  let result = null;

  $('script').each((_, el) => {
    if (result) return; // first match only
    // Prefer .html() over .text() for script content (PITFALLS.md Pitfall 12)
    const content = $(el).html() || $(el).text() || '';
    // Dual-condition anchor: both keywords must appear in the same block (PITFALLS.md Pitfall 2)
    const delayMatch = content.match(/(?:var|let|const)\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/);
    if (delayMatch && /displayHiddenElements/.test(content)) {
      result = {
        delaySeconds: parseFloat(delayMatch[1]),
        delayScriptContent: content, // full original body — preserved verbatim
      };
    }
  });

  return result; // null when not present
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
    // Block IPv6 literals (bracket-enclosed addresses)
    if (hostname.startsWith('[')) {
      return res.status(400).json({ error: 'IPv6 addresses are not allowed' });
    }
    // Block pure-numeric hostnames (decimal/octal encoded IPs like 2130706433 or 0177.0.0.1)
    if (/^[\d.]+$/.test(hostname)) {
      return res.status(400).json({ error: 'Numeric IP addresses are not allowed' });
    }
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

  // DELAY-01: detect delay block BEFORE cleanHtml() removes the VTURB scripts
  const delayInfo = detectVturbDelay(rawHtml);

  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);

  return res.json({
    html: cleanedHtml,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
    },
  });
});

// ── Helpers: ZIP export ──────────────────────────────────────────────────────

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveUrl(url, base) {
  try { return new URL(url, base).href; } catch { return null; }
}

function assetLocalPath(absUrl, usedPaths) {
  try {
    const u = new URL(absUrl);
    const ext = path.extname(u.pathname).toLowerCase();
    const raw = path.basename(u.pathname) || 'asset';
    const filename = raw || `asset${ext || '.bin'}`;

    let folder = 'assets';
    if (ext === '.css') folder = 'assets/css';
    else if (ext === '.js') folder = 'assets/js';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif'].includes(ext)) folder = 'assets/img';
    else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) folder = 'assets/fonts';

    let candidate = `${folder}/${filename}`;
    let counter = 2;
    while (usedPaths.has(candidate)) {
      const base2 = path.basename(filename, ext);
      candidate = `${folder}/${base2}_${counter}${ext}`;
      counter++;
    }
    usedPaths.add(candidate);
    return candidate;
  } catch {
    return `assets/asset_${Date.now()}`;
  }
}

function collectAssets($, pageUrl, usedPaths) {
  const assets = new Map(); // absUrl → localPath
  function add(url) {
    if (!url || url.startsWith('data:') || url.startsWith('#')) return;
    const abs = resolveUrl(url, pageUrl);
    if (!abs || assets.has(abs)) return;
    assets.set(abs, assetLocalPath(abs, usedPaths));
  }
  $('link[href]').each((_, el) => {
    const rel = ($(el).attr('rel') || '').toLowerCase();
    if (['stylesheet', 'icon', 'shortcut icon'].includes(rel)) add($(el).attr('href'));
  });
  $('script[src]').each((_, el) => add($(el).attr('src')));
  $('img[src]').each((_, el) => add($(el).attr('src')));
  $('source[src]').each((_, el) => add($(el).attr('src')));
  return assets;
}

// ── Helpers: Checkout replacement ────────────────────────────────────────────

/**
 * Apply affiliate checkout links to HTML.
 * - Links with a selector: replace via CSS selector (selector-based).
 * - Links without a selector: bulk-replace all checkout-pattern URLs in the page.
 */
function applyCheckoutLinks(outputHtml, checkoutLinks) {
  if (!Array.isArray(checkoutLinks) || checkoutLinks.length === 0) return outputHtml;

  // Selector-based replacement
  const withSelector = checkoutLinks.filter((l) => l.selector && (l.affiliateHref || l.affiliateUrl));
  if (withSelector.length > 0) {
    const $2 = cheerio.load(outputHtml, { decodeEntities: false });
    for (const link of withSelector) {
      const affiliateHref = link.affiliateHref || link.affiliateUrl;
      try {
        $2(link.selector).each((_, el) => {
          if ($2(el).attr('href') !== undefined) $2(el).attr('href', affiliateHref);
          if ($2(el).attr('onclick') !== undefined) {
            const oldOnclick = $2(el).attr('onclick') || '';
            const checkoutUrlMatch = oldOnclick.match(/https?:\/\/[^\s'"]+/);
            if (checkoutUrlMatch) {
              $2(el).attr('onclick', oldOnclick.replace(checkoutUrlMatch[0], affiliateHref));
            }
          }
        });
      } catch (_) {
        console.warn(`[export] invalid selector skipped: ${link.selector}`);
      }
    }
    outputHtml = $2.html();
  }

  // No-selector bulk replacement: replace any checkout-pattern URL in href/onclick
  const noSelector = checkoutLinks.filter((l) => !l.selector && (l.affiliateHref || l.affiliateUrl));
  if (noSelector.length > 0) {
    const $3 = cheerio.load(outputHtml, { decodeEntities: false });
    $3('a, button').each((_, el) => {
      const href = $3(el).attr('href') || '';
      const onclick = $3(el).attr('onclick') || '';
      const isCheckout = CHECKOUT_URL_PATTERNS.some((p) => p.test(href) || p.test(onclick));
      if (!isCheckout) return;
      // Use the first non-empty affiliate link from the list
      const affiliateHref = noSelector[0].affiliateHref || noSelector[0].affiliateUrl;
      if (href) $3(el).attr('href', affiliateHref);
      if (onclick) {
        const checkoutUrlMatch = onclick.match(/https?:\/\/[^\s'"]+/);
        if (checkoutUrlMatch) {
          $3(el).attr('onclick', onclick.replace(checkoutUrlMatch[0], affiliateHref));
        }
      }
    });
    outputHtml = $3.html();
  }

  return outputHtml;
}

// ── Shared: build modified HTML from export payload ──────────────────────────

/**
 * Builds the affiliate HTML from the canonical clean HTML + affiliate fields.
 * EXPORT-06: Idempotency guard — if data-vsl-injected is already present on
 * <head>, returns html unchanged. This protects against future refactors that
 * might accidentally send already-exported HTML as the payload.
 * The frontend MUST always send state.fetchedHtml (canonical clean HTML, set
 * once at fetch time, never overwritten). — PITFALLS.md Pitfall 1
 */
function buildExportHtml({ html, headerPixel, headerPreload, vslembed, checkoutLinks,
                           delaySeconds, delayScriptContent }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // EXPORT-06: Defensive idempotency guard — skip all injections if already done
  if ($('head').attr('data-vsl-injected')) {
    return html; // already exported — return unchanged
  }
  // Mark as injected (will be present in the downloaded HTML; harmless annotation)
  $('head').attr('data-vsl-injected', '1');

  if (headerPixel && headerPixel.trim()) $('head').append(headerPixel);
  if (headerPreload && headerPreload.trim()) $('head').append(headerPreload);

  let outputHtml = $.html();

  if (vslembed && vslembed.trim()) {
    outputHtml = outputHtml.replace(
      /<!--\s*\[VSL_PLACEHOLDER\]\s*-->[\s\S]*?<div id="vsl(?:-cloner)?-placeholder"[\s\S]*?<\/div>/,
      vslembed
    );
  }

  outputHtml = applyCheckoutLinks(outputHtml, checkoutLinks);

  // DELAY-03: Inject rebuilt delay block near </body> using String ops (not cheerio)
  // String ops required — cheerio serialize would mangle </script> inside string literals
  // (PITFALLS.md Pitfall 7)
  if (delayScriptContent && delaySeconds !== undefined && delaySeconds !== null) {
    // PITFALLS.md Pitfall 10: clamp to non-negative integer, minimum 1
    const safeDelay = Math.max(1, Math.round(Number(delaySeconds) || 1));
    const rebuilt = delayScriptContent.replace(
      /(?:var|let|const)\s+delaySeconds\s*=\s*\d+(?:\.\d+)?/,
      `var delaySeconds = ${safeDelay}`
    );
    const delayTag = `<script>\n${rebuilt}\n<\/script>`;
    if (outputHtml.includes('</body>')) {
      // PITFALLS.md Pitfall 5: fallback for missing </body>
      outputHtml = outputHtml.replace('</body>', `${delayTag}\n</body>`);
    } else {
      outputHtml += delayTag; // malformed HTML fallback
    }
  }

  return outputHtml;
}

// ── Route: POST /api/export ──────────────────────────────────────────────────

app.post('/api/export', (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks,
          delaySeconds, delayScriptContent } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                       checkoutLinks, delaySeconds, delayScriptContent });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.html"');
  return res.send(outputHtml);
});

// ── Route: POST /api/export-zip ──────────────────────────────────────────────

app.post('/api/export-zip', async (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks, pageUrl,
          delaySeconds, delayScriptContent } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  let outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                     checkoutLinks, delaySeconds, delayScriptContent });

  // Collect and download assets if we have the original page URL
  const usedPaths = new Set();
  const downloaded = new Map(); // absUrl → { buffer, localPath }

  if (pageUrl) {
    const $$ = cheerio.load(outputHtml, { decodeEntities: false });
    const assets = collectAssets($$, pageUrl, usedPaths); // absUrl → localPath

    // Download in batches of 5
    const entries = [...assets.entries()];
    for (let i = 0; i < entries.length; i += 5) {
      await Promise.all(
        entries.slice(i, i + 5).map(async ([absUrl, localPath]) => {
          try {
            const resp = await axios.get(absUrl, {
              responseType: 'arraybuffer',
              timeout: 15000,
              maxContentLength: 10 * 1024 * 1024,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            });
            downloaded.set(absUrl, { buffer: Buffer.from(resp.data), localPath });
          } catch {
            // Skip assets that fail to download
          }
        })
      );
    }

    // Rewrite URLs in HTML using cheerio (attribute-level, not string replacement)
    const $$2 = cheerio.load(outputHtml, { decodeEntities: false });

    function rewriteAttr(el, attr) {
      const val = $$2(el).attr(attr);
      if (!val) return;
      const abs = resolveUrl(val, pageUrl);
      if (abs && downloaded.has(abs)) $$2(el).attr(attr, downloaded.get(abs).localPath);
    }

    $$2('link[href]').each((_, el) => rewriteAttr(el, 'href'));
    $$2('script[src]').each((_, el) => rewriteAttr(el, 'src'));
    $$2('img[src]').each((_, el) => rewriteAttr(el, 'src'));
    $$2('source[src]').each((_, el) => rewriteAttr(el, 'src'));

    outputHtml = $$2.html();
  }

  // Stream ZIP to client
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[export-zip] archive error:', err);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  archive.append(outputHtml, { name: 'index.html' });
  for (const [, { buffer, localPath }] of downloaded) {
    archive.append(buffer, { name: localPath });
  }

  await archive.finalize();
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── Start ────────────────────────────────────────────────────────────────────

// Only listen when run directly — not when required by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`VSL Cloner running at http://localhost:${PORT}`);
  });
}

module.exports = app;

// Named exports for integration testing
module.exports.cleanHtml = cleanHtml;
module.exports.detectCheckoutLinks = detectCheckoutLinks;
module.exports.detectVturbDelay = detectVturbDelay;
module.exports.buildExportHtml = buildExportHtml;
