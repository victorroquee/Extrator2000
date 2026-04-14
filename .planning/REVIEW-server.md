# Code Review: server.js

**Reviewed:** 2026-04-13
**Depth:** standard
**File:** `server.js` (832 lines)
**Status:** issues_found

---

## Summary

The server is a Node.js/Express app that fetches external VSL pages, strips trackers, and injects affiliate assets. The core logic is solid and has meaningful SSRF mitigations already in place. However, several HIGH severity issues remain: the SSRF blocklist is bypassable via DNS rebinding and 172.16–31 range gaps; the `/api/export` and `/api/export-zip` routes accept raw HTML + script payloads with no validation — effectively a stored-XSS/script-injection vector from the server's own origin; and `delayScriptContent` is echoed verbatim into the output HTML without any sanitization. There are also medium-severity issues around missing rate limiting, an incorrect `172.x` CIDR block check, and unbounded asset-download loops. Auto-fixable items are marked.

---

## HIGH Issues

### H-01: SSRF — `172.x` private range check is too broad (auto-fixable)

**File:** `server.js:425`
**Issue:** The blocklist checks `hostname.startsWith('172.')`, which blocks `172.0.x` through `172.255.x`. The actual RFC-1918 private range is only `172.16.0.0/12` (172.16–172.31). This means `172.32.x` through `172.255.x` are legitimate public IPs that are incorrectly blocked, while the check is simultaneously weaker than it looks because it relies purely on a string prefix rather than a parsed octet range. In the other direction, there is no DNS-rebinding protection — the hostname check happens once before the TCP connection is opened, so an attacker-controlled DNS record that resolves to `127.0.0.1` at connection time bypasses all checks.

**Fix (precise octet check, auto-fixable):**
```js
// Replace line 425:
hostname.startsWith('172.')
// With:
/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
```
For DNS rebinding, the only reliable mitigation is to resolve the hostname to an IP before the axios call and re-check the resolved IP against the blocklist. That requires a `dns.lookup()` call and is a manual change.

---

### H-02: `/api/export` injects raw `headerPixel`, `headerPreload`, `vslembed`, and `extraScripts` from the request body directly into the output HTML without validation

**File:** `server.js:611–636` (`buildExportHtml`), called from `server.js:715–729`
**Issue:** The export endpoint accepts arbitrary HTML/JS payloads from the client body and appends them verbatim to `<head>`. While this is an internal tool used by a single affiliate, the architectural risk is:
- If the tool is ever exposed to multiple users or hosted, any user can craft requests that inject arbitrary `<script>` tags, exfiltrate other users' session data, or modify the page in unexpected ways.
- `extraScripts` items that do not start with `<script` are auto-wrapped in `<script>` tags (line 633), making it trivially easy to inject executable JS by posting a plain string.
- There is zero input validation on `headerPixel`, `headerPreload`, `vslembed`, or `extraScripts` — not even a length cap.

**Fix:**
At a minimum add a length guard and Content-Security-Policy on the HTML download response. For multi-user scenarios, restrict these fields to a known-safe allowlist or require authentication.
```js
// At the top of /api/export and /api/export-zip:
const MAX_INJECT_LEN = 64 * 1024; // 64 KB each
if (headerPixel && headerPixel.length > MAX_INJECT_LEN) return res.status(400).json({ error: 'headerPixel too large' });
if (vslembed   && vslembed.length   > MAX_INJECT_LEN) return res.status(400).json({ error: 'vslembed too large' });
// etc.
```

---

### H-03: `delayScriptContent` from the client request body is echoed verbatim into the output `<script>` block

**File:** `server.js:694–707` (`buildExportHtml`)
**Issue:** `delayScriptContent` is accepted from `req.body` (line 717) and injected as a raw `<script>` block into the output HTML (line 701). The only transformation is a single regex substitution for the `delaySeconds` variable; everything else in that script block is passed through unchanged. An attacker-supplied `delayScriptContent` containing `</script><script>alert(1)</script>` will break out of the injected block and execute arbitrary JS in the context of the downloaded page. Since the exported page is served with `Content-Disposition: attachment`, the immediate risk is limited to what the browser does on open — but many browsers execute scripts in locally opened files.

