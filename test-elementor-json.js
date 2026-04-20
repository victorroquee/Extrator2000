'use strict';

// Validation script for buildElementorJson
// Tests ELEM-01 through ELEM-05, Pitfall 1, Pitfall 6, Pitfall 8
// Run: node test-elementor-json.js
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

function collectIds(obj) {
  const ids = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.id === 'string') ids.push(node.id);
    Object.values(node).forEach(walk);
  }
  walk(obj);
  return ids;
}

function collectSettings(obj) {
  const settings = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if ('settings' in node) settings.push(node.settings);
    Object.values(node).forEach(walk);
  }
  walk(obj);
  return settings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Basic structure (ELEM-01)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 1: Basic structure (ELEM-01)');
{
  const html = `<!DOCTYPE html><html>
    <head><script>pixel</script><style>.x{}</style></head>
    <body><div>Section 1</div><div>Section 2</div></body>
  </html>`;
  const result = buildElementorJson(html);

  assert(result.version === '0.4', 'version is "0.4"');
  assert(result.type === 'page', 'type is "page"');
  assert(typeof result.page_settings === 'object' && !Array.isArray(result.page_settings), 'page_settings is a plain object');
  assert(result.page_settings !== null, 'page_settings is not null');
  assert(Array.isArray(result.content), 'content is an array');
  assert(result.content.length === 1, `content.length === 1 (single container with full page, got ${result.content.length})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Unique IDs (ELEM-02)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 2: Unique IDs (ELEM-02)');
{
  const html = `<!DOCTYPE html><html><head><script>px</script></head><body><div>A</div></body></html>`;
  const result = buildElementorJson(html);

  const ids = collectIds(result);
  assert(ids.length === 2, `2 IDs generated (1 container + 1 widget, got ${ids.length})`);
  assert(ids.every(id => /^[0-9a-f]{8}$/.test(id)), 'all IDs are 8-char lowercase hex');
  assert(ids.length === new Set(ids).size, 'no duplicate IDs');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Single container with full page (ELEM-03)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 3: Single container with full page (ELEM-03)');
{
  const html = `<!DOCTYPE html><html>
    <head><style>.hero{color:red}</style></head>
    <body>
      <section id="a">Section A</section>
      <section id="b">Section B</section>
    </body>
  </html>`;
  const result = buildElementorJson(html);

  assert(result.content.length === 1, 'content has 1 container (full page in single widget)');
  const widget = result.content[0].elements[0];
  assert(widget.widgetType === 'html', 'widget type is html');
  assert(widget.settings.html.includes('.hero{color:red}'), 'head styles are included in widget');
  assert(widget.settings.html.includes('Section A'), 'body content A is included');
  assert(widget.settings.html.includes('Section B'), 'body content B is included');
  assert(result.content[0].elType === 'container', 'top-level item is container');
  assert(result.content[0].isInner === false, 'container has isInner: false');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: HTML widget wrapping (ELEM-04)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 4: HTML widget wrapping (ELEM-04)');
{
  const html = `<!DOCTYPE html><html>
    <head></head>
    <body><div class="pricing">Buy now</div></body>
  </html>`;
  const result = buildElementorJson(html);

  const container = result.content[0];
  assert(container !== undefined, 'container exists');
  assert(container.elements.length === 1, 'container has exactly 1 element');
  assert(container.elements[0].widgetType === 'html', 'element widgetType is "html"');
  assert(container.elements[0].settings.html.includes('Buy now'), 'settings.html contains "Buy now"');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Affiliate customizations survive (ELEM-05)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 5: Affiliate customizations survive (ELEM-05)');
{
  const html = `<!DOCTYPE html><html>
    <head>
      <script>
        !function(f,b,e,v){if(f.fbq)return;f.fbq=function(){};
        fbq('init', '1234567890');
        fbq('track', 'PageView');
      </script>
    </head>
    <body>
      <div class="player">
        <div id="smartplayer-container">
          <script src="https://player.vturb.com.br/embed.js"></script>
        </div>
      </div>
      <div class="cta">
        <a href="https://hotmart.com/product/xyz/checkout?a=AFFILIATE123">Comprar Agora</a>
      </div>
    </body>
  </html>`;
  const result = buildElementorJson(html);
  const serialized = JSON.stringify(result);

  assert(serialized.includes("fbq('init'"), "Meta Pixel fbq('init') survived");
  assert(serialized.includes('smartplayer'), 'VTURB smartplayer survived');
  assert(serialized.includes('hotmart.com'), 'Hotmart checkout URL survived');

  let roundtripOk = true;
  try { JSON.parse(serialized); } catch (e) { roundtripOk = false; }
  assert(roundtripOk, 'JSON.parse(JSON.stringify(result)) roundtrip succeeds (Pitfall 6)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Head + body combined in single widget
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 6: Head + body combined in single widget');
{
  const html = `<!DOCTYPE html><html>
    <head>
      <style>.hero { background: blue; }</style>
      <script>fbq('init','999')</script>
    </head>
    <body>
      <div class="hero">Hello</div>
    </body>
  </html>`;
  const result = buildElementorJson(html);

  const widgetHtml = result.content[0].elements[0].settings.html;
  assert(widgetHtml.includes('.hero { background: blue; }'), 'head styles present in widget');
  assert(widgetHtml.includes("fbq('init'"), 'head scripts present in widget');
  assert(widgetHtml.includes('class="hero"'), 'body content present in widget');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Settings are objects, never arrays (Pitfall 8)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 7: Settings are objects, never arrays (Pitfall 8)');
{
  const html = `<!DOCTYPE html><html>
    <head><script>px()</script></head>
    <body><div>A</div></body>
  </html>`;
  const result = buildElementorJson(html);
  const allSettings = collectSettings(result);

  assert(allSettings.length > 0, 'settings values found in tree');
  assert(
    allSettings.every(s => typeof s === 'object' && !Array.isArray(s)),
    'every settings value is a plain object (not array)'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Empty body graceful handling
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 8: Empty body graceful handling');
{
  let result;
  let threw = false;
  try {
    result = buildElementorJson('<!DOCTYPE html><html><head></head><body></body></html>');
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'buildElementorJson does not throw on empty body');
  assert(Array.isArray(result && result.content), 'result.content is an array even for empty body');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Title extraction
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 9: Title extraction');
{
  const html = `<!DOCTYPE html><html><head><title>BurnSlim Official</title></head><body><div>Hi</div></body></html>`;
  const result = buildElementorJson(html);
  assert(result.title === 'BurnSlim Official', `title extracted correctly (got "${result.title}")`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
