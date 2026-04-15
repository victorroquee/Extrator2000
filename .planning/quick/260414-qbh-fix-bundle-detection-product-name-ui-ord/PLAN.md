---
phase: quick/260414-qbh-fix-bundle-detection-product-name-ui-ord
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server.js
  - public/index.html
autonomous: true
requirements:
  - POTES-01
  - PRODUCT-01
  - PRODUCT-03

must_haves:
  truths:
    - "detectPricingSections traverses into .esconder containers and returns sections regardless of CSS display state"
    - "Export accepts originalProductName + newProductName as free-text fields (no server auto-detection wired to either)"
    - "UI shows two text inputs for Nome original / Nome novo, with no detected-name display logic"
    - "Editor sections appear in the correct order: Pixel → Preload VTURB → Scripts Adicionais → VSL embed → Personalização (bundle images + product name)"
  artifacts:
    - path: "server.js"
      provides: "detectPricingSections without visibility filtering; detectProductName kept but no longer called in fetch/upload routes; buildExportHtml PRODUCT-03 logic unchanged"
    - path: "public/index.html"
      provides: "Two free-text inputs for product name substitution; correct section order"
  key_links:
    - from: "public/index.html (doExport payload)"
      to: "server.js buildExportHtml PRODUCT-03 block"
      via: "payload.originalProductName / payload.newProductName"
      pattern: "originalProductName.*newProductName"
---

<objective>
Fix three bugs / design issues in the VSL Cloner editor:

1. Bundle (potes) detection misses sections hidden by the `.esconder` CSS class — add an explicit guard-free traversal with a comment so the intent is never accidentally reverted.
2. The "Nome do Produto" section currently shows an auto-detected server value and has one input for the replacement; replace it with two independent plain-text fields ("Nome original" and "Nome novo") that the user fills manually. The server PRODUCT-03 export logic already accepts both fields, so only the server detection call-site and the frontend need to change.
3. Section order in the editor HTML is wrong: section-product-name appears at position 4 (before Scripts Adicionais and VSL embed), but should be grouped with bundle images at the end under page customisation.

Purpose: Make potes detection reliable on real VSL pages; give the user full control over product name substitution without fragile auto-detection; put the editor sections in the logical workflow order.
Output: server.js (detection fix + remove detectProductName from routes), public/index.html (two-field product name UI + corrected section order).
</objective>

<execution_context>
@/Users/victorroque/Downloads/Extrator2000/.planning/quick/260414-qbh-fix-bundle-detection-product-name-ui-ord/PLAN.md
</execution_context>

<context>
@/Users/victorroque/Downloads/Extrator2000/server.js
@/Users/victorroque/Downloads/Extrator2000/public/index.html

Key server.js landmarks:
- detectPricingSections: lines 349–401  — no visibility filtering today; add explicit comment
- detectProductName: lines 418–446      — keep function (exported), but remove its call from /api/fetch and /api/upload-folder routes and from the summary payloads
- PRODUCT-03 block: lines 1019–1027    — untouched, already accepts originalProductName + newProductName
- /api/export destructuring: line 1037  — already includes originalProductName, newProductName; no change needed
- /api/fetch route: lines ~592–615      — remove productName = detectProductName($) and remove productName from summary response
- /api/upload-folder route: lines ~692–722 — same removal

Key index.html landmarks:
- section-header (Scripts de Header, step 2): lines 952–978  — contains Pixel & Rastreamento + Script VTURB / Preload in one two-col card
- section-player (Embed do Player, step 3): lines 980–996
- section-product-name (step 4): lines 998–1019 — MUST MOVE to after section-bundle-images (currently step 8)
- section-extra-scripts (Scripts Adicionais, step 5): lines 1021–1037
- section-delay (step 6): lines 1039–1063
- section-checkout (step 7): lines 1065–1073
- section-bundle-images (step 8): lines 1075–1083
- section-pricing-editor (step 9): lines 1085–1094

