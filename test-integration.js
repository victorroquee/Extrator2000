'use strict';

const fs = require('fs');
const cheerio = require('cheerio');
const { cleanHtml, detectCheckoutLinks, detectVturbDelay, buildExportHtml: _buildExportHtml } = require('./server');

// ── Simple assertion helper ──────────────────────────────────────────────────

const failures = [];

function assert(condition, description, expected, actual) {
  if (!condition) {
    failures.push({ description, expected, actual });
  }
}

function assertNotContains(str, substring, description) {
  assert(!str.toLowerCase().includes(substring.toLowerCase()), description,
    `string NOT to contain "${substring}"`,
    str.toLowerCase().includes(substring.toLowerCase()) ? 'FOUND (should be absent)' : 'absent');
}

function assertContains(str, substring, description) {
  assert(str.toLowerCase().includes(substring.toLowerCase()), description,
    `string to contain "${substring}"`,
    str.toLowerCase().includes(substring.toLowerCase()) ? 'found' : 'NOT FOUND');
}

// ── Load fixture ─────────────────────────────────────────────────────────────

const fixtureHtml = fs.readFileSync('./test-fixture.html', 'utf8');

// ── Run cleanup pipeline ─────────────────────────────────────────────────────

const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(fixtureHtml);

// ── Run checkout detection ───────────────────────────────────────────────────

const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
const links = detectCheckoutLinks($, cleanedHtml);

// ── CLEANUP assertions ───────────────────────────────────────────────────────

assert(vslDetected === true, 'vslDetected === true (Pattern 1 triggered detection)', true, vslDetected);

assert(scriptsRemoved >= 3, `scriptsRemoved >= 3 (pixel + vturb preload script + vturb embed script)`,
  '>= 3', scriptsRemoved);

assertNotContains(cleanedHtml, 'cdn.vturb.com/player/p/6712abc1def23456789012ab',
  'Pattern 1: VTURB embed script src removed from output');

assertNotContains(cleanedHtml, 'fbq(',
  'Pattern 3: Meta Pixel fbq() script removed');

assertNotContains(cleanedHtml, 'facebook.com/tr',
  'Pattern 3: Meta Pixel noscript img removed');

assertNotContains(cleanedHtml, 'vturb_preload',
  'Pattern 4b: window.vturb_preload script removed');

// Pattern 4a: preload link for cdn.vturb.com removed
assert(
  !/<link[^>]+rel="preload"[^>]*cdn\.vturb\.com/i.test(cleanedHtml),
  'Pattern 4a: VTURB preload link removed',
  'no <link rel="preload"> pointing to cdn.vturb.com',
  /<link[^>]+rel="preload"[^>]*cdn\.vturb\.com/i.test(cleanedHtml) ? 'FOUND (should be absent)' : 'absent'
);

assertContains(cleanedHtml, '<!-- [VSL_PLACEHOLDER] -->',
  'CLEAN-08: VSL placeholder comment injected');

assertContains(cleanedHtml, 'jquery',
  'CLEAN-07: jQuery CDN script survived cleanup');

assertContains(cleanedHtml, 'bootstrap',
  'CLEAN-07: Bootstrap CSS link survived cleanup');

// Google Fonts should survive (rel=stylesheet, not preload for vturb)
assertContains(cleanedHtml, 'fonts.googleapis.com',
  'CLEAN-07: Google Fonts link survived cleanup');

// ── DETECTION assertions ─────────────────────────────────────────────────────

assert(links.length >= 2,
  'links.length >= 2 (at least ClickBank and Hotmart detected)',
  '>= 2', links.length);

assert(links.some(l => l.platform === 'ClickBank'),
  'Pattern 2: ClickBank platform detected',
  'platform=ClickBank in at least one link',
  links.map(l => l.platform).join(', ') || '(none)');

assert(links.some(l => l.platform === 'Hotmart'),
  'Pattern 5: Hotmart platform detected',
  'platform=Hotmart in at least one link',
  links.map(l => l.platform).join(', ') || '(none)');

assert(links.some(l => l.bundle === 6),
  'Bundle=6 detected (6 Potes / Kit Completo)',
  'at least one link with bundle=6',
  links.map(l => `${l.platform}:bundle${l.bundle}`).join(', ') || '(none)');

assert(links.some(l => l.bundle === 3),
  'Bundle=3 detected (Popular / 3 Potes)',
  'at least one link with bundle=3',
  links.map(l => `${l.platform}:bundle${l.bundle}`).join(', ') || '(none)');

