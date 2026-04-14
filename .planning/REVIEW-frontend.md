# Frontend Code Review — public/index.html

**Reviewed:** 2026-04-13  
**Depth:** Standard  
**File:** `public/index.html`  
**Lines reviewed:** 1–1784

---

## Summary

The frontend is a single-file vanilla JS SPA for VSL cloning. Overall structure is sound — the code follows consistent patterns, uses `escapeHtml`/`escapeAttr` helpers in the right places, and avoids the most obvious XSS sinks for user-controlled server data. However, there are several meaningful issues across security, bugs, and production-readiness:

- **1 HIGH security issue:** `state.fetchedUrl` is injected unsanitized into a `<base href>` tag via string concatenation, creating a stored XSS vector.
- **1 HIGH bug:** `setFetchLoading` is monkey-patched at runtime by re-assigning the variable after initial binding, which creates a fragile execution order dependency. A second fetch after error will call the patched version correctly, but the original reference bound inside `setExportEnabled` is stale.
- **3 MEDIUM bugs:** No double-submit guard on the Fetch button, no delay guard on Export (both buttons call `doExport` which re-enables itself via `finally`), and no `fetch` timeout — a hung server request will lock the UI indefinitely.
- **Several LOW issues:** Minor state consistency gaps, dead code, and missing input validation.

---

## HIGH Issues

---

### H-01: Unsanitized URL injected into `<base href>` — stored XSS

**File:** `public/index.html:1725`  
**Severity:** HIGH  
**Auto-fixable:** Yes

**Description:**  
`buildPreviewHtml()` injects `state.fetchedUrl` (the raw URL string typed by the user) directly into a `<base href="...">` HTML attribute via string concatenation, with no sanitization:

```js
// line 1725
var injected = html.replace(/(<head[^>]*>)/i, '$1<base href="' + state.fetchedUrl + '">');
html = (injected !== html) ? injected : '<base href="' + state.fetchedUrl + '">' + html;
```

A user who pastes `https://x.com" onerror="alert(1)` as the URL — or receives such a URL from a malicious link — will have the attribute broken and arbitrary HTML attributes injected into the `<base>` tag inside the preview iframe. Although the iframe has `sandbox="allow-scripts allow-same-origin"`, the injected blob still runs in the page's origin context and can access `window.parent` since `allow-same-origin` is set.

**Recommended fix:**

```js
function escapeAttrUrl(url) {
  // Allow only http/https schemes and escape double-quotes
  try {
    var parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href.replace(/"/g, '%22');
  } catch (e) { return ''; }
}

// In buildPreviewHtml():
var safeUrl = escapeAttrUrl(state.fetchedUrl);
if (safeUrl) {
  html = html.replace(/<base[^>]*>/gi, '');
  var injected = html.replace(/(<head[^>]*>)/i, '$1<base href="' + safeUrl + '">');
  html = (injected !== html) ? injected : '<base href="' + safeUrl + '">' + html;
}
```

---

### H-02: `setFetchLoading` monkey-patched via variable reassignment — fragile runtime state

**File:** `public/index.html:1523–1527`  
**Severity:** HIGH  
**Auto-fixable:** No (requires refactor)

**Description:**  
After `setFetchLoading` is defined as a plain function (line 1063), a block at lines 1523–1527 replaces the binding with a new closure that wraps the original:

```js
var _origSetFetchLoading = setFetchLoading;
setFetchLoading = function(loading) {
  _origSetFetchLoading(loading);
  if (loading) startAnalyzing();
};
```

This works only because both definitions are in the same `<script>` block and JS hoisting makes the function available. However this pattern is brittle: any future refactor that calls `setFetchLoading` before the monkey-patch line executes (e.g. moving sections into modules, lazy loading, or a second `<script>` block) will silently break the analyzing animation. The original `setFetchLoading` is also retained as a closure reference, meaning two references to "the loading function" exist after this point.

More concretely: `setExportEnabled` calls `btnFetch.disabled = loading` (via `_origSetFetchLoading`) but not `startAnalyzing()` — which is correct — but if anyone ever calls `setFetchLoading` from a new code path added later they'll need to know the monkey-patch exists.

**Recommended fix:**  
Fold `startAnalyzing()` call directly into the fetch click handler rather than monkey-patching the helper:

```js
// In the fetch click handler, replace setFetchLoading(true) with:
setFetchLoading(true);
startAnalyzing();   // explicit, co-located with the loading state change
```

Then remove the monkey-patch block entirely (lines 1523–1527).

---

## MEDIUM Issues