**Fix:**
The server should reconstruct the delay script block itself rather than round-tripping the original script content from the client:
```js
// Instead of rebuilding from delayScriptContent, emit a minimal, server-controlled block:
if (delayType === 'js' && delaySeconds !== undefined) {
  const safeDelay = Math.max(1, Math.round(Number(delaySeconds)));
  const delayTag = `<script>\nvar delaySeconds = ${safeDelay};\ndisplayHiddenElements(delaySeconds);\n</script>`;
  // ... inject delayTag
}
```
If the full original script body is genuinely needed, it must be validated as originating from the server's own `/api/fetch` extraction, not from a client-supplied value.

---

## MEDIUM Issues

### M-01: No rate limiting on any endpoint

**File:** `server.js:397, 715, 734`
**Issue:** All three POST routes (`/api/fetch`, `/api/export`, `/api/export-zip`) have no rate limiting. `/api/fetch` makes an outbound HTTP request on behalf of the caller; without a rate limit this server can be used as an open HTTP proxy for abuse (DDoS amplification, content scraping at scale). `/api/export-zip` downloads and bundles up to N external assets per call — an attacker can trigger hundreds of parallel asset downloads with a single crafted payload.

**Fix (auto-fixable with `express-rate-limit`):**
```js
const rateLimit = require('express-rate-limit');
const fetchLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Too many requests' });
app.post('/api/fetch', fetchLimiter, async (req, res) => { ... });
```

---

### M-02: Asset download loop in `/api/export-zip` has no global timeout or total-asset cap

**File:** `server.js:756–771`
**Issue:** `collectAssets` can return an unbounded number of URLs from the HTML. The batch loop (line 756) downloads them 5 at a time with a 15-second per-request timeout, but there is no cap on total assets or wall-clock time. A page with 500 asset URLs would result in 100 sequential batches, holding the response open for up to 25 minutes (500/5 × 15 s). This can exhaust server connections and memory.

**Fix:**
```js
const MAX_ASSETS = 100;
const entries = [...assets.entries()].slice(0, MAX_ASSETS);
```
Also consider a global `Promise.race` with a wall-clock timeout for the entire asset-fetch phase.

---

### M-03: `pageUrl` in `/api/export-zip` is not validated against the same SSRF blocklist used in `/api/fetch`

**File:** `server.js:750–790`
**Issue:** `pageUrl` is accepted from `req.body` (line 735) and used directly as the base URL for resolving relative asset paths and making outbound requests. It is never validated. An attacker can supply `pageUrl: "http://169.254.169.254/"` (AWS metadata endpoint) and the asset-collection code will resolve and attempt to download relative paths against it.

**Fix (auto-fixable):** Extract the SSRF validation from `/api/fetch` into a shared `validatePublicUrl(url)` helper and call it on `pageUrl` at the top of `/api/export-zip`.

---

### M-04: `archive.on('error')` cannot send a 500 after headers are sent — connection may hang silently

**File:** `server.js:797–800`
**Issue:** Headers (including `Content-Type: application/zip`) are set and `archive.pipe(res)` is called at line 801 before any archive content is written. If `archive.finalize()` throws or the pipe fails after streaming has begun, the `if (!res.headersSent)` guard on line 799 will be false, so the error is swallowed and the client receives a truncated, corrupt ZIP with no error indication.

**Fix:**
```js
archive.on('error', (err) => {
  console.error('[export-zip] archive error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'ZIP generation failed' });
  } else {
    res.destroy(err); // forcibly close the connection so the client sees a network error
  }
});
```

---

### M-05: `CHECKOUT_URL_PATTERNS` contains overly broad patterns that will false-positive on many legitimate links

**File:** `server.js:62–65`
**Issue:** The patterns `/\/checkout/i`, `/\/buy/i`, `/\/order/i`, `/\/purchase/i` match any URL containing those path segments — including e.g. `https://example.com/about-our-order-process` or `https://shop.com/buy-2-get-1`. This causes legitimate navigation links to be misclassified as checkout links and potentially replaced with affiliate URLs, corrupting the output page.

**Fix:** Add word-boundary anchors and/or require the segment to appear at a path boundary:
```js
/\/checkout(?:[/?#]|$)/i,
/\/buy(?:[/?#]|$)/i,
/\/order(?:[/?#]|$)/i,
/\/purchase(?:[/?#]|$)/i,
```