Target section order (step numbers can stay as-is or be renumbered — keep them visually consistent):
  1. section-fetch (URL input — always visible, not touched)
  2. section-summary (stats)
  3. section-header  → renamed label split: "Pixel & Rastreamento" | "Preload VTURB" (already split as two-col fields — order is fine)
  4. section-extra-scripts  (Scripts Adicionais)
  5. section-player  (VSL embed)
  6. section-delay
  7. section-checkout
  8. section-bundle-images  )  page customisation group
  9. section-product-name   )
  10. section-pricing-editor )

JS variable references to sectionProductName, productNameInput, productNameDetectedEl are already declared;
the fetch/upload response handlers populate state.productName and show the detected name — all of that JS must be replaced.
</context>

<tasks>

<task type="auto">
  <name>Task 1: server.js — add .esconder traversal comment + remove detectProductName from routes</name>
  <files>server.js</files>
  <action>
Two changes in server.js:

**1a. detectPricingSections — add explicit comment (lines 349–401).**
After the opening of the function body (after `const seen = new Set();`) add a comment block:

```js
  // NOTE: Cheerio operates on static DOM — no CSS display filtering is applied.
  // Elements inside .esconder containers (hidden by VTURB delay script at runtime)
  // ARE present in the HTML and MUST be traversed. Do NOT add visibility filtering here.
```

No logic change — the function already traverses all elements. The comment prevents future regressions.

**1b. /api/fetch route (around line 594–614) — remove detectProductName.**
- Remove the line: `const productName = detectProductName($);`
- Remove `productName,` from the summary object in `res.json({ ... summary: { ... } })`

**1c. /api/upload-folder route (around line 695–721) — same removal.**
- Remove the line: `const productName = detectProductName($);`
- Remove `productName,` from the summary object stored in `uploadSessions.set(...)`

The `detectProductName` function itself and its `module.exports` line stay — it is a named export used in tests.
  </action>
  <verify>
node -e "
const s = require('./server.js');
// detectProductName still exported
console.assert(typeof s.detectProductName === 'function', 'detectProductName must still be exported');
// detectPricingSections still exported
console.assert(typeof s.detectPricingSections === 'function', 'detectPricingSections must still be exported');
console.log('OK');
" 2>&1
  </verify>
  <done>
- server.js has the .esconder comment in detectPricingSections
- Neither /api/fetch nor /api/upload-folder routes call detectProductName or include productName in their summary response
- detectProductName is still defined and exported
- node -e check prints "OK" with no assertion errors
  </done>
</task>

<task type="auto">
  <name>Task 2: public/index.html — redesign product name section to two free-text fields</name>
  <files>public/index.html</files>
  <action>
Replace the "Nome do Produto" section HTML and the corresponding JS.

**2a. HTML section (lines 998–1019) — replace inner content.**
Keep the `<section>` wrapper and its id/class unchanged. Replace everything inside it with:

```html
        <section class="card section-hidden" id="section-product-name">
          <div class="card-header">
            <span class="step-num">9</span>
            <span class="card-title">Nome do Produto</span>
          </div>
          <p class="card-hint">
            Substitua o nome do produto na pagina exportada. Ambos os campos sao opcionais — se vazios, nenhuma substituicao e feita.
          </p>
          <div class="two-col" style="margin-top:8px;">
            <div class="field-group">
              <label for="product-name-original">Nome original (texto atual na pagina)</label>
              <input
                type="text"
                id="product-name-original"
                class="input"
                placeholder="Ex: Puravive"
                style="width:100%;"
              />
            </div>
            <div class="field-group">
              <label for="product-name-new">Nome novo (substituto)</label>
              <input
                type="text"
                id="product-name-new"
                class="input"
                placeholder="Ex: Meu Produto"
                style="width:100%;"
              />
            </div>
          </div>
        </section>
```

(The step number will be corrected in Task 3 when re-ordering — use a placeholder of 9 here.)

