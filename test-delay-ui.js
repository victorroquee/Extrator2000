'use strict';

/**
 * test-delay-ui.js
 * Behavioral tests for DELAY-02 — jsdom-based simulation of the fetch response
 * handler and export payload builder in public/index.html.
 *
 * Covers:
 *   1. hasDelay=true  → sectionDelay shown, delayInput.value set to detected seconds
 *   2. hasDelay=false → sectionDelay stays hidden (section-hidden class retained)
 *   3. state fields (hasDelay, delaySeconds, delayScriptContent) stored from summary
 *   4. Export payload includes delaySeconds + delayScriptContent when hasDelay=true
 *   5. Export payload omits those fields when hasDelay=false
 *
 * Run: node test-delay-ui.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ── Helpers ──────────────────────────────────────────────────────────────────

const failures = [];

function assert(condition, description, expected, actual) {
  if (!condition) {
    failures.push({ description, expected, actual });
    console.error(`  FAIL: ${description}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// ── Load index.html source ────────────────────────────────────────────────────

const htmlPath = path.resolve(__dirname, 'public/index.html');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

// ── Helper: build a configured JSDOM with mocked fetch ────────────────────────

/**
 * Creates a JSDOM window that has the full index.html evaluated, with a
 * mocked global fetch() that returns a single controlled API response.
 *
 * @param {object} summaryOverrides — merged into a default /api/fetch summary
 * @returns {Window} jsdom window after DOMContentLoaded
 */
async function buildWindow(summaryOverrides) {
  // Default: no delay, no bundles
  const defaultSummary = {
    scriptsRemoved: 2,
    vslDetected: true,
    checkoutLinks: [],
    hasDelay: false,
    delaySeconds: null,
    delayScriptContent: null,
    bundleImages: {},
  };
  const summary = Object.assign({}, defaultSummary, summaryOverrides);

  const dom = new JSDOM(htmlSource, {
    runScripts: 'dangerously',
    // Suppress resource-load errors (no real server running)
    resources: 'usable',
    beforeParse(window) {
      // Mock fetch — only the POST /api/fetch call matters for these tests
      window.fetch = async function(_url, _opts) {
        return {
          ok: true,
          json: async () => ({
            html: '<html><head></head><body><p>page</p></body></html>',
            summary: summary,
          }),
        };
      };

      // Suppress "URL must be absolute" errors from other resources
      window.addEventListener('error', () => {});
    },
  });

  const window = dom.window;

  // Wait for scripts to run (JSDOM executes synchronously after parse,
  // but we need event listeners registered before we trigger clicks)
  await new Promise(resolve => setTimeout(resolve, 0));

  return window;
}

/**
 * Simulates a click on #btn-fetch and waits for the async handler to settle.
 * The mocked fetch resolves immediately so a single tick is sufficient.
 */
