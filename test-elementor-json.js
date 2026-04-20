'use strict';

// Validation script for buildElementorJson
// Tests ELEM-01 through ELEM-05, D-02, Pitfall 1, Pitfall 6, Pitfall 8
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

// Recursively collect all `id` values from the JSON tree
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

// Recursively collect all `settings` values from the JSON tree
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
  // 1 head container + 2 body section containers = 3
  assert(result.content.length === 3, `content.length === 3 (got ${result.content.length})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Unique IDs (ELEM-02)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 2: Unique IDs (ELEM-02)');
{
  // 12 body sections generates 12 containers + 12 widgets = 24 IDs, plus head IDs
  const sections = Array.from({ length: 12 }, (_, i) => `<div>S${i + 1}</div>`).join('');
  const html = `<!DOCTYPE html><html><head><script>px</script></head><body>${sections}</body></html>`;
  const result = buildElementorJson(html);

  const ids = collectIds(result);
  assert(ids.every(id => /^[0-9a-f]{8}$/.test(id)), 'all IDs are 8-char lowercase hex');
  assert(ids.length === new Set(ids).size, `no duplicate IDs (${ids.length} unique IDs)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Per-section containers (ELEM-03)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 3: Per-section containers (ELEM-03)');
{
  const html = `<!DOCTYPE html><html>
    <head><script>px</script></head>
    <body>
      <section id="a">Section A</section>
      <section id="b">Section B</section>
      <section id="c">Section C</section>
    </body>
  </html>`;
  const result = buildElementorJson(html);

  // head container + 3 section containers = at least 3
  assert(result.content.length >= 3, `content has >= 3 containers (got ${result.content.length})`);
  assert(
    result.content.every(c => c.elType === 'container'),
    'every top-level item has elType "container"'
  );
  assert(
    result.content.every(c => c.isInner === false),
    'every top-level container has isInner: false'
  );
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

  // No head content → only 1 body section container
  const bodyContainer = result.content.find(c => c.elements && c.elements.length > 0 &&
    c.elements[0].widgetType === 'html' &&
    c.elements[0].settings.html.includes('Buy now'));

  assert(bodyContainer !== undefined, 'body section container contains "Buy now" in html widget');
  if (bodyContainer) {
    assert(bodyContainer.elements.length === 1, 'container has exactly 1 element');
    assert(bodyContainer.elements[0].widgetType === 'html', 'element widgetType is "html"');
    assert(bodyContainer.elements[0].settings.html.includes('Buy now'), 'settings.html contains "Buy now"');
  }
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

  // Pitfall 6: JSON serialization roundtrip
  let roundtripOk = true;
  try { JSON.parse(serialized); } catch (e) { roundtripOk = false; }
  assert(roundtripOk, 'JSON.parse(JSON.stringify(result)) roundtrip succeeds (Pitfall 6)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Single wrapper child fallback (D-02)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 6: Single wrapper child fallback (D-02)');
{
  const html = `<!DOCTYPE html><html>
    <head></head>
    <body>
      <div id="wrapper">
        <section>Section A</section>
        <section>Section B</section>
      </div>
    </body>
  </html>`;
  const result = buildElementorJson(html);

  // D-02: wrapper's children should produce 2 containers, not 1 monolithic block
  assert(result.content.length >= 2, `D-02: content has >= 2 containers (got ${result.content.length})`);
  // Verify no container's html widget contains both "Section A" and "Section B" in one block
  const monolithic = result.content.some(c =>
    c.elements && c.elements[0] &&
    c.elements[0].settings.html.includes('Section A') &&
    c.elements[0].settings.html.includes('Section B')
  );
  assert(!monolithic, 'D-02: sections are not collapsed into one monolithic widget');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Settings are objects, never arrays (Pitfall 8)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTest 7: Settings are objects, never arrays (Pitfall 8)');
{
  const html = `<!DOCTYPE html><html>
    <head><script>px()</script><style>body{}</style></head>
    <body>
      <div>A</div><div>B</div><div>C</div>
    </body>
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
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
