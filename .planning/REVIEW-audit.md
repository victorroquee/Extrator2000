---
reviewed: 2026-04-22T00:00:00Z
depth: deep
files_reviewed: 2
files_reviewed_list:
  - server.js
  - public/index.html
findings:
  critical: 5
  warning: 7
  info: 3
  total: 15
status: issues_found
---

# VSL Cloner: Security & Reliability Audit

**Reviewed:** 2026-04-22
**Depth:** Deep (cross-file, concurrency, multi-tenant)
**Files Reviewed:** 2 (server.js, public/index.html)
**Context:** 200+ affiliates using this simultaneously

---

## Critical Issues

### CR-01: SSRF Bypass via DNS Rebinding and Redirect-Based Attacks

**File:** `server.js:758-785`
**Issue:** The SSRF protection validates the hostname at request time, but `axios.get` follows up to 10 redirects (`maxRedirects: 10`). An attacker can provide a URL that initially resolves to a public IP, then redirects to `http://169.254.169.254/latest/meta-data/` (cloud metadata endpoint) or internal services. The DNS check happens before the request, but the redirect target is never validated.

Additionally, the numeric IP check (`/^[\d.]+$/.test(hostname)`) does not cover:
- Hex-encoded IPs like `0x7f000001`
- IPv6 mapped addresses like `::ffff:127.0.0.1` (non-bracket form in some URL parsers)
- Domain names that resolve to private IPs (no DNS resolution check at all)

**Fix:**
```javascript
// Option 1: Disable redirects and validate each hop manually
const response = await axios.get(url, {
  maxRedirects: 0, // handle redirects manually
  validateStatus: (status) => status >= 200 && status < 400,
  timeout: 30000,
  // ...
});

// Option 2 (simpler): Use a DNS lookup to resolve the hostname and check
// the resolved IP before making the request
const dns = require('dns').promises;
const { address } = await dns.lookup(parsed.hostname);
if (isPrivateIP(address)) {
  return res.status(400).json({ error: 'Resolved to private IP' });
}
```

### CR-02: Unbounded Memory Growth — No Limits on uploadSessions and bundleImageStore

**File:** `server.js:853, 863`
**Issue:** `uploadSessions` and `bundleImageStore` are unbounded in-memory Maps. With 200+ concurrent users, each uploading folders with up to 200 files at 10MB each, a single session can consume up to 2GB of memory. There is no cap on the number of active sessions. The cleanup interval only runs every 5 minutes, so a burst of uploads within a 5-minute window can exhaust server memory and crash the process.

The `bundleImageStore` has the same problem with 5MB images per entry and no session count limit.

**Fix:**
```javascript
const MAX_SESSIONS = 100;
const MAX_SESSION_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per session

app.post('/api/upload-folder', folderUpload.array('files', 200), async function(req, res) {
  // Reject if too many active sessions
  if (uploadSessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server busy. Try again in a few minutes.' });
  }

  // Track total size and enforce per-session limit
  let totalSize = 0;
  for (const file of files) {
    totalSize += file.buffer.length;
    if (totalSize > MAX_SESSION_SIZE_BYTES) {
      return res.status(413).json({ error: 'Upload too large.' });
    }
  }
  // ... rest of logic
});
```

### CR-03: ReDoS Vulnerability in Product Name and Color Replacement

**File:** `server.js:1253-1255, 1288-1289`
**Issue:** User-supplied `productNameOld` and `colorReplacements[].oldColor` values are used to construct `new RegExp(escaped, 'gi')` and then applied against potentially large HTML strings. While the values are escaped with `escapeRegExp`, the real issue is that this runs synchronously against HTML that can be up to 10MB. With 200+ concurrent requests, each doing multiple regex replacements on megabytes of HTML, this blocks the Node.js event loop and creates a denial-of-service condition.

This is not a traditional ReDoS (the patterns are literal), but the synchronous regex scan of multi-megabyte strings is still dangerous for concurrency.

**Fix:**
```javascript
// Use string split/join for literal replacements instead of regex on large strings
function replaceAll(str, search, replacement) {
  return str.split(search).join(replacement);
}

// For case-insensitive: use a streaming approach or limit HTML size for replacements
// At minimum, cap the size of HTML that gets regex-replaced:
if (outputHtml.length > 2 * 1024 * 1024) {
  console.warn('[export] Skipping color/name replacement — HTML too large');
} else {
  // proceed with replacements
}
```

### CR-04: XSS via headerPixel / extraScripts Injection into Elementor JSON