**2b. JS variable declarations (around lines 1349–1351) — update DOM references.**
Replace:
```js
    const sectionProductName     = document.getElementById('section-product-name');
    const productNameInput       = document.getElementById('product-name-input');
    const productNameDetectedEl  = document.getElementById('product-name-detected');
```
With:
```js
    const sectionProductName      = document.getElementById('section-product-name');
    const productNameOriginalInput = document.getElementById('product-name-original');
    const productNameNewInput      = document.getElementById('product-name-new');
```

**2c. Fetch response handler — product name section reveal (lines ~1855–1865).**
Replace the product name block:
```js
        // Product name section
        if (sectionProductName) {
          productNameInput.value = '';
          if (state.productName) {
            productNameDetectedEl.textContent = 'Detectado: ' + state.productName;
          } else {
            productNameDetectedEl.textContent = 'Nenhum nome detectado';
          }
          productNameDetectedEl.style.display = 'block';
          showSection(sectionProductName);
        }
```
With:
```js
        // Product name section
        if (sectionProductName) {
          if (productNameOriginalInput) productNameOriginalInput.value = '';
          if (productNameNewInput) productNameNewInput.value = '';
          showSection(sectionProductName);
        }
```

**2d. Upload response handler — same product name block (lines ~1991–2001).**
Apply the same replacement as 2c (there is a second identical block for the upload flow).

**2e. Export payload assembly — PRODUCT-03 (around lines 2214–2220).**
Replace:
```js
      // PRODUCT-03: Include product name in export payload
      if (state.productName) {
        payload.originalProductName = state.productName;
        var newName = productNameInput ? productNameInput.value.trim() : '';
        if (newName) {
          payload.newProductName = newName;
        }
      }
```
With:
```js
      // PRODUCT-03: Include product name in export payload
      var origName = productNameOriginalInput ? productNameOriginalInput.value.trim() : '';
      var newName  = productNameNewInput      ? productNameNewInput.value.trim()      : '';
      if (origName && newName) {
        payload.originalProductName = origName;
        payload.newProductName      = newName;
      }
```

Also remove `state.productName` from the state object (line ~1296) since the server no longer sends it. Change:
```js
      productName: null,      // nome detectado pelo servidor
```
To delete that line entirely (the state object no longer needs this field).
  </action>
  <verify>
# Verify the two new input IDs exist in the file and the old single input is gone
grep -c 'id="product-name-original"' /Users/victorroque/Downloads/Extrator2000/public/index.html
grep -c 'id="product-name-new"' /Users/victorroque/Downloads/Extrator2000/public/index.html
grep -c 'id="product-name-input"' /Users/victorroque/Downloads/Extrator2000/public/index.html
# Last command must output 0
  </verify>
  <done>
- Two new inputs (product-name-original, product-name-new) exist in the HTML
- Old single product-name-input input is gone
- product-name-detected span is gone
- Both response handlers (fetch + upload) reveal section-product-name without referencing state.productName
- Export payload block sends originalProductName + newProductName only when both are non-empty
  </done>
</task>

<task type="auto">
  <name>Task 3: public/index.html — fix section DOM order</name>
  <files>public/index.html</files>
  <action>
Reorder the `<section>` blocks inside `.form-panel` (the editor column) to match the required sequence. Read the current HTML, identify the complete HTML for each section block (from opening `<!-- comment -->` or `<section` to closing `</section>`), then rewrite the block in the correct order.

Required order:
1. section-fetch          (already first, do not move)
2. section-summary        (already second, do not move)
3. section-header         (Pixel + Preload VTURB — already third, do not move)
4. section-extra-scripts  (Scripts Adicionais — currently step 5, must come BEFORE section-player)
5. section-player         (VSL embed — currently step 3, must move AFTER section-extra-scripts)
6. section-delay          (currently step 6 — no move needed relative to checkout)
7. section-checkout       (currently step 7 — no move needed)
8. section-bundle-images  (currently step 8 — no move needed)
9. section-product-name   (currently step 4 — must move to HERE, after section-bundle-images)
10. section-pricing-editor (currently step 9 — no move needed)
11. Export card            (always last)

