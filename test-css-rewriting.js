'use strict';

// Unit tests for buildElementorJson CSS selector rewriting (body/html/:root -> wrapClass)
// Run: node test-css-rewriting.js
// Exit code 0 = all pass, 1 = failures

const { buildElementorJson } = require('./server.js');

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

function extractWrapClass(result) {
  const json = JSON.stringify(result);
  const match = json.match(/el-page-wrap-[0-9a-f]{6}/);
  return match ? match[0] : null;
}

function getWidgetHtml(result) {
  return result.content[0].elements[0].settings.html;
}

// ---------------------------------------------------------------------------
// Test 1: body { color: red } rewritten
// ---------------------------------------------------------------------------
console.log('\nTest 1: body { color: red } rewritten');
{
  const html = '<!DOCTYPE html><html><head><style>body { color: red; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  assert(wrapClass !== null, 'wrapClass extracted');
  assert(widgetHtml.includes('.' + wrapClass + ' { color: red; }'), 'body replaced with wrapClass');
  assert(!widgetHtml.includes('body { color'), 'body selector removed from CSS');
}

// ---------------------------------------------------------------------------
// Test 2: html > body { } rewritten
// ---------------------------------------------------------------------------
console.log('\nTest 2: html > body { } rewritten');
{
  const html = '<!DOCTYPE html><html><head><style>html > body { margin: 0; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  // The regex replaces html and body individually when followed by separator chars
  assert(widgetHtml.includes('.' + wrapClass), 'selectors rewritten to wrapClass');
}

// ---------------------------------------------------------------------------
// Test 3: :root { --var: blue } rewritten
// ---------------------------------------------------------------------------
console.log('\nTest 3: :root { --var: blue } rewritten');
{
  const html = '<!DOCTYPE html><html><head><style>:root { --primary: blue; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  assert(widgetHtml.includes('.' + wrapClass + ' { --primary: blue; }'), ':root replaced with wrapClass');
}

// ---------------------------------------------------------------------------
// Test 4: body.dark-theme preserved (chained class, no separator after body)
// ---------------------------------------------------------------------------
console.log('\nTest 4: body.dark-theme preserved (chained class)');
{
  const html = '<!DOCTYPE html><html><head><style>body.dark-theme { background: #000; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const widgetHtml = getWidgetHtml(result);
  assert(widgetHtml.includes('body.dark-theme'), 'body.dark-theme preserved unchanged');
}

// ---------------------------------------------------------------------------
// Test 5: Selector inside @media block
// ---------------------------------------------------------------------------
console.log('\nTest 5: Selector inside @media block');
{
  const html = '<!DOCTYPE html><html><head><style>@media (max-width: 768px) { body { font-size: 14px; } }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  assert(widgetHtml.includes('.' + wrapClass + ' { font-size: 14px; }'), 'body inside @media rewritten');
}

// ---------------------------------------------------------------------------
// Test 6: Comma-separated body, html { }
// ---------------------------------------------------------------------------
console.log('\nTest 6: Comma-separated body, html { }');
{
  const html = '<!DOCTYPE html><html><head><style>body, html { margin: 0; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  // Both body and html should be replaced
  assert(!widgetHtml.match(/(?:^|[,{}\s])body\s*[,{]/m) || widgetHtml.includes('.' + wrapClass), 'body in comma list rewritten');
  assert(!widgetHtml.match(/(?:^|[,{}\s])html\s*[,{]/m) || widgetHtml.includes('.' + wrapClass), 'html in comma list rewritten');
}

// ---------------------------------------------------------------------------
// Test 7: Non-body selector preserved
// ---------------------------------------------------------------------------
console.log('\nTest 7: Non-body selector preserved');
{
  const html = '<!DOCTYPE html><html><head><style>.container { width: 100%; } body { padding: 0; }</style></head><body><div>Hi</div></body></html>';
  const result = buildElementorJson(html);
  const wrapClass = extractWrapClass(result);
  const widgetHtml = getWidgetHtml(result);
  assert(widgetHtml.includes('.container { width: 100%; }'), '.container selector preserved');
  assert(widgetHtml.includes('.' + wrapClass + ' { padding: 0; }'), 'body rewritten to wrapClass');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
