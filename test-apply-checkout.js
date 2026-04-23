'use strict';

// Unit tests for applyCheckoutLinks
// Run: node test-apply-checkout.js
// Exit code 0 = all pass, 1 = failures

const { applyCheckoutLinks } = require('./server.js');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  FAIL: ${testName}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: Selector-based href replacement
// ---------------------------------------------------------------------------
console.log('\nTest 1: Selector-based href replacement');
{
  const html = '<a class="cta-btn" href="https://pay.hotmart.com/ORIGINAL">Buy</a>';
  const links = [{ selector: '.cta-btn', affiliateHref: 'https://pay.hotmart.com/AFFILIATE123' }];
  const result = applyCheckoutLinks(html, links);
  assert(result.includes('href="https://pay.hotmart.com/AFFILIATE123"'), 'href replaced with affiliate link');
  assert(!result.includes('ORIGINAL'), 'original href removed');
}

// ---------------------------------------------------------------------------
// Test 2: Selector-based onclick replacement
// ---------------------------------------------------------------------------
console.log('\nTest 2: Selector-based onclick replacement');
{
  const html = '<button class="buy" onclick="window.location=\'https://pay.hotmart.com/OLD\'">Buy</button>';
  const links = [{ selector: '.buy', affiliateHref: 'https://pay.hotmart.com/NEW' }];
  const result = applyCheckoutLinks(html, links);
  assert(result.includes('https://pay.hotmart.com/NEW'), 'onclick contains new affiliate URL');
  assert(!result.includes('OLD'), 'old URL removed from onclick');
}

// ---------------------------------------------------------------------------
// Test 3: affiliateUrl field (fallback from affiliateHref)
// ---------------------------------------------------------------------------
console.log('\nTest 3: affiliateUrl field (fallback from affiliateHref)');
{
  const html = '<a class="link" href="https://hop.clickbank.net/old">Click</a>';
  const links = [{ selector: '.link', affiliateUrl: 'https://hop.clickbank.net/affiliate' }];
  const result = applyCheckoutLinks(html, links);
  assert(result.includes('affiliate'), 'affiliateUrl fallback works');
}

// ---------------------------------------------------------------------------
// Test 4: Invalid selector does not crash
// ---------------------------------------------------------------------------
console.log('\nTest 4: Invalid selector does not crash');
{
  const html = '<a href="https://pay.hotmart.com/X">Buy</a>';
  const links = [{ selector: '!!!invalid[[[', affiliateHref: 'https://new.com' }];
  let threw = false;
  let result;
  try {
    result = applyCheckoutLinks(html, links);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'invalid selector does not throw');
  assert(result && result.includes('https://pay.hotmart.com/X'), 'original href preserved when selector invalid');
}

// ---------------------------------------------------------------------------
// Test 5: No-selector bulk mode
// ---------------------------------------------------------------------------
console.log('\nTest 5: No-selector bulk mode');
{
  const html = '<a href="https://pay.hotmart.com/PROD123">Buy</a><a href="https://example.com">Other</a>';
  const links = [{ affiliateHref: 'https://pay.hotmart.com/AFFILIATE' }];
  const result = applyCheckoutLinks(html, links);
  assert(result.includes('https://pay.hotmart.com/AFFILIATE'), 'checkout URL replaced in bulk mode');
  assert(result.includes('https://example.com'), 'non-checkout URL not replaced');
}

// ---------------------------------------------------------------------------
// Test 6: Empty checkoutLinks returns unchanged
// ---------------------------------------------------------------------------
console.log('\nTest 6: Empty checkoutLinks returns unchanged');
{
  const html = '<a href="https://pay.hotmart.com/X">Buy</a>';
  const result = applyCheckoutLinks(html, []);
  assert(result === html, 'empty array returns html unchanged');
}

// ---------------------------------------------------------------------------
// Test 7: Multiple selectors target different buttons
// ---------------------------------------------------------------------------
console.log('\nTest 7: Multiple selectors target different buttons');
{
  const html = '<a class="btn-a" href="https://pay.hotmart.com/OLD1">A</a><a class="btn-b" href="https://pay.hotmart.com/OLD2">B</a>';
  const links = [
    { selector: '.btn-a', affiliateHref: 'https://pay.hotmart.com/AFF1' },
    { selector: '.btn-b', affiliateHref: 'https://pay.hotmart.com/AFF2' }
  ];
  const result = applyCheckoutLinks(html, links);
  assert(result.includes('AFF1'), 'first button gets AFF1');
  assert(result.includes('AFF2'), 'second button gets AFF2');
  assert(!result.includes('OLD1') && !result.includes('OLD2'), 'both original hrefs removed');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
