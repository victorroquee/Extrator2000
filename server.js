'use strict';

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const crypto = require('crypto');

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
  /\/checkout(?:[/?#]|$)/i,
  /\/buy(?:[/?#]|$)/i,
  /\/order(?:[/?#]|$)/i,
  /\/purchase(?:[/?#]|$)/i,
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

function buildCssSelector($, el, usedSelectors = new Set()) {
  const tag = el.name;
  const id = $(el).attr('id');
  if (id) return `${tag}#${id}`;

  const cls = $(el).attr('class');
  let selector = tag;
  if (cls) {
    const first = cls.trim().split(/\s+/)[0];
    selector = `${tag}.${first}`;
  }

  // If selector is not unique, add :nth-of-type() to make it unique
  if (usedSelectors.has(selector)) {
    // Find index among siblings of same type
    const siblings = $(el).parent().children(tag);
    const index = siblings.index(el) + 1;
    selector = `${selector}:nth-of-type(${index})`;
  }

  usedSelectors.add(selector);
  return selector;
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

  // CLEAN-07: Remove <vturb-smartplayer> custom element and replace with placeholder
  // This handles the common embedding pattern where the element is NOT inside an iframe
  if (!playerPosition) {
    const vturbEl = $('vturb-smartplayer').first();
    if (vturbEl.length) {
      vslDetected = true;
      const placeholder = `<!-- [VSL_PLACEHOLDER] -->\n<div id="vsl-placeholder" style="background:#f97316;color:#fff;padding:40px;text-align:center;font-size:1.2rem;border-radius:8px;">Player VSL será inserido aqui</div>`;
      const parent = vturbEl.parent();
      const parentClass = (parent.attr('class') || '').toLowerCase();
      const parentId = (parent.attr('id') || '').toLowerCase();
      const isWrapper =
        /smartplayer|vturb-player|vsl-player|video-container/.test(parentClass) ||
        /smartplayer|vturb-player|vsl-player|video-container/.test(parentId);
      if (isWrapper && parent[0] && parent[0].name !== 'body') {
        parent.replaceWith(placeholder);
        playerPosition = 'vturb-element-wrapper-replaced';
      } else {
        vturbEl.replaceWith(placeholder);
        playerPosition = 'vturb-element-replaced';
      }
      scriptsRemoved++;
    }
  }

  // If no iframe or vturb-smartplayer was detected but we found vturb scripts, inject placeholder at body start
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
  const usedSelectors = new Set();

  $('a, button').each((_, el) => {
    const href = $(el).attr('href') || '';
    const onclick = $(el).attr('onclick') || '';
    const url = href || onclick;

    const isCheckout = CHECKOUT_URL_PATTERNS.some((pattern) => pattern.test(url));
    if (!isCheckout) return;

    // Build narrow context for bundle detection - use only immediate parent to avoid cross-bundle contamination
    const anchorText = $(el).text().trim();
    const immediateParent = $(el).parent();
    const parentText = immediateParent.text().trim();
    const contextText = `${anchorText} ${parentText}`;
    const bundle = detectBundle(contextText);

    links.push({
      href: href || null,
      selector: buildCssSelector($, el, usedSelectors),
      anchorText,
      platform: classifyPlatform(href),
      bundle,
    });
  });

  return links;
}

// ── Helpers: Bundle image detection ─────────────────────────────────────────

/**
 * Detects the first representative product image for each bundle qty (2, 3, 6).
 * For each checkout link that has a classified bundle qty, walks up the DOM to
 * the nearest section/article/div ancestor and picks the first <img> with a
 * non-empty, non-data: static src inside that ancestor. (D-01, D-03, D-06)
 *
 * Returns an object keyed by bundle qty: { 2: { src }, 3: { src }, 6: { src } }
 * Returns {} if no bundle checkout links exist or no ancestor has an <img>. (D-04)
 */
function detectBundleImages($, checkoutLinks) {
  const result = {};

  const bundleLinks = (checkoutLinks || []).filter((l) => l.bundle !== null && l.bundle !== undefined);

  for (const link of bundleLinks) {
    const bundle = link.bundle;

    // Per D-06: first match per bundle qty wins — skip if already found
    if (result[bundle]) continue;

    let el;
    try {
      el = $(link.selector);
    } catch (_) {
      continue;
    }
    if (!el || el.length === 0) continue;

    // Walk up to nearest container ancestor (D-01)
    const ancestor = el.closest('section, article, div');
    if (!ancestor || ancestor.length === 0) continue;

    // Find the first <img> with a valid static src inside that ancestor
    let found = null;
    ancestor.find('img[src]').each((_, imgEl) => {
      if (found) return; // first only
      const src = $(imgEl).attr('src');
      // D-03: skip empty, missing, or data: URIs
      if (!src || src.startsWith('data:') || src.trim() === '') return;
      found = src;
    });

    if (found) {
      result[bundle] = { src: found };
    }
  }

  return result;
}

// ── Helper: VTURB delay detection ────────────────────────────────────────────

/**
 * Extracts the VTURB delay value from rawHtml BEFORE cleanHtml() removes scripts.
 *
 * Handles four patterns (checked in priority order):
 *   1. data-vdelay attr: <div data-vdelay="N"> wrapping vturb-smartplayer
 *   2. Same script: var delaySeconds = N  +  displayHiddenElements in same <script>
 *   3. Split scripts: delaySeconds in one tag, displayHiddenElements anywhere
 *   4. Inline number: displayHiddenElements(N, ...) with no separate variable
 *
 * Returns { delaySeconds, delayScriptContent, delayType } or null.
 * delayType: 'attribute' | 'js'
 * DELAY-01
 */
function detectVturbDelay(rawHtml) {
  const $ = cheerio.load(rawHtml, { decodeEntities: false });

  // Pattern 1: data-vdelay attribute on any ancestor of vturb-smartplayer
  const playerEl = $('vturb-smartplayer').first();
  if (playerEl.length) {
    // Walk up ancestors looking for data-vdelay
    let found = null;
    playerEl.parents().addBack().each((_, el) => {
      const val = $(el).attr('data-vdelay');
      if (val !== undefined && /^\d+$/.test(val.trim())) {
        found = parseInt(val.trim(), 10);
      }
    });
    // Also check the direct parent and siblings that might carry the attribute
    if (found === null) {
      $('[data-vdelay]').each((_, el) => {
        const val = $(el).attr('data-vdelay');
        if (val !== undefined && /^\d+$/.test(val.trim())) {
          found = parseInt(val.trim(), 10);
        }
      });
    }
    if (found !== null) {
      return { delaySeconds: found, delayScriptContent: null, delayType: 'attribute' };
    }
  }

  // Collect all inline script contents for JS-based patterns
  const scripts = [];
  $('script').each((_, el) => {
    const content = $(el).html() || $(el).text() || '';
    if (content.trim()) scripts.push(content);
  });

  // Pattern 2: same-script — delaySeconds declaration + displayHiddenElements
  for (const content of scripts) {
    const delayMatch = content.match(/(?:var|let|const)\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/);
    if (delayMatch && /displayHiddenElements/.test(content)) {
      return { delaySeconds: parseFloat(delayMatch[1]), delayScriptContent: content, delayType: 'js' };
    }
  }

  // Pattern 3: split scripts — delaySeconds in one tag, displayHiddenElements anywhere
  const pageHasDisplayHidden = scripts.some((c) => /displayHiddenElements/.test(c));
  if (pageHasDisplayHidden) {
    for (const content of scripts) {
      const delayMatch = content.match(/(?:var|let|const)\s+delaySeconds\s*=\s*(\d+(?:\.\d+)?)/);
      if (delayMatch) {
        return { delaySeconds: parseFloat(delayMatch[1]), delayScriptContent: content, delayType: 'js' };
      }
    }
  }

  // Pattern 4: inline number — displayHiddenElements(N, ...)
  for (const content of scripts) {
    const inlineMatch = content.match(/displayHiddenElements\s*\(\s*(\d+(?:\.\d+)?)\s*,/);
    if (inlineMatch) {
      return { delaySeconds: parseFloat(inlineMatch[1]), delayScriptContent: content, delayType: 'js' };
    }
  }

  return null;
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
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
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
  const bundleImages = detectBundleImages($, checkoutLinks);

  return res.json({
    html: cleanedHtml,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      bundleImages,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
      delayType: delayInfo ? delayInfo.delayType : null,
    },
  });
});

// ── Upload: multer config + session store ────────────────────────────────────

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.svg', '.xml', '.png', '.jpg', '.jpeg', '.gif',
  '.webp', '.avif', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.otf', '.map',
]);

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos
const uploadSessions = new Map(); // sessionId -> { assets: Map<relativePath, Buffer>, expiresAt }

// Limpeza periodica de sessoes expiradas
setInterval(function() {
  const now = Date.now();
  for (const [id, session] of uploadSessions) {
    if (session.expiresAt < now) uploadSessions.delete(id);
  }
}, 5 * 60 * 1000);

const folderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 200 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_UPLOAD_EXTENSIONS.has(ext));
  },
});

function stripTopFolder(relativePath) {
  const parts = relativePath.split('/');
  return parts.slice(1).join('/');
}

function isSafeRelativePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..')) return false;
  if (relativePath.includes('\0')) return false;
  return true;
}

