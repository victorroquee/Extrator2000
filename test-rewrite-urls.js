'use strict';

// Unit tests for rewriteRelativeUrls
// Run: node test-rewrite-urls.js
// Exit code 0 = all pass, 1 = failures

const { rewriteRelativeUrls } = require('./server.js');

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
// Test 1: Relative img src -> absolute
// ---------------------------------------------------------------------------
console.log('\nTest 1: Relative img src -> absolute');
{
  const html = '<img src="images/photo.jpg">';
  const result = rewriteRelativeUrls(html, 'https://example.com/page/index.html');
  assert(result.includes('src="https://example.com/page/images/photo.jpg"'), 'relative src resolved to absolute');
}

// ---------------------------------------------------------------------------
// Test 2: Already-absolute src unchanged
// ---------------------------------------------------------------------------
console.log('\nTest 2: Already-absolute src unchanged');
{
  const html = '<img src="https://cdn.example.com/photo.jpg">';
  const result = rewriteRelativeUrls(html, 'https://example.com/');
  assert(result.includes('src="https://cdn.example.com/photo.jpg"'), 'absolute src stays unchanged');
}

// ---------------------------------------------------------------------------
// Test 3: Protocol-relative src
// ---------------------------------------------------------------------------
console.log('\nTest 3: Protocol-relative src');
{
  const html = '<img src="//cdn.example.com/photo.jpg">';
  const result = rewriteRelativeUrls(html, 'https://example.com/');
  // resolveUrl will resolve //cdn to https://cdn, which is correct
  assert(result.includes('cdn.example.com/photo.jpg'), 'protocol-relative src resolved correctly');
}

// ---------------------------------------------------------------------------
// Test 4: srcset with multiple entries
// ---------------------------------------------------------------------------
console.log('\nTest 4: srcset with multiple entries');
{
  const html = '<img srcset="small.jpg 480w, large.jpg 1024w">';
  const result = rewriteRelativeUrls(html, 'https://example.com/assets/');
  assert(result.includes('https://example.com/assets/small.jpg 480w'), 'srcset first entry resolved');
  assert(result.includes('https://example.com/assets/large.jpg 1024w'), 'srcset second entry resolved');
}

// ---------------------------------------------------------------------------
// Test 5: No pageUrl returns html unchanged
// ---------------------------------------------------------------------------
console.log('\nTest 5: No pageUrl returns html unchanged');
{
  const html = '<img src="relative.jpg">';
  const result = rewriteRelativeUrls(html, undefined);
  assert(result === html, 'html returned unchanged when no pageUrl');
}

// ---------------------------------------------------------------------------
// Test 6: video poster attribute rewritten
// ---------------------------------------------------------------------------
console.log('\nTest 6: video poster attribute rewritten');
{
  const html = '<video poster="thumb.png" src="vid.mp4">';
  const result = rewriteRelativeUrls(html, 'https://example.com/media/');
  assert(result.includes('poster="https://example.com/media/thumb.png"'), 'poster attribute resolved');
  assert(result.includes('src="https://example.com/media/vid.mp4"'), 'video src resolved');
}

// ---------------------------------------------------------------------------
// Test 7: Root-relative path (starts with /)
// ---------------------------------------------------------------------------
console.log('\nTest 7: Root-relative path (starts with /)');
{
  const html = '<img src="/assets/logo.png">';
  const result = rewriteRelativeUrls(html, 'https://example.com/deep/page/');
  assert(result.includes('src="https://example.com/assets/logo.png"'), 'root-relative path resolved to domain root');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