---

## LOW Issues

### L-01: `req.body` size limit of 10 MB applies to JSON payloads, but `/api/export` and `/api/export-zip` can receive large `html` + `delayScriptContent` blobs close to that limit simultaneously

**File:** `server.js:13`
**Issue:** The 10 MB limit (`express.json({ limit: '10mb' })`) is applied globally. The `/api/export` route accepts `html` (can be several MB), `headerPixel`, `vslembed`, `delayScriptContent`, and `extraScripts` all in the same request. The combined payload could reach the limit even for legitimate use, while the limit itself is high enough to allow large memory allocations per request (10 MB body → cheerio parses it → multiple string copies during injection).

**Recommendation:** Lower the global limit to 2 MB and accept that very large pages may need to be chunked, or keep 10 MB but add a per-field length cap as noted in H-02.

---

### L-02: `buildCssSelector` generates unstable selectors that break across requests

**File:** `server.js:98–108`
**Issue:** When an element has no `id`, `buildCssSelector` uses the first CSS class name to build a selector like `a.btn-checkout`. This selector may match dozens of unrelated elements on the page, causing `applyCheckoutLinks` to overwrite links that were not checkout links. Furthermore, the selector is generated from the fetched page's DOM and then re-applied to a freshly loaded cheerio instance of the cleaned HTML — if cleaning changes the DOM structure, the selector may no longer match, silently skipping the replacement.

**Recommendation:** Include a positional index (`nth-of-type`) or persist the detected href as the matching key instead of a CSS selector.

---

### L-03: `detectBundle` iterates `BUNDLE_KEYWORDS` using `Object.entries` on an object with numeric keys — key ordering is implementation-defined for non-integer-coerced keys, but works by accident here

**File:** `server.js:90–95`
**Issue:** `BUNDLE_KEYWORDS` keys are `2`, `3`, `6` (numeric strings). V8 sorts integer-indexed object keys in ascending order, so iteration order happens to be `2 → 3 → 6`. If a keyword were ever added that matches multiple bundles, the first numeric key wins — which is the intended behavior. However, the code comment does not document this ordering dependency, and using a `Map` with explicit insertion order would be safer and self-documenting.

**Recommendation:** Low priority. Document the ordering assumption or convert to a `Map`.

---

### L-04: Dead reference in `scriptToRemove` iteration — `$(el).attr('data-vturb')` after `el` has been removed

**File:** `server.js:141`
**Issue:** After `$(el).remove()` is called on line 139, line 141 calls `$(el).attr('data-vturb')` on the same removed element. Cheerio allows attribute reads on detached nodes, so this does not throw, but the intent (detecting vturb from the removed element) happens to work only because cheerio preserves attribute data on detached nodes. It is fragile and misleading.

**Fix (auto-fixable):** Read the attribute before removing the element, or use the already-captured values from `scriptsToRemove`:
```js
for (const { el, src, content } of scriptsToRemove) {
  const dataVturb = $(el).attr('data-vturb'); // read BEFORE remove
  $(el).remove();
  scriptsRemoved++;
  if (src.includes('vturb') || content.includes('vturb') || dataVturb !== undefined) {
    vslDetected = true;
  }
}
```

---

### L-05: `assetLocalPath` fallback uses `Date.now()` as a filename, producing non-deterministic output

**File:** `server.js:514`
**Issue:** When URL parsing fails, the fallback `assets/asset_${Date.now()}` produces a different filename on every run. Two identical failing URLs called in the same batch could theoretically collide (same millisecond), and the non-determinism makes testing difficult.

**Fix (auto-fixable):** Use a monotonic counter instead:
```js
let assetCounter = 0;
// ...
return `assets/asset_${++assetCounter}`;
```

---

### L-06: `console.warn` in `applyCheckoutLinks` leaks internal selector strings to server logs

**File:** `server.js:564`
**Issue:** `console.warn(`[export] invalid selector skipped: ${link.selector}`)` logs user-supplied selector strings verbatim. If a user crafts a malicious selector string containing control characters or sensitive data, it appears in logs. Low risk in a local tool, but worth sanitizing for hosted deployments.

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