// ── Route: POST /api/upload-folder ──────────────────────────────────────────

app.post('/api/upload-folder', folderUpload.array('files', 200), function(req, res) {
  const files = req.files || [];
  // multer + express parses 'paths[]' field name as req.body.paths (brackets stripped)
  const rawPaths = req.body.paths || req.body['paths[]'] || [];
  const paths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];

  if (!files.length) {
    return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
  }

  const assets = new Map();
  let indexHtmlBuffer = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rawPath = paths[i] || file.originalname;
    const relative = stripTopFolder(rawPath);
    if (!isSafeRelativePath(relative)) continue;
    assets.set(relative, file.buffer);
    if (relative === 'index.html' || relative === 'index.htm') {
      indexHtmlBuffer = file.buffer;
    }
  }

  if (!indexHtmlBuffer) {
    return res.status(400).json({
      error: 'index.html nao encontrado na raiz da pasta. Selecione a pasta que contem diretamente o index.html.',
    });
  }

  const rawHtml = indexHtmlBuffer.toString('utf8');
  const delayInfo = detectVturbDelay(rawHtml);
  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);
  const bundleImages = detectBundleImages($, checkoutLinks);

  const sessionId = crypto.randomUUID();
  uploadSessions.set(sessionId, {
    assets,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return res.json({
    html: cleanedHtml,
    uploadSessionId: sessionId,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      bundleImages,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
      delayType: delayInfo ? delayInfo.delayType : null,
    },
  });
});

