# Quick Plan: Validacao Pre-Download

## Objective

Intercept the export flow to validate the generated HTML before allowing download. After the `/api/export-zip` response arrives, parse the HTML inside the ZIP (or use a new validation endpoint) and display a checklist modal showing pass/fail for 5 required items. Block download if any required item is missing; allow download if all pass.

## Architecture Decision

The validation runs **client-side** by adding a new `/api/export-validate` endpoint that builds the HTML (same as export) but returns a JSON validation report instead of a ZIP. This avoids parsing a ZIP in the browser. The flow becomes:

1. User clicks "Gerar Pagina do Afiliado"
2. POST `/api/export-validate` with the same payload -> returns JSON `{ checks: [...], outputHtml: string }`
3. Show validation modal with checklist
4. If all pass -> user clicks "Baixar" -> POST `/api/export-zip` (existing) -> download
5. If any fail -> user clicks "Corrigir" -> modal closes, user stays on form

## Key References

- **Export button handler**: `public/index.html` line 1633 (`async function doExport()`)
- **Download trigger**: `public/index.html` lines 1678-1686 (blob download via anchor)
- **Export buttons**: `#btn-export` (line 905) and `#btn-export-panel` (line 1031)
- **Server export-zip**: `server.js` line 885
- **buildExportHtml**: `server.js` line 741
- **Existing UI patterns**: cards with `#42945F` green, error banners `#FEF2F2`/`#DC2626`, modal backdrop at line 530

---

## Task 1: Add `/api/export-validate` endpoint in server.js

**Files:** `server.js`

**Action:**

Add a new route `POST /api/export-validate` between the existing `/api/export` (line 881) and `/api/export-zip` (line 885) routes.

This endpoint:
1. Accepts the exact same payload as `/api/export-zip`
2. Calls `buildExportHtml()` with the same args to produce `outputHtml`
3. Runs 5 validation checks against `outputHtml` using regex/cheerio
4. Returns JSON response: `{ passed: boolean, checks: [...] }`

**Validation checks (use cheerio on outputHtml):**

```js
const $ = cheerio.load(outputHtml, { decodeEntities: false });
const htmlStr = outputHtml; // raw string for regex

const checks = [
  {
    id: 'pixel',
    label: 'Meta Pixel',
    passed: /fbq\s*\(/.test(htmlStr) || /connect\.facebook\.net/i.test(htmlStr)
  },
  {
    id: 'preload',
    label: 'Script Preload',
    passed: $('link[rel="preload"]').length > 0 || /smartplayer-preload/i.test(htmlStr) || /preload/i.test(htmlStr.match(/<script[^>]*>[\s\S]*?<\/script>/gi)?.join('') || '')
  },
  {
    id: 'vturb',
    label: 'Player VTURB',
    passed: $('[id*="smartplayer"]').length > 0 || /smartplayer/i.test(htmlStr) || /converteai/i.test(htmlStr) || /vturb/i.test(htmlStr)
  },
  {
    id: 'delay',
    label: 'Delay de Revelacao',
    passed: /setTimeout[\s\S]*?\.esconder/i.test(htmlStr) || /data-vdelay="/i.test(htmlStr)
  },
  {
    id: 'checkout',
    label: 'Links de Checkout',
    passed: (function() {
      var found = false;
      $('a').each(function(_, el) {
        var href = $(el).attr('href') || '';
        var cls = $(el).attr('class') || '';
        var bottles = $(el).attr('data-bottles');
        if (/checkout|order|buy|clickbank|payment|hotmart|monetizze|eduzz|kiwify|pay\./i.test(href)) found = true;
        if (/buylink/i.test(cls)) found = true;
        if (bottles !== undefined) found = true;
      });
      return found;
    })()
  }
];
```

Return: `res.json({ passed: checks.every(c => c.passed), checks })`

**Verify:** `curl -s -X POST http://localhost:3000/api/export-validate -H 'Content-Type: application/json' -d '{"html":"<html><head></head><body></body></html>"}' | python3 -m json.tool` -- should return JSON with `passed: false` and all 5 checks with `passed: false`.