---

### M-01: No double-submit guard on the Fetch button

**File:** `public/index.html:1292–1384`  
**Severity:** MEDIUM  
**Auto-fixable:** Yes

**Description:**  
`setFetchLoading(true)` disables `btnFetch` at the start of the request. However, because `setFetchLoading` is patched at runtime (see H-02), if the monkey-patch fails silently for any reason the button remains enabled throughout the request and the user can submit multiple concurrent fetch requests. Even under normal operation, the button is re-enabled in `finally` before state is fully settled.

Additionally, `btnFetch.addEventListener('click', ...)` registers on the button itself but the Enter-key listener at line 1386 calls `btnFetch.click()` without checking `btnFetch.disabled`. On some browsers, `element.click()` fires even on `disabled` buttons depending on the element type (this is a `<button>`, not `<input type="submit">`, so `disabled` should prevent `.click()` — but it is worth being explicit).

**Recommended fix:**  
Add an explicit in-flight guard:

```js
let fetchInFlight = false;

btnFetch.addEventListener('click', async function() {
  if (fetchInFlight) return;
  var url = urlInput.value.trim();
  if (!url) { showError('...'); return; }
  fetchInFlight = true;
  clearError();
  setFetchLoading(true);
  try {
    // ... existing code ...
  } finally {
    setFetchLoading(false);
    fetchInFlight = false;
  }
});
```

---

### M-02: No fetch timeout — hung request locks UI indefinitely

**File:** `public/index.html:1299–1303`  
**Severity:** MEDIUM  
**Auto-fixable:** Yes

**Description:**  
The `fetch('/api/fetch', ...)` call (line 1299) and `fetch('/api/export-zip', ...)` call (line 1424) have no timeout. If the server hangs, stalls, or the network drops after the request is sent, the UI stays locked in loading state with no feedback and no way to abort, until the browser's default request timeout (which can be several minutes).

**Recommended fix:**  

```js
// Utility
function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, ms);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
    .finally(function() { clearTimeout(timer); });
}

// Usage:
var response = await fetchWithTimeout('/api/fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: url }),
}, 30000); // 30 s
```

Catch `AbortError` in the catch block:

```js
} catch (err) {
  if (err.name === 'AbortError') {
    showError('Tempo esgotado. A página demorou muito para responder.');
  } else {
    showError('Falha de conexão com o servidor...');
  }
  stopAnalyzing(false);
}
```

---

### M-03: Export does not guard against concurrent clicks

**File:** `public/index.html:1392–1453`  
**Severity:** MEDIUM  
**Auto-fixable:** Yes

**Description:**  
`doExport()` calls `setExportEnabled(false)` at the start and re-enables in `finally`. However, both `btnExport` and `btnExportPanel` trigger `doExport` independently. If the user clicks `btnExport` and then quickly clicks `btnExportPanel` before the first request completes (or vice versa), two concurrent export requests will be sent. The second call will enter `doExport`, find `state.fetchedHtml` still set (it is never cleared on export), and proceed normally.

**Recommended fix:**

```js
let exportInFlight = false;

async function doExport() {
  if (exportInFlight) return;
  exportInFlight = true;
  // ... existing code ...
  finally {
    exportInFlight = false;
    setExportEnabled(true);
    // restore button labels
  }
}
```

---

### M-04: `bundleTagHtml` is built without escaping `bundleLabel()` output

**File:** `public/index.html:1220–1221`  
**Severity:** MEDIUM  
**Auto-fixable:** Yes

**Description:**  
In `renderCheckoutInputs`, `bundleTagHtml` is constructed by calling `bundleLabel(link.bundle)` and inserting it raw into `div.innerHTML`:

```js
// line 1220
var bundleTagHtml = link.bundle
  ? '<span class="bundle-tag">' + bundleLabel(link.bundle) + '</span>'
  : '';
```

`bundleLabel()` returns hardcoded strings (`'2 Potes'`, `'3 Potes'`, `'6 Potes'`, or `null`) so this is not currently exploitable. However `link.bundle` comes from server JSON (`data.summary.checkoutLinks[].bundle`) and if a future server change passes a bundle value that does not match the three known values, `bundleLabel()` returns `null`, which becomes the string `"null"` in the DOM. Worse, if `bundleLabel` is ever extended to accept arbitrary data, the innerHTML path becomes an XSS sink.

**Recommended fix:**  
Wrap the result in `escapeHtml()` for defence-in-depth:

```js
var rawLabel = bundleLabel(link.bundle);
var bundleTagHtml = rawLabel
  ? '<span class="bundle-tag">' + escapeHtml(rawLabel) + '</span>'
  : '';
```

---

### M-05: No URL validation before submitting to `/api/fetch`

**File:** `public/index.html:1293–1294`  
**Severity:** MEDIUM  
**Auto-fixable:** Yes

**Description:**  
The only client-side validation before the fetch request is an empty-string check:

```js
var url = urlInput.value.trim();
if (!url) { showError('...'); return; }
```

No scheme check is performed. A user can submit `javascript:alert(1)`, `file:///etc/passwd`, or `ftp://internal-host` and the value is passed directly to the server in the POST body. While the server should also validate, the client should reject non-http(s) URLs before the request is made — both as UX feedback and as a second layer of defence.

**Recommended fix:**

```js
var url = urlInput.value.trim();
if (!url) { showError('Digite a URL da página VSL antes de extrair.'); return; }
try {
  var parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    showError('URL inválida. Use uma URL que começa com http:// ou https://');
    return;
  }
} catch (e) {
  showError('URL inválida. Verifique o endereço e tente novamente.');
  return;
}
```

---

## LOW Issues

---

### L-01: `escapeAttr` does not escape single quotes or backticks

**File:** `public/index.html:1241`  
**Severity:** LOW

**Description:**  
`escapeAttr` only replaces double-quotes:

```js
function escapeAttr(str) { return String(str).replace(/"/g, '&quot;'); }
```