// Multer error handler (4-argument signature para Express tratar como error middleware)
app.use(function(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande. Limite: 10MB por arquivo.' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Muitos arquivos. Limite: 200 arquivos por pasta.' });
  }
  next(err);
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
    // Only the first no-selector link is used; multiple no-selector entries are not supported
    // because there is no originalHref in the payload to match against.
    // Users with multiple distinct checkout links should use CSS selectors.
    if (noSelector.length > 1) {
      console.warn(`[export] ${noSelector.length} no-selector checkout links provided; only the first will be applied. Use selectors to target multiple distinct checkout buttons.`);
    }
    const $3 = cheerio.load(outputHtml, { decodeEntities: false });
    $3('a, button').each((_, el) => {
      const href = $3(el).attr('href') || '';
      const onclick = $3(el).attr('onclick') || '';
      const isCheckout = CHECKOUT_URL_PATTERNS.some((p) => p.test(href) || p.test(onclick));
      if (!isCheckout) return;
      // Only the first no-selector entry is supported (see warning above)
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
                           delaySeconds, delayScriptContent, delayType, bundleImages,
                           extraScripts = [] }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // EXPORT-06: Defensive idempotency guard — skip all injections if already done
  if ($('head').attr('data-vsl-injected')) {
    return html; // already exported — return unchanged
  }
  // Mark as injected (will be present in the downloaded HTML; harmless annotation)
  $('head').attr('data-vsl-injected', '1');

  if (headerPixel && headerPixel.trim()) $('head').append(headerPixel);
  if (headerPreload && headerPreload.trim()) $('head').append(headerPreload);

  // SCRIPTS-04: Inject extra scripts after headerPixel and headerPreload, in order
  // D-14: Auto-wrap — if content does not start with <script (case-insensitive), wrap it
  if (Array.isArray(extraScripts)) {
    extraScripts.forEach(function(scriptContent) {
      if (typeof scriptContent !== 'string' || !scriptContent.trim()) return;
      var normalized = scriptContent.trim();
      var tag = /^<script/i.test(normalized)
        ? normalized
        : '<script>\n' + normalized + '\n</script>';
      $('head').append(tag);
    });
  }

  // BUNDLE-03: Replace bundle image sources globally (D-12, D-13)
  if (bundleImages && typeof bundleImages === 'object') {
    for (const [, imgData] of Object.entries(bundleImages)) {
      const originalSrc = imgData.originalSrc;
      const newSrc = imgData.newSrc;
      if (!originalSrc || !newSrc || originalSrc === newSrc) continue;

      // Validate newSrc is a valid URL (T-05-01 mitigation)
      try { new URL(newSrc); } catch { continue; }

      // Replace in all <img> src attributes matching the original (D-12)
      $('img').each((_, el) => {
        if ($(el).attr('src') === originalSrc) {
          $(el).attr('src', newSrc);
        }
      });
      // Replace in <source> src attributes
      $('source').each((_, el) => {
        if ($(el).attr('src') === originalSrc) {
          $(el).attr('src', newSrc);
        }
      });
      // Replace in srcset attributes (img and source) — each entry is "url descriptor"
      $('img[srcset], source[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset && srcset.includes(originalSrc)) {
          $(el).attr('srcset', srcset.split(',').map((entry) => {
            return entry.trim().replace(originalSrc, newSrc);
          }).join(', '));
        }
      });
    }
  }

  let outputHtml = $.html();

  if (vslembed && vslembed.trim()) {
    outputHtml = outputHtml.replace(
      /<!--\s*\[VSL_PLACEHOLDER\]\s*-->[\s\S]*?<div id="vsl(?:-cloner)?-placeholder"[\s\S]*?<\/div>/,
      vslembed
    );
  }

  outputHtml = applyCheckoutLinks(outputHtml, checkoutLinks);

  // DELAY-03: Apply delay value to exported HTML
  if (delaySeconds !== undefined && delaySeconds !== null) {
    const safeDelay = Math.max(1, Math.round(Number(delaySeconds)));

    if (delayType === 'attribute') {
      // Pattern 1: replace data-vdelay attribute in-place using string replace
      outputHtml = outputHtml.replace(
        /data-vdelay="(\d+)"/g,
        `data-vdelay="${safeDelay}"`
      );
    } else if (delayScriptContent) {
      // Pattern 2/3/4: rebuild JS script block and inject before </body>
      // String ops required — cheerio would mangle </script> inside literals
      // Sanitize client-supplied script body to prevent </script> breakout
      const sanitized = delayScriptContent.replace(/<\/script>/gi, '<\\/script>');
      const rebuilt = sanitized.replace(
        /(?:var|let|const)\s+delaySeconds\s*=\s*\d+(?:\.\d+)?/,
        `var delaySeconds = ${safeDelay}`
      );
      const delayTag = `<script>\n${rebuilt}\n</script>`;
      if (/<\/body>/i.test(outputHtml)) {
        outputHtml = outputHtml.replace(/<\/body>/i, `${delayTag}\n</body>`);
      } else {
        outputHtml += delayTag;
      }
    }
  }

  return outputHtml;
}

