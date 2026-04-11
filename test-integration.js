'use strict';

const fs = require('fs');
const cheerio = require('cheerio');
const { cleanHtml, detectCheckoutLinks } = require('./server');

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

// ── Results ──────────────────────────────────────────────────────────────────

const total = 15; // total assertions defined above
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
}