async function triggerFetch(window) {
  const urlInput = window.document.getElementById('url-input');
  urlInput.value = 'https://example.com/vsl';

  const btn = window.document.getElementById('btn-fetch');
  btn.click();

  // Wait for the async fetch handler to complete
  await new Promise(resolve => setTimeout(resolve, 50));
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1 — hasDelay=true: section shown, input pre-filled
// ══════════════════════════════════════════════════════════════════════════════

async function test_delay_section_shown_and_input_prefilled_when_hasDelay_true() {
  console.log('\n[TEST 1] hasDelay=true → section shown, input pre-filled with 10');

  const window = await buildWindow({
    hasDelay: true,
    delaySeconds: 10,
    delayScriptContent: 'var delaySeconds = 10;\nfunction displayHiddenElements(){}',
  });

  await triggerFetch(window);

  const sectionDelay = window.document.getElementById('section-delay');
  const delayInput   = window.document.getElementById('delay-seconds');

  // Section must NOT have section-hidden after reveal
  const isHidden = sectionDelay.classList.contains('section-hidden');
  assert(!isHidden,
    'TEST1: section-delay does NOT have section-hidden class after fetch with hasDelay=true',
    false, isHidden);

  // Input value must equal the detected seconds
  assert(delayInput.value === '10',
    'TEST1: delay input value === "10" after fetch with delaySeconds=10',
    '10', delayInput.value);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2 — hasDelay=false: section stays hidden
// ══════════════════════════════════════════════════════════════════════════════

async function test_delay_section_stays_hidden_when_hasDelay_false() {
  console.log('\n[TEST 2] hasDelay=false → section-delay stays hidden');

  const window = await buildWindow({
    hasDelay: false,
    delaySeconds: null,
    delayScriptContent: null,
  });

  await triggerFetch(window);

  const sectionDelay = window.document.getElementById('section-delay');
  const isHidden = sectionDelay.classList.contains('section-hidden');

  assert(isHidden,
    'TEST2: section-delay still has section-hidden class when hasDelay=false',
    true, isHidden);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3 — state fields stored correctly from summary
// ══════════════════════════════════════════════════════════════════════════════

async function test_state_fields_stored_from_summary() {
  console.log('\n[TEST 3] state fields (hasDelay, delaySeconds, delayScriptContent) stored correctly');

  const scriptBody = 'var delaySeconds = 10;\nfunction displayHiddenElements(){}';

  const window = await buildWindow({
    hasDelay: true,
    delaySeconds: 10,
    delayScriptContent: scriptBody,
  });

  await triggerFetch(window);

  // Access the state object defined inside the script block.
  // `state` is declared with `const` in the inline script, so it lives in
  // the script's block scope — not on window. Use eval to reach it.
  let state;
  try {
    state = window.eval('state');
  } catch (e) {
    state = undefined;
  }

  assert(state !== undefined,
    'TEST3: window.state is accessible (state object is in script scope)',
    'object', typeof state);

  if (state) {
    assert(state.hasDelay === true,
      'TEST3: state.hasDelay === true',
      true, state.hasDelay);

    assert(state.delaySeconds === 10,
      'TEST3: state.delaySeconds === 10',
      10, state.delaySeconds);

    assert(state.delayScriptContent === scriptBody,
      'TEST3: state.delayScriptContent matches server value',
      scriptBody, state.delayScriptContent);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4 — export payload includes delay fields when hasDelay=true
// ══════════════════════════════════════════════════════════════════════════════

async function test_export_payload_includes_delay_fields_when_hasDelay_true() {
  console.log('\n[TEST 4] export payload includes delaySeconds + delayScriptContent when hasDelay=true');

  const scriptBody = 'var delaySeconds = 10;\nfunction displayHiddenElements(){}';

  let capturedPayload = null;

  const window = await buildWindow({
    hasDelay: true,
    delaySeconds: 10,
    delayScriptContent: scriptBody,
  });

  await triggerFetch(window);

  // After fetch, intercept the export POST to capture payload
  let exportCallCount = 0;
  window.fetch = async function(url, opts) {
    if (url === '/api/export-zip' || url === '/api/export') {
      exportCallCount++;
      capturedPayload = JSON.parse(opts.body);
      // Return a fake blob response
      return {
        ok: true,
        blob: async () => new window.Blob(['fake-zip'], { type: 'application/zip' }),
        headers: {
          get: () => null,
        },
      };
    }
    // Fallback
    return { ok: true, json: async () => ({}) };
  };

  // Trigger export
  const btnExport = window.document.getElementById('btn-export');
  btnExport.disabled = false;
  btnExport.click();

  // Wait for async export handler
  await new Promise(resolve => setTimeout(resolve, 100));

  if (capturedPayload === null) {
    // Export endpoint may not have been called — check if btn was still enabled
    assert(false,
      'TEST4: export fetch was called (capturedPayload should not be null)',
      'object with delaySeconds', null);
    return;
  }

  assert(capturedPayload.delaySeconds === 10,
    'TEST4: payload.delaySeconds === 10',
    10, capturedPayload.delaySeconds);

  assert(capturedPayload.delayScriptContent === scriptBody,
    'TEST4: payload.delayScriptContent matches state.delayScriptContent',
    scriptBody, capturedPayload.delayScriptContent);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5 — export payload omits delay fields when hasDelay=false
// ══════════════════════════════════════════════════════════════════════════════

async function test_export_payload_omits_delay_fields_when_hasDelay_false() {
  console.log('\n[TEST 5] export payload omits delaySeconds + delayScriptContent when hasDelay=false');

  let capturedPayload = null;

  const window = await buildWindow({
    hasDelay: false,
    delaySeconds: null,
    delayScriptContent: null,
  });

  await triggerFetch(window);

  window.fetch = async function(url, opts) {
    if (url === '/api/export-zip' || url === '/api/export') {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        blob: async () => new window.Blob(['fake-zip'], { type: 'application/zip' }),
        headers: {
          get: () => null,
        },
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const btnExport = window.document.getElementById('btn-export');
  btnExport.disabled = false;
  btnExport.click();

  await new Promise(resolve => setTimeout(resolve, 100));

  if (capturedPayload === null) {
    assert(false,
      'TEST5: export fetch was called (capturedPayload should not be null)',
      'object without delaySeconds', null);
    return;
  }

  assert(!('delaySeconds' in capturedPayload),
    'TEST5: payload does NOT contain delaySeconds when hasDelay=false',
    'key absent', 'delaySeconds' in capturedPayload ? 'KEY PRESENT' : 'absent');

  assert(!('delayScriptContent' in capturedPayload),
    'TEST5: payload does NOT contain delayScriptContent when hasDelay=false',
    'key absent', 'delayScriptContent' in capturedPayload ? 'KEY PRESENT' : 'absent');
}

// ══════════════════════════════════════════════════════════════════════════════
// Run all tests
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== test-delay-ui.js — DELAY-02 UI behavior ===');

  try {
    await test_delay_section_shown_and_input_prefilled_when_hasDelay_true();
    await test_delay_section_stays_hidden_when_hasDelay_false();
    await test_state_fields_stored_from_summary();
    await test_export_payload_includes_delay_fields_when_hasDelay_true();
    await test_export_payload_omits_delay_fields_when_hasDelay_false();
  } catch (err) {
    console.error('\nUnexpected error during test execution:', err);
    process.exit(1);
  }

  const total = 5;   // number of behavioral scenarios
  const passed = total - failures.length;

  console.log('\n' + '─'.repeat(60));
  if (failures.length > 0) {
    console.error(`\nFAILED ${failures.length}/${total} tests (DELAY-02)\n`);
    process.exit(1);
  } else {
    console.log(`\nPASSED ${passed}/${total} tests — DELAY-02 UI behavior verified\n`);
  }
}

main();
