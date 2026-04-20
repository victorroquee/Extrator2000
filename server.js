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
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: function(res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  },
}));

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
 * Parses image dimensions from raw binary buffer (PNG, WebP, JPEG, GIF).
 * Returns { width, height } or null.
 */
function parseImageDimensions(buffer) {
  if (!buffer || buffer.length < 30) return null;

  // PNG: bytes 16-23 contain width (4 bytes) and height (4 bytes) in IHDR
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // WebP: RIFF header, then 'WEBP', then chunk type
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
    const chunk = buffer.slice(12, 16).toString();
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      // Lossy WebP: width at 26, height at 28 (little-endian 16-bit)
      return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(28) & 0x3FFF };
    }
    if (chunk === 'VP8L' && buffer.length >= 25) {
      // Lossless WebP: bits 0-13 = width-1, bits 14-27 = height-1
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
    if (chunk === 'VP8X' && buffer.length >= 30) {
      // Extended WebP: canvas size at 24-29 (24-bit LE each)
      const w = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
      const h = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
      return { width: w, height: h };
    }
  }

  // JPEG: scan for SOF0/SOF2 markers (0xFFC0/0xFFC2)
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 10) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker === 0xC0 || marker === 0xC2) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const segLen = buffer.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }

  // GIF: width at 6, height at 8 (little-endian 16-bit)
  if (buffer.slice(0, 3).toString() === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  return null;
}

/**
 * Fetches an image URL and returns its dimensions { width, height } or null.
 */
async function fetchImageDimensions(url) {
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
      maxContentLength: 5 * 1024 * 1024,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    return parseImageDimensions(Buffer.from(resp.data));
  } catch {
    return null;
  }
}

/**
 * Detects product bundle images using multiple strategies:
 *
 * Strategy 1 (DOM): For checkout links with bundle classification, walk up the DOM
 * to find the first <img> in the nearest ancestor container.
 *
 * Strategy 2 (data-* attributes): Look for <a> tags with data-bottles and data-image
 * attributes (common in ClickBank product pages using products.js). These links
 * are often inside .esconder elements (hidden by VTURB delay) so static img tags
 * don't exist yet — the images are rendered by JS at runtime.
 *
 * Returns an object keyed by bundle qty: { 2: { src }, 3: { src }, 6: { src } }
 */