Concretely, two sections swap relative position:
- section-extra-scripts moves BEFORE section-player (currently it's after)
- section-product-name moves to AFTER section-bundle-images (currently it's before section-extra-scripts)

After reordering, update the `<span class="step-num">` values to match the new sequence (3 through 10 for the shown steps, skipping section-fetch and section-summary which have no step numbers). Assign:
- section-header          → step 2  (unchanged)
- section-extra-scripts   → step 3
- section-player          → step 4
- section-delay           → step 5
- section-checkout        → step 6
- section-bundle-images   → step 7
- section-product-name    → step 8
- section-pricing-editor  → step 9

Do NOT change IDs, classes, content, or JS — only the physical DOM order and step number text.
  </action>
  <verify>
# Verify section order by checking line numbers of each section id
grep -n 'id="section-' /Users/victorroque/Downloads/Extrator2000/public/index.html | grep -E 'section-(header|extra-scripts|player|delay|checkout|bundle-images|product-name|pricing-editor)'
# Expected output order: section-header, section-extra-scripts, section-player, section-delay, section-checkout, section-bundle-images, section-product-name, section-pricing-editor
  </verify>
  <done>
- section-extra-scripts appears before section-player in the DOM
- section-product-name appears after section-bundle-images in the DOM
- Step numbers are consecutive and match the new positions
- No section IDs, classes, or content changed (only order and step numbers)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /api/export | originalProductName and newProductName are now user-typed free text (not server-detected), crossing as JSON strings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-qbh-01 | Tampering | buildExportHtml PRODUCT-03 regex replace | accept | ReDoS guard already present (line 1024: special chars escaped via replace(/[.*+?^${}()|[\]\\]/g, '\\$&')). User-supplied originalProductName is now free-text but escaping was already applied for the server-detected case — no change needed. |
| T-qbh-02 | Information Disclosure | server.js — productName removed from summary | accept | Removing the field reduces surface area; no new exposure introduced. |
</threat_model>

<verification>
After all three tasks complete:

```bash
# 1. Server starts without errors
node -e "require('./server.js'); console.log('server loads OK');" 2>&1

# 2. detectPricingSections and detectProductName still exported
node -e "
const s = require('./server.js');
['detectPricingSections','detectProductName','cleanHtml','buildExportHtml'].forEach(fn => {
  console.assert(typeof s[fn] === 'function', fn + ' must be exported');
});
console.log('exports OK');
" 2>&1

# 3. New product-name inputs exist; old input gone
grep -c 'id="product-name-original"' public/index.html   # expect 1
grep -c 'id="product-name-new"'      public/index.html   # expect 1
grep -c 'id="product-name-input"'    public/index.html   # expect 0

# 4. Section order correct
grep -n 'id="section-' public/index.html | grep -E 'section-(header|extra-scripts|player|delay|checkout|bundle-images|product-name|pricing-editor)'
# lines must ascend in the order listed above
```
</verification>

<success_criteria>
- detectPricingSections has the .esconder comment and traverses all DOM elements regardless of CSS display state
- /api/fetch and /api/upload-folder no longer call detectProductName and do not include productName in their summary payloads
- "Nome do Produto" section has two plain inputs: product-name-original + product-name-new (auto-detection UI fully removed)
- Export payload sends originalProductName + newProductName only when both inputs are non-empty
- DOM order: header → extra-scripts → player → delay → checkout → bundle-images → product-name → pricing-editor
- Step numbers updated to match new order
- Server still exports all named functions (no regression)
</success_criteria>

<output>
After completion, create `.planning/quick/260414-qbh-fix-bundle-detection-product-name-ui-ord/SUMMARY.md` with:
- What was changed in each file
- Any deviations from this plan (with rationale)
- Verification output
</output>