**Done:** Endpoint exists, returns correct JSON validation report for any payload.

---

## Task 2: Add validation modal UI and intercept export flow in index.html

**Files:** `public/index.html`

**Action:**

### 2A. Add CSS for validation modal (after line ~538, near existing `.modal-backdrop` styles)

Add styles for `.validation-modal`:

```css
/* Validation Modal */
.validation-backdrop {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
}
.validation-backdrop.open { opacity: 1; pointer-events: all; }
.validation-card {
  background: #fff; border-radius: 14px;
  width: 100%; max-width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  overflow: hidden;
}
.validation-header {
  padding: 20px 24px 12px;
  border-bottom: 1px solid #E5E7EB;
}
.validation-header h3 {
  margin: 0; font-size: 1.05rem; color: #111827;
}
.validation-body { padding: 16px 24px; }
.validation-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0;
  font-size: 0.88rem; color: #374151;
}
.validation-icon {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
}
.validation-icon.pass { background: #DCFCE7; color: #16A34A; }
.validation-icon.fail { background: #FEE2E2; color: #DC2626; }
.validation-msg {
  padding: 12px 16px; margin: 8px 0 0;
  border-radius: 8px; font-size: 0.82rem; font-weight: 500;
}
.validation-msg.success { background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; }
.validation-msg.error { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
.validation-footer {
  padding: 12px 24px 20px;
  display: flex; gap: 10px; justify-content: flex-end;
}
.validation-footer .btn { min-width: 120px; justify-content: center; }
```

### 2B. Add validation modal HTML (before closing `</body>`, near the existing preview modal)

```html
<!-- Validation Modal -->
<div class="validation-backdrop" id="validation-backdrop">
  <div class="validation-card">
    <div class="validation-header">
      <h3>Validacao Pre-Download</h3>
    </div>
    <div class="validation-body" id="validation-body">
      <!-- Populated by JS -->
    </div>
    <div class="validation-footer" id="validation-footer">
      <!-- Populated by JS -->
    </div>
  </div>
</div>
```

### 2C. Modify `doExport()` function (line 1633) to add validation step

Replace the current `doExport()` function. The new flow:

1. First call `/api/export-validate` with the same payload
2. Parse JSON response
3. Show validation modal with checklist
4. If all passed: modal shows green checklist + "Baixar ZIP" button
5. If any failed: modal shows red items + "Corrigir" button
6. "Baixar ZIP" button triggers the actual `/api/export-zip` call (existing download logic)
7. "Corrigir" button closes modal, re-enables export buttons

The new code structure:

```js
async function doExport() {
  if (!state.fetchedHtml) { showError('Nenhuma pagina foi extraida. Extraia primeiro.'); return; }
  clearError();
  setExportEnabled(false);
  if (btnExport)      btnExport.textContent      = 'Validando...';
  if (btnExportPanel) btnExportPanel.textContent = 'Validando...';

  try {
    // Build payload (same as before, lines 1641-1664)
    var payload = { /* ... same payload construction ... */ };

    // Step 1: Validate
    var valResponse = await fetchWithTimeout('/api/export-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 15000);

    if (!valResponse.ok) {
      var errData = await valResponse.json().catch(function() { return {}; });
      showError(errData.error || 'Erro ao validar pagina.');
      return;
    }

    var valResult = await valResponse.json();
    showValidationModal(valResult, payload);

  } catch (err) {
    showError('Falha de conexao ao validar. Verifique se o servidor esta rodando.');
  } finally {
    setExportEnabled(true);
    if (btnExport)      btnExport.textContent      = 'Gerar Pagina do Afiliado';
    if (btnExportPanel) btnExportPanel.textContent = 'Gerar Pagina do Afiliado';
  }
}

function showValidationModal(result, payload) {
  var backdrop = document.getElementById('validation-backdrop');
  var body = document.getElementById('validation-body');
  var footer = document.getElementById('validation-footer');

  var labels = {
    pixel: 'Meta Pixel',
    preload: 'Script Preload',
    vturb: 'Player VTURB',
    delay: 'Delay de Revelacao',
    checkout: 'Links de Checkout'
  };

  var html = '';
  result.checks.forEach(function(c) {
    html += '<div class="validation-item">';
    html += '<div class="validation-icon ' + (c.passed ? 'pass' : 'fail') + '">';
    html += c.passed ? '&#10003;' : '&#10007;';
    html += '</div>';
    html += '<span>' + (labels[c.id] || c.label) + '</span>';
    html += '</div>';
  });

  if (result.passed) {
    html += '<div class="validation-msg success">Tudo certo! Clique para baixar.</div>';
  } else {
    html += '<div class="validation-msg error">Atencao: corrija os itens marcados antes de baixar.</div>';
  }

  body.innerHTML = html;

  if (result.passed) {
    footer.innerHTML = '<button class="btn btn-ghost" id="val-cancel">Cancelar</button>'
      + '<button class="btn btn-primary" id="val-download">Baixar ZIP</button>';
    document.getElementById('val-download').addEventListener('click', function() {
      closeValidationModal();
      doActualDownload(payload);
    });
  } else {
    footer.innerHTML = '<button class="btn btn-primary" id="val-fix">Corrigir</button>';
  }

  // Close handlers
  var cancelBtn = document.getElementById('val-cancel');
  var fixBtn = document.getElementById('val-fix');
  if (cancelBtn) cancelBtn.addEventListener('click', closeValidationModal);
  if (fixBtn) fixBtn.addEventListener('click', closeValidationModal);
  backdrop.addEventListener('click', function(e) {
    if (e.target === backdrop) closeValidationModal();
  });

  backdrop.classList.add('open');
}

function closeValidationModal() {
  document.getElementById('validation-backdrop').classList.remove('open');
}

async function doActualDownload(payload) {
  setExportEnabled(false);
  if (btnExport)      btnExport.textContent      = 'Gerando ZIP...';
  if (btnExportPanel) btnExportPanel.textContent = 'Gerando ZIP...';

  try {
    var response = await fetchWithTimeout('/api/export-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 30000);

    if (!response.ok) {
      var errData = await response.json().catch(function() { return {}; });
      showError(errData.error || 'Erro ao gerar pagina. Tente novamente.');
      return;
    }

    var blob = await response.blob();
    var blobUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = 'pagina-afiliado.zip';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl);

  } catch (err) {
    showError('Falha de conexao ao exportar. Verifique se o servidor esta rodando.');
  } finally {
    setExportEnabled(true);
    if (btnExport)      btnExport.textContent      = 'Gerar Pagina do Afiliado';
    if (btnExportPanel) btnExportPanel.textContent = 'Gerar Pagina do Afiliado';
  }
}
```

**Important implementation notes:**

- The payload construction logic (lines 1641-1664 in current code) must be extracted into a helper function `buildExportPayload()` and reused in both `doExport()` and `doActualDownload()` to avoid duplication.
- Use `var` (not `const`/`let`) to match existing codebase style in the frontend JS.
- The `fetchWithTimeout` helper already exists in the codebase -- use it.
- Keep all existing button references (`btnExport`, `btnExportPanel`) and the `setExportEnabled()` helper.

**Verify:**

1. Start the server: `cd /Users/victorroque/Downloads/Extrator2000 && node server.js`
2. Open `http://localhost:3000` in browser
3. Extract a VSL page URL
4. Fill in all fields (pixel, preload, VTURB embed, checkout links, delay)
5. Click "Gerar Pagina do Afiliado"
6. Validation modal should appear with all 5 items checked green
7. Click "Baixar ZIP" -- ZIP should download
8. Now clear the Pixel field and click export again
9. Validation modal should show Pixel as red X, download should be blocked
10. Click "Corrigir" -- modal closes, user can fix the field

**Done:**
- Validation modal appears before every download
- 5 check items displayed with green check / red X icons
- All pass: "Tudo certo!" message + "Baixar ZIP" button works
- Any fail: "Atencao" message + "Corrigir" button returns to form
- No server.js changes needed beyond the new validate endpoint
- UI consistent with existing card/modal/button styling