async function detectBundleImages($, checkoutLinks, pageUrl) {
  const result = {};

  // ── Strategy 1: DOM-based (existing logic) ──
  const bundleLinks = (checkoutLinks || []).filter((l) => l.bundle !== null && l.bundle !== undefined);

  for (const link of bundleLinks) {
    const bundle = link.bundle;
    if (result[bundle]) continue;

    let el;
    try { el = $(link.selector); } catch (_) { continue; }
    if (!el || el.length === 0) continue;

    const ancestor = el.closest('section, article, div');
    if (!ancestor || ancestor.length === 0) continue;

    let found = null;
    let foundWidth = null;
    let foundHeight = null;
    ancestor.find('img[src]').each((_, imgEl) => {
      if (found) return;
      const src = $(imgEl).attr('src');
      if (!src || src.startsWith('data:') || src.trim() === '') return;
      found = src;
      const w = $(imgEl).attr('width');
      const h = $(imgEl).attr('height');
      if (w) foundWidth = parseInt(w, 10) || null;
      if (h) foundHeight = parseInt(h, 10) || null;
    });

    if (found) {
      result[bundle] = { src: found, width: foundWidth, height: foundHeight };
    }
  }

  // ── Strategy 2: data-bottles + data-image attributes (JS-rendered products) ──
  if (Object.keys(result).length === 0) {
    let assetsPath = '';
    $('script').each((_, el) => {
      const txt = $(el).html() || '';
      const match = txt.match(/(?:var|let|const)\s+assetsPath\s*=\s*["']([^"']*)["']/);
      if (match) assetsPath = match[1];
    });

    $('a[data-bottles][data-image]').each((_, el) => {
      const bottles = parseInt($(el).attr('data-bottles'), 10);
      const image = $(el).attr('data-image');
      if (!bottles || !image) return;
      if (result[bottles]) return;

      let src = assetsPath + 'assets/main/products/img/' + image;
      if (pageUrl) {
        try { src = new URL(src, pageUrl).href; } catch (_) {}
      }

      result[bottles] = { src, width: null, height: null, dataImage: image };
    });
  }

  // ── Resolve missing dimensions by fetching the actual images ──
  const needsDimensions = Object.entries(result).filter(([, v]) => v.width === null && /^https?:\/\//i.test(v.src));
  if (needsDimensions.length > 0) {
    await Promise.all(needsDimensions.map(async ([qty, imgData]) => {
      const dims = await fetchImageDimensions(imgData.src);
      if (dims) {
        result[qty].width = dims.width;
        result[qty].height = dims.height;
      }
    }));
  }

  return result;
}

// ── Helper: All product images detection ────────────────────────────────────

/**
 * Detects ALL product-related images on the page (not logos, icons, or tiny assets).
 * Used as a fallback / supplement when bundle-based detection finds nothing.
 * Returns an array of { src, width, height, alt, index }.
 */
function detectAllProductImages($) {
  const images = [];
  const seen = new Set();
  // Patterns that suggest a logo/icon rather than product image
  const logoPatterns = /logo|icon|favicon|badge|arrow|check|star|seal|trust|guarantee|sprite|play|close|menu/i;

  $('img[src]').each((idx, imgEl) => {
    const src = $(imgEl).attr('src');
    if (!src || src.startsWith('data:') || src.trim() === '') return;
    if (seen.has(src)) return;
    seen.add(src);

    // Skip obvious logos/icons by src name
    const basename = src.split('/').pop().split('?')[0].toLowerCase();
    if (logoPatterns.test(basename)) return;
    // Skip very small known icon extensions
    if (basename.endsWith('.svg') && !/product|bottle|bundle|pack|main|sub/i.test(basename)) return;

    const w = $(imgEl).attr('width');
    const h = $(imgEl).attr('height');
    const alt = $(imgEl).attr('alt') || '';

    images.push({
      src,
      width: w ? parseInt(w, 10) || null : null,
      height: h ? parseInt(h, 10) || null : null,
      alt,
      index: idx,
    });
  });

  return images;
}

// ── Helper: Page color detection ─────────────────────────────────────────────

/**
 * Detects the main colors used in the page by parsing:
 * 1. Inline style attributes
 * 2. <style> tags
 * 3. Linked external CSS files (fetched in parallel, with timeout)
 * 4. CSS custom properties (--var-name: #color)
 *
 * Filters out generic/boring colors (white, black, near-white, near-black, grays).
 * Returns an array of { color, properties, count } sorted by frequency, max 15.
 *
 * @param {string} html - The raw HTML of the page
 * @param {string|null} pageUrl - The page URL for resolving relative CSS paths
 * @returns {Promise<Array>}
 */
async function detectPageColors(html, pageUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const colorMap = new Map();

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = parseInt(x, 10).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function normalizeColor(raw) {
    if (!raw) return null;
    raw = raw.trim().toLowerCase();
    if (/^(transparent|inherit|initial|currentcolor|none|unset)$/.test(raw)) return null;

    // hex
    if (/^#[0-9a-f]{3,8}$/i.test(raw)) {
      if (raw.length === 4) return '#' + raw[1]+raw[1] + raw[2]+raw[2] + raw[3]+raw[3];
      return raw.slice(0, 7);
    }

    // rgb/rgba
    const rgbMatch = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) return rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]);

    // Tailwind rgb(R G B / opacity) syntax
    const twMatch = raw.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (twMatch) return rgbToHex(twMatch[1], twMatch[2], twMatch[3]);

    const named = {
      white:'#ffffff', black:'#000000', red:'#ff0000', green:'#008000',
      blue:'#0000ff', yellow:'#ffff00', orange:'#ffa500', gray:'#808080', grey:'#808080',
    };
    return named[raw] || null;
  }

  // Skip boring/generic colors that exist on nearly every page
  const SKIP_COLORS = new Set([
    '#ffffff','#000000','#f5f5f5','#fafafa','#f9fafb','#f3f4f6',
    '#e5e7eb','#d1d5db','#9ca3af','#6b7280','#4b5563','#374151',
    '#1f2937','#111827','#333333','#666666','#999999','#cccccc',
    '#f0f0f0','#eeeeee','#dddddd','#f7f7f7','#e0e0e0',
  ]);

  function addColor(hex, prop) {
    if (!hex || SKIP_COLORS.has(hex)) return;
    const entry = colorMap.get(hex) || { color: hex, properties: new Set(), count: 0 };
    entry.properties.add(prop);
    entry.count++;
    colorMap.set(hex, entry);
  }

  function extractColorsFromCSS(css) {
    // Color properties
    const colorRegex = /(background-color|background|color|border-color|border)\s*:\s*([^;}\n]+)/gi;
    let match;
    while ((match = colorRegex.exec(css)) !== null) {
      const prop = match[1].toLowerCase();
      const val = match[2].trim();
      if (prop === 'background' || prop === 'border') {
        const colorPart = val.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
        if (colorPart) addColor(normalizeColor(colorPart[0]), prop === 'border' ? 'border-color' : 'background-color');
      } else {
        addColor(normalizeColor(val), prop);
      }
    }

    // CSS custom properties
    const varRegex = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
    while ((match = varRegex.exec(css)) !== null) {
      const hex = normalizeColor(match[2]);
      if (hex) addColor(hex, match[1]);
    }
  }

  // 1. Parse <style> tags
  $('style').each((_, el) => extractColorsFromCSS($(el).html() || ''));

  // 2. Parse inline style attributes
  $('[style]').each((_, el) => extractColorsFromCSS($(el).attr('style') || ''));

  // 3. Fetch and parse linked CSS files (skip bootstrap/font/icon libraries)
  const skipPatterns = /bootstrap|font-awesome|fontawesome|icons?\.min|normalize|reset/i;
  const cssUrls = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || skipPatterns.test(href)) return;
    let absUrl = href;
    if (pageUrl && !/^https?:\/\//i.test(href)) {
      try { absUrl = new URL(href, pageUrl).href; } catch { return; }
    }
    if (/^https?:\/\//i.test(absUrl)) cssUrls.push(absUrl);
  });

  // Fetch CSS files in parallel with 5s timeout, max 5 files
  const cssTexts = await Promise.all(
    cssUrls.slice(0, 5).map(async (url) => {
      try {
        const resp = await axios.get(url, { timeout: 5000, maxContentLength: 500 * 1024, responseType: 'text' });
        return typeof resp.data === 'string' ? resp.data : '';
      } catch { return ''; }
    })
  );
  for (const css of cssTexts) {
    if (css) extractColorsFromCSS(css);
  }

  // Sort by frequency — most used colors first, max 15
  const sorted = Array.from(colorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(entry => ({
      color: entry.color,
      properties: Array.from(entry.properties),
      count: entry.count,
    }));

  return sorted;
}