It is used in `renderCheckoutInputs` for `value="..."` attributes (double-quoted), so in its current usage it is sufficient. However, as a general utility function it will not protect against attribute injection if it is ever reused in a single-quoted or unquoted attribute context. The missing characters are `'`, `` ` ``, and null bytes.

**Recommended fix:**  
Either restrict the function name to signal its limited scope (`escapeDoubleQuotedAttr`), or expand the replacement:

```js
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;');
}
```

---

### L-02: `state.fetchedHtml` is never cleared on a second fetch — stale preview possible

**File:** `public/index.html:1311` and `1392`  
**Severity:** LOW

**Description:**  
When the user fetches a second URL while the previous result is loaded, `state.fetchedHtml` is overwritten on success (line 1311). But during the request in-flight period, `state.fetchedHtml` still holds the previous page's HTML. If the user opens the preview modal during a re-fetch, `openModal()` (line 1731) will display the old page without any warning, because `if (!state.fetchedHtml) return` will pass.

Similarly, the Export button is re-enabled immediately after a successful fetch (line 1370), including during a second fetch if the first was successful. Combined with M-01 (no in-flight guard), this means a rapid second fetch followed immediately by Export could export the old HTML while state already reflects the new fetch's metadata (checkout links, delay, etc.).

**Recommended fix:**  
Clear `state.fetchedHtml` at the start of the fetch handler (alongside `clearError()`), and disable export until the new fetch completes:

```js
// At the top of the fetch click handler:
state.fetchedHtml = null;
setExportEnabled(false);
```

---

### L-03: `delay-seconds` input has no client-side max/min enforcement

**File:** `public/index.html:795–801`  
**Severity:** LOW

**Description:**  
The `<input type="number" id="delay-seconds" min="1" max="300">` has HTML attributes, but these are not enforced in `doExport`. The export payload validation only checks `>= 1`:

```js
// line 1411-1413
var delayVal = parseInt(delayInput.value, 10);
if (!isNaN(delayVal) && delayVal >= 1) {
  payload.delaySeconds = delayVal;
```

A user can manually type `99999` or `-1` (bypassing the HTML min/max), and `parseInt` will parse it. The value then goes to the server unconstrained.

**Recommended fix:**

```js
var delayVal = parseInt(delayInput.value, 10);
if (!isNaN(delayVal) && delayVal >= 1 && delayVal <= 300) {
  payload.delaySeconds = delayVal;
```

---

### L-04: `MutationObserver` on `scriptsListContainer` is never disconnected

**File:** `public/index.html:1705–1707`  
**Severity:** LOW

**Description:**  
A `MutationObserver` is created and attached to `scriptsListContainer` but never stored or disconnected:

```js
new MutationObserver(renderSlots).observe(scriptsListContainer, { childList: true });
```

For a single-page tool this is benign. However, `renderSlots` is called on every DOM child change inside the scripts container, including changes that `renderSlots` itself triggers (e.g., if `renderSlots` ever mutates `scriptsListContainer`). If that path is ever added, this will create an infinite observer loop.

**Recommended fix:**  
Store the observer reference so it can be disconnected if needed, and document the intent:

```js
var scriptsMutationObserver = new MutationObserver(renderSlots);
scriptsMutationObserver.observe(scriptsListContainer, { childList: true });
// Note: only observes childList — will not loop as long as renderSlots
// does not add/remove children from scriptsListContainer.
```

---

### L-05: External image loaded from hardcoded third-party URL in navbar

**File:** `public/index.html:653`  
**Severity:** LOW

**Description:**  
The navbar logo is loaded from an external production URL:

```html
<img src="https://affiliview-v2.vercel.app/og-logo.png" alt="OG Group" class="navbar-logo" />
```

This is a third-party asset dependency. If that domain changes ownership, removes the file, or adds tracking headers, all instances of this tool will be affected silently. This also means a network request is made to an external origin on every page load.

**Recommended fix:**  
Copy the image to `public/` and reference it as `/og-logo.png`, or embed it as a base64 data URI.

---

### L-06: `startAnalyzing` is called redundantly if `setFetchLoading` is invoked with `false` before being patched

**File:** `public/index.html:1523–1527`  
**Severity:** LOW

**Description:**  
The monkey-patched `setFetchLoading` calls `startAnalyzing()` whenever `loading === true`:

```js
setFetchLoading = function(loading) {
  _origSetFetchLoading(loading);
  if (loading) startAnalyzing();
};
```

There is no guard preventing `startAnalyzing()` from being called multiple times if `setFetchLoading(true)` is called more than once without an intervening `setFetchLoading(false)`. `startAnalyzing` re-renders the steps list from scratch and resets `analyzingStepIdx` to 0 each time, so concurrent calls would not cause visible breakage — but the `analyzingTimer` from the first call is not cleared before the second `advanceAnalyzing` chain begins, leaving a stale timer running. This is mitigated by H-02's recommended fix (remove the monkey-patch entirely).

---

### L-07: `checkout-empty-{i}` ID and `data-empty-index` attributes use positional index but no re-indexing occurs

**File:** `public/index.html:1210–1212`  
**Severity:** LOW

**Description:**  
When `renderCheckoutInputs` is called with an empty links array, it creates inputs with `id="checkout-empty-0/1/2"` and `data-empty-index="0/1/2"`. These are never re-rendered after the initial render (the fallback path). The `buildCheckoutPayload` function queries `input[data-empty-index]` to collect these values. If `renderCheckoutInputs` were ever re-called (e.g., on a second fetch with no detected links), the existing inputs would be replaced, losing any values the user had already typed. No data loss occurs in the current flow because the user must re-fetch to trigger a second render, but this is a fragile assumption.

---

## Summary Table

| ID   | Severity | Category       | Auto-fix | Description                                               |
|------|----------|----------------|----------|-----------------------------------------------------------|
| H-01 | HIGH     | Security/XSS   | Yes      | `fetchedUrl` injected raw into `<base href>` attribute    |
| H-02 | HIGH     | Bug/Reliability| No       | `setFetchLoading` monkey-patched via variable reassignment|
| M-01 | MEDIUM   | Bug/Production | Yes      | No double-submit guard on Fetch button                    |
| M-02 | MEDIUM   | Bug/Production | Yes      | No fetch timeout — hung request locks UI forever          |
| M-03 | MEDIUM   | Bug/Production | Yes      | Export allows concurrent double-submit                    |
| M-04 | MEDIUM   | Security/XSS   | Yes      | `bundleTagHtml` built without escaping `bundleLabel()`    |
| M-05 | MEDIUM   | Security/Input | Yes      | No URL scheme validation before submitting to `/api/fetch`|
| L-01 | LOW      | Security       | Yes      | `escapeAttr` does not escape single quotes or backticks   |
| L-02 | LOW      | Bug/State      | Yes      | `fetchedHtml` not cleared at start of re-fetch            |
| L-03 | LOW      | Bug/Validation | Yes      | `delay-seconds` max not enforced in export payload        |
| L-04 | LOW      | Quality        | No       | `MutationObserver` never disconnected or stored           |
| L-05 | LOW      | Quality/Deploy | No       | Navbar logo loaded from hardcoded external CDN URL        |
| L-06 | LOW      | Bug/Timer      | No       | Stale `analyzingTimer` if `setFetchLoading(true)` called twice |
| L-07 | LOW      | Bug/State      | No       | Positional checkout inputs lost on re-render              |

---

_Reviewed: 2026-04-13_  
_Reviewer: Claude (gsd-code-reviewer) — standard depth_