// ── Route: POST /api/export ──────────────────────────────────────────────────

app.post('/api/export', (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks,
          delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                       checkoutLinks, delaySeconds, delayScriptContent,
                                       delayType, bundleImages, extraScripts });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.html"');
  return res.send(outputHtml);
});

// ── Route: POST /api/export-zip ──────────────────────────────────────────────

app.post('/api/export-zip', async (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks, pageUrl,
          delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts,
          uploadSessionId } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  let outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                     checkoutLinks, delaySeconds, delayScriptContent,
                                     delayType, bundleImages, extraScripts });

  // Upload session branch — assets already in memory, no network download needed
  if (uploadSessionId) {
    const session = uploadSessions.get(uploadSessionId);
    if (!session) {
      return res.status(400).json({ error: 'Sessao de upload expirada. Refaca o upload da pasta.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('[export-zip] archive error:', err);
      res.destroy(err);
    });
    archive.pipe(res);

    archive.append(outputHtml, { name: 'index.html' });
    for (const [relativePath, buffer] of session.assets) {
      if (relativePath !== 'index.html' && relativePath !== 'index.htm') {
        archive.append(buffer, { name: relativePath });
      }
    }

    res.on('finish', function() { uploadSessions.delete(uploadSessionId); });
    await archive.finalize();
    return;
  }

  // Collect and download assets if we have the original page URL
  const usedPaths = new Set();
  const downloaded = new Map(); // absUrl → { buffer, localPath }

  if (pageUrl) {
    const $$ = cheerio.load(outputHtml, { decodeEntities: false });
    const assets = collectAssets($$, pageUrl, usedPaths); // absUrl → localPath

    // Download in batches of 5, capped at 100 assets to prevent DoS
    const entries = [...assets.entries()].slice(0, 100);
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
    res.destroy(err);
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
module.exports.detectBundleImages = detectBundleImages;
module.exports.buildExportHtml = buildExportHtml;
module.exports.uploadSessions = uploadSessions;