// ── Helper: Product name detection ──────────────────────────────────────────

/**
 * Detects the product name from the page by analyzing title, h1, og:title,
 * and recurring text patterns.
 * Returns { productName } or null.
 */
function detectProductName(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const candidates = [];

  // og:title
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle && ogTitle.trim()) candidates.push(ogTitle.trim());

  // <title> — use only the FIRST title tag to avoid cheerio concatenating duplicates
  const firstTitle = $('title').first().text();
  if (firstTitle && firstTitle.trim()) candidates.push(firstTitle.trim());

  // First h1
  const h1Text = $('h1').first().text();
  if (h1Text && h1Text.trim()) candidates.push(h1Text.trim());

  // First h2 (fallback)
  const h2Text = $('h2').first().text();
  if (h2Text && h2Text.trim()) candidates.push(h2Text.trim());

  if (!candidates.length) return null;

  // Pick the shortest non-empty candidate (usually the cleanest product name)
  // But prefer og:title if it exists since it's typically well-formatted
  let best = candidates[0];
  // Clean up common suffixes
  best = best.replace(/\s*[-–|]\s*Site Oficial.*$/i, '');
  best = best.replace(/\s*[-–|]\s*Official.*$/i, '');
  best = best.replace(/\s*[-–|]\s*Compre.*$/i, '');
  best = best.replace(/\s*[-–|]\s*Buy.*$/i, '');
  best = best.replace(/\s*[-–|]\s*Order.*$/i, '');
  best = best.replace(/\s*™.*$/, '');
  best = best.replace(/\s*®.*$/, '');
  best = best.trim();

  return { productName: best, allCandidates: candidates };
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

  // Detect colors and product name from raw HTML (before cleanup strips context)
  const pageColors = await detectPageColors(rawHtml, url);
  const productNameInfo = detectProductName(rawHtml);

  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);
  const bundleImages = await detectBundleImages($, checkoutLinks, url);
  const allProductImages = detectAllProductImages($);

  return res.json({
    html: cleanedHtml,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      bundleImages,
      allProductImages,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
      delayType: delayInfo ? delayInfo.delayType : null,
      pageColors,
      productName: productNameInfo ? productNameInfo.productName : null,
      productNameCandidates: productNameInfo ? productNameInfo.allCandidates : [],
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

app.post('/api/upload-folder', folderUpload.array('files', 200), async function(req, res) {
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
  const pageColors = await detectPageColors(rawHtml, null);
  const productNameInfo = detectProductName(rawHtml);
  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);
  const bundleImages = await detectBundleImages($, checkoutLinks, null);

  const sessionId = crypto.randomUUID();
  uploadSessions.set(sessionId, {
    assets,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  const allProductImages = detectAllProductImages($);

  return res.json({
    html: cleanedHtml,
    uploadSessionId: sessionId,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      bundleImages,
      allProductImages,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
      delayType: delayInfo ? delayInfo.delayType : null,
      pageColors,
      productName: productNameInfo ? productNameInfo.productName : null,
      productNameCandidates: productNameInfo ? productNameInfo.allCandidates : [],
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
            const checkoutUrlMatch = oldOnclick.match(/https?:\/\/[^'"\s);>]+/);
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
        const checkoutUrlMatch = onclick.match(/https?:\/\/[^'"\s);>]+/);
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
                           extraScripts = [], pageUrl, colorReplacements, productNameOld, productNameNew,
                           imageReplacements }) {
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
      const dataImage = imgData.dataImage; // JS-rendered image filename (from data-image attr)
      if (!newSrc || originalSrc === newSrc) continue;

      // Validate newSrc is a valid URL (T-05-01 mitigation)
      try { new URL(newSrc); } catch { continue; }

      // Replace data-image attributes (for JS-rendered product pages like ClickBank/products.js)
      if (dataImage) {
        $('a[data-image]').each((_, el) => {
          if ($(el).attr('data-image') === dataImage) {
            // Extract just the filename from newSrc for data-image replacement
            const newFilename = newSrc.split('/').pop().split('?')[0];
            $(el).attr('data-image', newFilename);
          }
        });
      }

      if (originalSrc) {
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
  }

  // Image replacements: replace any original src with a new one (from allProductImages UI)
  if (Array.isArray(imageReplacements) && imageReplacements.length > 0) {
    for (const { originalSrc, newSrc } of imageReplacements) {
      if (!originalSrc || !newSrc || originalSrc === newSrc) continue;
      $('img').each((_, el) => {
        if ($(el).attr('src') === originalSrc) $(el).attr('src', newSrc);
      });
      $('source').each((_, el) => {
        if ($(el).attr('src') === originalSrc) $(el).attr('src', newSrc);
      });
    }
  }

  let outputHtml = $.html();

  // ASSETS-01: Rewrite relative assetsPath values to absolute URLs
  // Pages using products.js define const/var assetsPath = "../../" which breaks in flat exports.
  // When pageUrl is known, resolve the relative path to an absolute base URL (FIX: bundle/floating images).
  if (pageUrl) {
    outputHtml = outputHtml.replace(
      /([cC]onst|[vV]ar|[lL]et)(\s+assetsPath\s*=\s*")([^"]*\.\.[/\\][^"]*)(")/,
      (match, decl, eq, relPath, close) => {
        try {
          const abs = new URL(relPath, pageUrl).href;
          return decl + eq + abs + close;
        } catch {
          return match;
        }
      }
    );
  }

  if (vslembed && vslembed.trim()) {
    outputHtml = outputHtml.replace(
      /<!--\s*\[VSL_PLACEHOLDER\]\s*-->[\s\S]*?<div id="vsl(?:-cloner)?-placeholder"[\s\S]*?<\/div>/,
      vslembed
    );
  }

  outputHtml = applyCheckoutLinks(outputHtml, checkoutLinks);

  // DELAY-03: Apply delay value to exported HTML
  // Always inject a standalone vanilla JS script that reveals .esconder elements
  // after the delay using setTimeout. The original VTURB player.displayHiddenElements()
  // is removed during cloning, so a self-contained replacement is required.
  if (delaySeconds !== undefined && delaySeconds !== null) {
    const safeDelay = Math.max(1, Math.round(Number(delaySeconds)));

    // Update data-vdelay attribute if present (used by some players)
    outputHtml = outputHtml.replace(/data-vdelay="(\d+)"/g, `data-vdelay="${safeDelay}"`);

    // Inject standalone script to reveal .esconder elements after delay
    // display=block overrides .esconder CSS class (display:none !important on some pages)
    const esconderScript = `<script>
(function() {
  var delay = ${safeDelay};
  setTimeout(function() {
    var els = document.querySelectorAll('.esconder');
    for (var i = 0; i < els.length; i++) {
      els[i].style.display = 'block';
    }
  }, delay * 1000);
})();
</script>`;
    if (/<\/body>/i.test(outputHtml)) {
      outputHtml = outputHtml.replace(/<\/body>/i, `${esconderScript}\n</body>`);
    } else {
      outputHtml += esconderScript;
    }
  }

  // ── Color replacements ──
  // Strategy:
  //   1) String-replace in the HTML for inline styles and <style> tags
  //   2) Inject a <style> block with :root CSS variable overrides + property overrides
  //      This catches colors defined in external CSS files (not embedded in HTML)
  //   3) Store replacements for ZIP export to also patch downloaded CSS files
  if (Array.isArray(colorReplacements) && colorReplacements.length > 0) {
    const validReplacements = colorReplacements.filter(r => r.oldColor && r.newColor && r.oldColor !== r.newColor);

    // 1) Direct string replacement in HTML
    for (const { oldColor, newColor } of validReplacements) {
      const escaped = oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      outputHtml = outputHtml.replace(new RegExp(escaped, 'gi'), newColor);
    }

    // 2) Inject CSS override <style> block
    if (validReplacements.length > 0) {
      const lines = [];
      // Re-declare CSS custom properties that referenced old colors
      const varLines = [];
      for (const { oldColor, newColor, properties } of validReplacements) {
        const props = properties || [];
        for (const p of props) {
          if (p.startsWith('--')) {
            varLines.push(`  ${p}: ${newColor} !important;`);
          }
        }
      }
      if (varLines.length > 0) {
        lines.push(':root {');
        lines.push(...varLines);
        lines.push('}');
      }

      const overrideBlock = `<style data-vsl-color-override="1">\n${lines.join('\n')}\n</style>`;
      if (/<\/head>/i.test(outputHtml)) {
        outputHtml = outputHtml.replace(/<\/head>/i, `${overrideBlock}\n</head>`);
      } else {
        outputHtml = overrideBlock + outputHtml;
      }
    }
  }

  // ── Product name replacement: swap all occurrences of old name with new ──
  if (productNameOld && productNameNew && productNameOld !== productNameNew) {
    const escapedName = productNameOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    outputHtml = outputHtml.replace(new RegExp(escapedName, 'gi'), productNameNew);
  }

  return outputHtml;
}

// ── buildElementorJson ───────────────────────────────────────────────────────
//
// Converts affiliate-customized HTML (output of buildExportHtml) into a valid,
// importable Elementor JSON structure (version 0.4).
//
// @param {string} html - Full HTML string with <!DOCTYPE>, <html>, <head>, <body>
// @returns {object} Elementor JSON object ready for JSON.stringify
//
// Design decisions (from .planning/phases/12-core-json-builder/12-CONTEXT.md):
//   D-01: Each direct child of <body> becomes a top-level container
//   D-02: If <body> has exactly 1 child (wrapper div), use wrapper's children
//   D-03/D-04: Head scripts/styles go in a dedicated first container
//   D-05: IDs are 8-char hex via crypto.randomBytes(4); collision-checked with Set
//   D-06: Root envelope: { version, type, title, page_settings, content }
//   D-07: Container shape: { id, elType, isInner, settings, elements }
//   D-08: Widget shape:    { id, elType, widgetType, isInner, settings, elements }
//   D-09: title extracted from <title> tag
//
// Pitfalls avoided:
//   Pitfall 1:  unique IDs enforced via Set
//   Pitfall 2:  isInner: false for all top-level containers and widgets
//   Pitfall 8:  settings always an object {}, never an array []
//   Pitfall 13: flex_direction always explicit
//   Pitfall 15: type always "page"
//   Pitfall 16: page_settings always {}

function buildElementorJson(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // D-09: Extract page title
  const rawTitle = $('title').first().text().trim() || '';

  // D-05: Unique ID generator with collision guard (Pitfall 1)
  const usedIds = new Set();
  function genId() {
    let id;
    do { id = crypto.randomBytes(4).toString('hex'); } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  // Helper: build one container wrapping one html widget
  function makeContainer(htmlContent) {
    return {
      id: genId(),
      elType: 'container',
      isInner: false,                          // Pitfall 2: top-level containers are always false
      settings: { flex_direction: 'column' },  // Pitfall 8 + 13: object, explicit direction
      elements: [{
        id: genId(),
        elType: 'widget',
        widgetType: 'html',
        isInner: false,
        settings: { html: htmlContent },       // Pitfall 8: settings is an object
        elements: []
      }]
    };
  }

  const containers = [];

  // D-03 / D-04: Collect head content excluding <title> and <meta charset>
  // Filter keeps <script>, <style>, <link>, <meta> (non-charset), and other head tags
  const headParts = [];
  $('head').children().each(function() {
    const el = $(this);
    const tagName = (this.tagName || '').toLowerCase();
    if (tagName === 'title') return; // Elementor manages page title separately
    if (tagName === 'meta' && el.attr('charset')) return; // Elementor manages charset
    headParts.push($.html(this));
  });
  const headContent = headParts.join('\n').trim();
  if (headContent) {
    containers.push(makeContainer(headContent));
  }

  // D-01 / D-02: Determine body sections
  let bodyChildren = $('body').children().toArray();

  // D-02: If body has exactly one child element (wrapper div), look one level deeper
  if (bodyChildren.length === 1) {
    const onlyChild = bodyChildren[0];
    const tagName = (onlyChild.tagName || '').toLowerCase();
    // Only unwrap generic wrapper divs, not semantic sectioning elements
    if (tagName === 'div' || tagName === 'main' || tagName === 'article') {
      const innerChildren = $(onlyChild).children().toArray();
      if (innerChildren.length > 0) {
        bodyChildren = innerChildren;
      }
    }
  }

  // Build one container per body section element
  // Skip text nodes, comment nodes, and top-level <script>/<style> loose tags
  bodyChildren.forEach(function(el) {
    const tagName = (el.tagName || '').toLowerCase();
    if (!tagName) return; // text node or comment
    if (tagName === 'script' || tagName === 'style') return; // loose scripts at body level
    const markup = $.html(el).trim();
    if (!markup) return;
    containers.push(makeContainer(markup));
  });

  // D-06: Assemble root JSON envelope (Pitfalls 15, 16)
  return {
    version: '0.4',
    title: rawTitle,
    type: 'page',         // Pitfall 15: must be "page"
    page_settings: {},    // Pitfall 16: must be {} not null
    content: containers
  };
}

// ── Route: POST /api/export ──────────────────────────────────────────────────

app.post('/api/export', (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks,
          delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts, pageUrl,
          colorReplacements, productNameOld, productNameNew, imageReplacements } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                       checkoutLinks, delaySeconds, delayScriptContent,
                                       delayType, bundleImages, extraScripts, pageUrl,
                                       colorReplacements, productNameOld, productNameNew, imageReplacements });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pagina-afiliado.html"');
  return res.send(outputHtml);
});

// ── Route: POST /api/export-validate ─────────────────────────────────────────

app.post('/api/export-validate', (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks,
          delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts,
          pageUrl, uploadSessionId, colorReplacements, productNameOld, productNameNew, imageReplacements } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                       checkoutLinks, delaySeconds, delayScriptContent,
                                       delayType, bundleImages, extraScripts, pageUrl,
                                       colorReplacements, productNameOld, productNameNew, imageReplacements });

  const $ = cheerio.load(outputHtml, { decodeEntities: false });
  const htmlStr = outputHtml;

  // Validation checks based on what the USER configured (payload fields),
  // not on what exists in the original page HTML (which may have leftover scripts).
  const pixelConfigured   = !!(headerPixel && headerPixel.trim());
  const preloadConfigured = !!(headerPreload && headerPreload.trim());
  const vturbConfigured   = !!(vslembed && vslembed.trim());
  const delayConfigured   = delaySeconds !== undefined && delaySeconds !== null && delaySeconds !== '';
  const checkoutConfigured = Array.isArray(checkoutLinks) && checkoutLinks.length > 0;

  const checks = [
    {
      id: 'pixel',
      label: 'Meta Pixel',
      // User configured pixel AND the fbq/facebook snippet is in the output
      passed: pixelConfigured && (/fbq\s*\(/.test(htmlStr) || /connect\.facebook\.net/i.test(htmlStr))
    },
    {
      id: 'preload',
      label: 'Script Preload',
      // User supplied a preload snippet AND a <link rel="preload"> is present in the output
      passed: preloadConfigured && $('link[rel="preload"]').length > 0
    },
    {
      id: 'vturb',
      label: 'Player VTURB',
      // User supplied a VSL embed AND the VSL placeholder was replaced (placeholder tag gone)
      // We detect injection by checking that vslembed content contains smartplayer/vturb markers,
      // or simply that the user provided vslembed and the placeholder tag is no longer in the output.
      passed: vturbConfigured && !/<!--\s*\[VSL_PLACEHOLDER\]\s*-->/.test(htmlStr)
    },
    {
      id: 'delay',
      label: 'Delay de Revelação',
      // User configured delay AND our standalone esconder reveal script was injected
      passed: delayConfigured && /var delay\s*=\s*\d+/.test(htmlStr) && /\.esconder/i.test(htmlStr)
    },
    {
      id: 'checkout',
      label: 'Links de Checkout',
      // User configured checkout links AND they appear in the output HTML
      passed: checkoutConfigured && (function() {
        var found = false;
        $('a').each(function(_, el) {
          var href = $(el).attr('href') || '';
          var cls  = $(el).attr('class') || '';
          var bottles = $(el).attr('data-bottles');
          if (/checkout|order|buy|clickbank|payment|hotmart|monetizze|eduzz|kiwify|pay\./i.test(href)) found = true;
          if (/buylink/i.test(cls)) found = true;
          if (bottles !== undefined) found = true;
        });
        return found;
      })()
    }
  ];

  return res.json({ passed: checks.every(c => c.passed), checks });
});

// ── Route: POST /api/export-zip ──────────────────────────────────────────────

app.post('/api/export-zip', async (req, res) => {
  const { html, headerPixel, headerPreload, vslembed, checkoutLinks, pageUrl,
          delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts,
          uploadSessionId, colorReplacements, productNameOld, productNameNew, imageReplacements } = req.body;

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  let outputHtml = buildExportHtml({ html, headerPixel, headerPreload, vslembed,
                                     checkoutLinks, delaySeconds, delayScriptContent,
                                     delayType, bundleImages, extraScripts, pageUrl,
                                     colorReplacements, productNameOld, productNameNew, imageReplacements });

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
    const validColorReplUpload = Array.isArray(colorReplacements)
      ? colorReplacements.filter(r => r.oldColor && r.newColor && r.oldColor !== r.newColor)
      : [];
    const hasReplUpload = validColorReplUpload.length > 0
      || (productNameOld && productNameNew && productNameOld !== productNameNew);
    for (const [relativePath, buffer] of session.assets) {
      if (relativePath !== 'index.html' && relativePath !== 'index.htm') {
        if (hasReplUpload && relativePath.endsWith('.css')) {
          let cssText = buffer.toString('utf8');
          for (const { oldColor, newColor } of validColorReplUpload) {
            const escaped = oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cssText = cssText.replace(new RegExp(escaped, 'gi'), newColor);
          }
          if (productNameOld && productNameNew && productNameOld !== productNameNew) {
            const escapedName = productNameOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cssText = cssText.replace(new RegExp(escapedName, 'gi'), productNameNew);
          }
          archive.append(cssText, { name: relativePath });
        } else {
          archive.append(buffer, { name: relativePath });
        }
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

  // Apply color and product name replacements to downloaded CSS files in the ZIP
  const validColorRepl = Array.isArray(colorReplacements)
    ? colorReplacements.filter(r => r.oldColor && r.newColor && r.oldColor !== r.newColor)
    : [];
  const hasTextReplacements = validColorRepl.length > 0
    || (productNameOld && productNameNew && productNameOld !== productNameNew);

  for (const [, { buffer, localPath }] of downloaded) {
    const isCss = localPath.endsWith('.css');
    if (isCss && hasTextReplacements) {
      let cssText = buffer.toString('utf8');
      for (const { oldColor, newColor } of validColorRepl) {
        const escaped = oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cssText = cssText.replace(new RegExp(escaped, 'gi'), newColor);
      }
      if (productNameOld && productNameNew && productNameOld !== productNameNew) {
        const escapedName = productNameOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cssText = cssText.replace(new RegExp(escapedName, 'gi'), productNameNew);
      }
      archive.append(cssText, { name: localPath });
    } else {
      archive.append(buffer, { name: localPath });
    }
  }

  await archive.finalize();
});

// ── Route: POST /api/upload-bundle-image ────────────────────────────────────

const bundleImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext));
  },
});

// Store uploaded bundle images in memory (keyed by a temp ID)
const bundleImageStore = new Map(); // id -> { buffer, mimetype, ext }

setInterval(function() {
  const now = Date.now();
  for (const [id, entry] of bundleImageStore) {
    if (entry.expiresAt < now) bundleImageStore.delete(id);
  }
}, 5 * 60 * 1000);

app.post('/api/upload-bundle-image', bundleImageUpload.single('image'), function(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem recebida.' });
  }

  const id = crypto.randomUUID();
  const ext = path.extname(req.file.originalname).toLowerCase();
  bundleImageStore.set(id, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    ext,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return res.json({ id, url: `/api/bundle-image/${id}` });
});

app.get('/api/bundle-image/:id', function(req, res) {
  const entry = bundleImageStore.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Imagem não encontrada ou expirada.' });
  res.setHeader('Content-Type', entry.mimetype);
  res.setHeader('Cache-Control', 'public, max-age=1800');
  return res.send(entry.buffer);
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
module.exports.detectPageColors = detectPageColors;
module.exports.detectProductName = detectProductName;
module.exports.detectAllProductImages = detectAllProductImages;
module.exports.buildExportHtml = buildExportHtml;
module.exports.buildElementorJson = buildElementorJson;
module.exports.uploadSessions = uploadSessions;
module.exports.bundleImageStore = bundleImageStore;