**File:** `server.js:1108-1121`
**Issue:** `headerPixel`, `headerPreload`, `vslembed`, and `extraScripts` are injected directly into the output HTML without any sanitization. While this is the intended functionality (affiliates inject their own tracking scripts), the Elementor JSON export (`/api/export-elementor`) packages this into a JSON file that other WordPress users import. If a malicious affiliate crafts a payload with XSS payloads, the resulting Elementor JSON could compromise the WordPress site that imports it.

The `data-vsl-injected` guard (line 1102) only prevents double-injection, not malicious content.

**Fix:**
This is an inherent design tension (the tool's purpose is to inject arbitrary scripts), but at minimum:
```javascript
// Validate that extraScripts content looks like legitimate script tags, not HTML injection
extraScripts.forEach(function(scriptContent) {
  if (typeof scriptContent !== 'string') return;
  // Reject payloads that try to close script and inject other HTML
  if (/<\/script\s*>[\s\S]*<(?!script)/i.test(scriptContent)) {
    console.warn('[export] Suspicious extraScript content — possible injection');
    return; // skip this script
  }
  // ... proceed with injection
});
```
Consider adding a warning in the UI that Elementor JSON exports should only be imported on trusted WordPress installations.

### CR-05: No Request-Level Timeout for Async Route Handlers — Unhandled Slow Requests Leak Memory

**File:** `server.js:750, 887, 1633, 1783`
**Issue:** The `/api/fetch`, `/api/upload-folder`, `/api/export-zip`, and `/api/export-elementor` routes perform multiple async operations (HTTP fetches, CSS inlining, image dimension fetching) but have no overall request timeout. If a target server is slow (responds in 29 seconds per CSS file), and the page has 10 CSS files, a single `/api/export-elementor` request can hang for nearly 5 minutes while holding a response object open and blocking resources.

With 200 concurrent users, this can exhaust the server's connection pool and memory.

**Fix:**
```javascript
// Add request-level timeout middleware
function requestTimeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Request timed out' });
      }
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    next();
  };
}

app.post('/api/fetch', requestTimeout(60000), async (req, res) => { ... });
app.post('/api/export-elementor', requestTimeout(120000), async (req, res) => { ... });
```

---

## Warnings

### WR-01: Upload Session Not Deleted on Failure — Orphaned Session Memory Leak

**File:** `server.js:1689`
**Issue:** The upload session is only deleted in the `res.on('finish')` callback. If the ZIP archive errors (line 1659) or the client disconnects before finishing, the session remains in memory until the 30-minute TTL expires. With 200 users and failed exports, this can accumulate hundreds of MB of orphaned buffers.

**Fix:**
```javascript
// Also clean up on error/close
res.on('close', function() { uploadSessions.delete(uploadSessionId); });
archive.on('error', function(err) {
  uploadSessions.delete(uploadSessionId);
  console.error('[export-zip] archive error:', err);
  if (!res.headersSent) res.status(500).end();
});
```

### WR-02: Archive Error Handler Calls res.destroy() — May Crash Without Error Handling

**File:** `server.js:1658-1660, 1745-1747`
**Issue:** `res.destroy(err)` is called when the archiver emits an error, but no error handler is attached to `res`. If headers are already sent (streaming has started), calling `res.destroy()` without proper error handling can cause an unhandled error. More importantly, there is no try/catch around `archive.finalize()` — if it throws, the async route handler's rejected promise is unhandled by Express.

**Fix:**
```javascript
archive.on('error', (err) => {
  console.error('[export-zip] archive error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Failed to create ZIP' });
  } else {
    res.end(); // gracefully end the response
  }
});

try {
  await archive.finalize();
} catch (err) {
  console.error('[export-zip] finalize error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Failed to finalize ZIP' });
  }
}
```

### WR-03: No Global Uncaught Exception / Unhandled Rejection Handler

**File:** `server.js` (entire file)
**Issue:** There is no `process.on('uncaughtException')` or `process.on('unhandledRejection')` handler. If any async operation throws without a try/catch (and there are several `async` route handlers), the entire Node.js process will crash, taking down all 200+ users' active sessions.

**Fix:**
```javascript
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // Optionally: graceful shutdown
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
```

### WR-04: Race Condition in CHECKOUT_URL_PATTERNS — Stateful Regex with Global Flag

**File:** `server.js:61-73` used at `server.js:262, 1067`
**Issue:** `CHECKOUT_URL_PATTERNS` is an array of regex objects, some with the `i` flag. While they use `.test()` which does reset `lastIndex` for non-global regexes, the real concern is that these same regex objects are shared across all concurrent requests. Currently the regexes do NOT have the `g` flag, so this is safe. However, this is fragile — if anyone adds `/g` to any pattern in the future, it will cause intermittent test failures across concurrent requests because `.test()` on global regexes advances `lastIndex`.

**Fix:** Add a comment or use a function that creates fresh regex instances:
```javascript
// IMPORTANT: Do NOT add the 'g' flag to these patterns.
// They are shared across concurrent requests and .test() on global
// regexes maintains state (lastIndex), causing race conditions.
const CHECKOUT_URL_PATTERNS = [ ... ];
```

### WR-05: detectCheckoutLinks Uses $(el).attr('data-vturb') After Element Removal

**File:** `server.js:161`
**Issue:** In the `cleanHtml` function, the loop at line 158 iterates over `scriptsToRemove` and checks `$(el).attr('data-vturb')` at line 161 AFTER calling `$(el).remove()` at line 159. Once an element is removed from the DOM via cheerio, attribute access on it may return undefined. This means the `vslDetected = true` condition at line 162 may fail to trigger even when the script had `data-vturb`.

**Fix:**
```javascript
for (const { el, src, content } of scriptsToRemove) {
  // Check attributes BEFORE removal
  const hadVturb = $(el).attr('data-vturb') !== undefined;
  $(el).remove();
  scriptsRemoved++;
  if (src.includes('vturb') || content.includes('vturb') || hadVturb) {
    vslDetected = true;
  }
}
```

### WR-06: parseImageDimensions Buffer Overread on Malformed Images

**File:** `server.js:290-337`
**Issue:** The JPEG parser at line 321 reads `buffer.readUInt16BE(offset + 2)` to get the segment length. If a malformed JPEG has a segment length that points past the end of the buffer, `buffer.readUInt16BE(offset + 5)` and `buffer.readUInt16BE(offset + 7)` at line 325 will throw a `RangeError`, which is caught by the caller's try/catch. However, `buffer.readUInt32BE(16)` for PNG at line 295 will also throw on a truncated PNG where `buffer.length >= 30` but < 24. The `buffer.length < 30` guard at line 291 is insufficient for PNG (needs at least 24 bytes to read width/height).

This won't crash the server (caught in `fetchImageDimensions`), but it produces unnecessary error noise.

**Fix:**
```javascript
// PNG: need at least 24 bytes
if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer.length >= 24) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
```

### WR-07: Frontend innerHTML Usage Without Sanitization

**File:** `public/index.html:2488-2490`
**Issue:** In `doActualDownloadElementor()`, the fetched HTML is injected into a temporary DOM element via `tmp.innerHTML = state.fetchedHtml`. While this is done to extract the `<title>` tag, the `state.fetchedHtml` comes from a cloned external page and could contain malicious scripts. Although the `<div>` is never appended to the document, some browsers may still execute scripts or load resources embedded in the injected HTML.

**Fix:**
```javascript
// Use DOMParser instead — scripts are not executed in parsed documents
var parser = new DOMParser();
var doc = parser.parseFromString(state.fetchedHtml || '', 'text/html');
var titleTag = doc.querySelector('title');
if (titleTag) pageTitle = titleTag.textContent.trim();
```

---

## Info

### IN-01: Duplicate Code Between URL Fetch and Folder Upload Handlers (Frontend)

**File:** `public/index.html:1962-2078` and `public/index.html:2086-2212`
**Issue:** The `btnFetch` click handler and `btnUpload` click handler contain nearly identical post-processing logic (130+ lines duplicated). If a bug is fixed in one path, the other is easily forgotten.

**Fix:** Extract the shared post-processing into a function like `processAnalysisResult(data, sourceUrl, uploadSessionId)` and call it from both handlers.

### IN-02: escapeAttr Function Is Incomplete

**File:** `public/index.html:1905`
**Issue:** The `escapeAttr` function only escapes double quotes. For robust attribute escaping, `&`, `<`, `>`, and single quotes should also be escaped. The function is used at line 1894 for checkout link `href` values which come from the server.

**Fix:**
```javascript
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

### IN-03: bundleImageStore Entries Never Cleaned After Serving

**File:** `server.js:1863-1870, 1889-1895`
**Issue:** Unlike `uploadSessions` which are deleted after ZIP export (line 1689), `bundleImageStore` entries are only cleaned by the 5-minute interval timer. After the affiliate downloads their page, the uploaded bundle images remain in memory for up to 30 minutes unnecessarily. For 200 users uploading multiple bundle images, this wastes memory.

**Fix:** Delete the `bundleImageStore` entry after the export is finalized, or reduce the TTL to match the expected usage window.

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