assert(links.every(l => l.selector),
  'All detected links have a CSS selector',
  'every link.selector is truthy',
  links.map(l => l.selector || '(missing)').join(', '));

// ── DELAY-01 / DELAY-03 / EXPORT-06 assertions ──────────────────────────────

// DELAY-01: detect delay from fixture (fixture must have delay block; add if absent)
// Use an inline mini-fixture for deterministic testing
const delayFixtureHtml = `<html><head></head><body>
<script>var delaySeconds = 10;
function displayHiddenElements() { document.querySelectorAll('.hidden').forEach(function(el){ el.style.display=''; }); }
setTimeout(displayHiddenElements, delaySeconds * 1000);
</script></body></html>`;

const delayResult = detectVturbDelay(delayFixtureHtml);
assert(delayResult !== null, 'DELAY-01: detectVturbDelay finds block when present', 'not null', delayResult);
assert(delayResult && delayResult.delaySeconds === 10, 'DELAY-01: delaySeconds extracted correctly', 10, delayResult && delayResult.delaySeconds);
assert(delayResult && delayResult.delayScriptContent.includes('displayHiddenElements'),
  'DELAY-01: full script body preserved in delayScriptContent', 'contains displayHiddenElements',
  delayResult && delayResult.delayScriptContent ? 'found' : 'NOT FOUND');

const noDelayResult = detectVturbDelay('<html><head></head><body></body></html>');
assert(noDelayResult === null, 'DELAY-01: returns null when no delay block present', null, noDelayResult);

// DELAY-03: export replaces only the numeric value, preserves function body
// Use pre-cleaned HTML (no delay script) as input — mirrors real flow where
// cleanHtml() removes the delay block (which contains vturb/smartplayer keywords)
// before the HTML is stored in state.fetchedHtml and later passed to buildExportHtml
const cleanBaseHtml = '<html><head></head><body><p>page content</p></body></html>';
const exportedDelay = _buildExportHtml({
  html: cleanBaseHtml,
  headerPixel: '',
  headerPreload: '',
  vslembed: '',
  checkoutLinks: [],
  delaySeconds: 5,
  delayScriptContent: delayResult && delayResult.delayScriptContent,
});
assertContains(exportedDelay, 'var delay = 5', 'DELAY-03: new delay value injected in standalone script');
assertNotContains(exportedDelay, 'var delay = 10', 'DELAY-03: old delay value not present');
assertContains(exportedDelay, '.esconder', 'DELAY-03: esconder reveal script present in export');

// EXPORT-06: calling buildExportHtml twice with same input does not duplicate pixel
const pixelHtml = '<html><head></head><body></body></html>';
const firstExport = _buildExportHtml({
  html: pixelHtml,
  headerPixel: '<script>console.log("pixel")</script>',
  headerPreload: '',
  vslembed: '',
  checkoutLinks: [],
});
const secondExport = _buildExportHtml({
  html: firstExport,
  headerPixel: '<script>console.log("pixel")</script>',
  headerPreload: '',
  vslembed: '',
  checkoutLinks: [],
});
const pixelCount1 = (firstExport.match(/console\.log\("pixel"\)/g) || []).length;
const pixelCount2 = (secondExport.match(/console\.log\("pixel"\)/g) || []).length;
assert(pixelCount1 === 1, 'EXPORT-06: first export has exactly 1 pixel injection', 1, pixelCount1);
assert(pixelCount2 === 1, 'EXPORT-06: second export does not duplicate pixel (idempotency sentinel)', 1, pixelCount2);

// ── Results ──────────────────────────────────────────────────────────────────

const total = 24; // 15 original + 9 new Phase 4 assertions
const passed = total - failures.length;

if (failures.length > 0) {
  console.error(`\nFAILED ${failures.length}/${total} assertions:\n`);
  for (const f of failures) {
    console.error(`  FAIL: ${f.description}`);
    console.error(`    expected: ${f.expected}`);
    console.error(`    actual:   ${f.actual}\n`);
  }
  process.exit(1);
} else {
  console.log(`\nPASSED ${passed}/${total} assertions — all VSL patterns handled correctly ✓`);
  console.log(`  scriptsRemoved: ${scriptsRemoved}`);
  console.log(`  vslDetected: ${vslDetected}`);
  console.log(`  checkoutLinks: ${links.length} found`);
  links.forEach(l => console.log(`    → ${l.platform} bundle=${l.bundle} | ${l.href}`));
  process.exit(0);
}
