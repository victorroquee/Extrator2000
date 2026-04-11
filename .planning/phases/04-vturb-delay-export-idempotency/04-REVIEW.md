---
phase: 04-vturb-delay-export-idempotency
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - server.js
  - public/index.html
  - test-integration.js
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 4 introduced `detectVturbDelay`, extended `/api/fetch` to surface delay metadata,
added idempotency sentinel (`data-vsl-injected`) to `buildExportHtml`, wired delay
injection into both export routes, and added a delay editor UI in `index.html`.

Overall the implementation is structurally sound. The idempotency sentinel is correct,
the pre-clean/post-clean ordering of `detectVturbDelay` vs `cleanHtml` is intentional
and safe, and the test coverage for DELAY-01/DELAY-03/EXPORT-06 paths is adequate.

One pre-existing SSRF bypass (IPv6 loopback / octal-encoded IP) remains critical.
Four warning-level issues were found: an overly broad `onclick` URL replacement, a
silent single-winner selection for no-selector checkout links, a `</BODY>` case
sensitivity gap, and a `0 || null` short-circuit that masks a zero-delay value. Three
info items round out the review.

---

## Critical Issues

### CR-01: SSRF Bypass via IPv6 Loopback and Octal-Encoded IPs

**File:** `server.js:279-298`
**Issue:** The private-address blocklist in `/api/fetch` only checks string-prefix patterns
against the hostname. It does not block:
- IPv6 loopback: `http://[::1]/`, `http://[::ffff:127.0.0.1]/`
- Octal-encoded IPv4: `http://0177.0.0.1/` (octal for 127.0.0.1)
- Decimal-encoded IPv4: `http://2130706433/` (decimal for 127.0.0.1)

An attacker can supply any of these to reach loopback services on the host.

**Fix:**
```js
// After parsing, resolve the hostname to an IP (or check for bracket-notation IPv6)
// and apply a numeric range check instead of string prefix matching.
// Simplest safe approach: reject any bracket-enclosed address (IPv6) and known
// numeric encodings, or use a library such as `is-ip` + `ipaddr.js`.

// Immediate minimal patch — add to the existing hostname checks:
if (hostname.startsWith('[')) {           // IPv6 literal
  return res.status(400).json({ error: 'IPv6 addresses are not allowed' });
}
// Reject pure-numeric hostnames that could be decimal/octal IP encoding
if (/^[\d.]+$/.test(hostname) && hostname !== /* known-safe public IP */ '') {
  return res.status(400).json({ error: 'Numeric IP addresses are not allowed' });
}
```

---

## Warnings

### WR-01: `onclick` URL Replacement Overwrites All URLs, Not Just Checkout URLs

**File:** `server.js:419`
**Issue:** Inside `applyCheckoutLinks`, when a matched element has an `onclick`
attribute, the regex `/https?:\/\/[^\s'"]+/g` replaces *every* URL in that attribute
with `affiliateHref`, not only the checkout URL. An `onclick` that contains an
analytics ping URL in addition to the checkout URL would have the analytics URL
silently overwritten.

```js
// Current (line 419):
$2(el).attr('onclick', ($2(el).attr('onclick') || '').replace(/https?:\/\/[^\s'"]+/g, affiliateHref));
```

**Fix:**
```js
// Replace only the URL that matched the checkout pattern, not every URL:
const oldOnclick = $2(el).attr('onclick') || '';
const checkoutUrlMatch = oldOnclick.match(/https?:\/\/[^\s'"]+/);
if (checkoutUrlMatch) {
  $2(el).attr(
    'onclick',
    oldOnclick.replace(checkoutUrlMatch[0], affiliateHref)
  );
}
```
The same pattern applies to the no-selector path at line 441.

---

### WR-02: No-Selector Bulk Replacement Uses Only the First Link, Silently Discards Others

**File:** `server.js:439`
**Issue:** When `checkoutLinks` entries have no `selector`, the bulk-replacement loop
(lines 430-444) matches all checkout anchors but always replaces them with
`noSelector[0].affiliateHref`. If the user provided multiple no-selector affiliate
links for different checkout buttons, only the first is applied — the rest are silently
ignored with no error or warning.

```js
// Current (line 439):
const affiliateHref = noSelector[0].affiliateHref || noSelector[0].affiliateUrl;
```

**Fix:** Either document that only one no-selector link is supported and expose that
constraint in the UI, or match each no-selector link to the same checkout-platform
pattern that was used to detect it:

```js
// For each matched anchor, pick the no-selector entry whose original href
// platform matches, falling back to the first.
const affiliateHref = (
  noSelector.find(l => classifyPlatform(href || onclick) === classifyPlatform(l.originalHref))
    || noSelector[0]
).affiliateHref || noSelector[0].affiliateUrl;
```

---

### WR-03: `</body>` Case-Sensitivity Gap in Delay Injection

**File:** `server.js:495-499`
**Issue:** The delay `<script>` tag is injected with
`outputHtml.replace('</body>', ...)`. JavaScript `String.prototype.replace` is
case-sensitive. If the source page uses `</BODY>` or `</Body>`, the match fails and
the delay script is appended *after* all tags (malformed HTML fallback path, line 499),
which may break browser parsing.

```js
// Current (line 495-497):
if (outputHtml.includes('</body>')) {
  outputHtml = outputHtml.replace('</body>', `${delayTag}\n</body>`);
}
```

**Fix:**
```js
// Use a case-insensitive regex replace instead:
if (/<\/body>/i.test(outputHtml)) {
  outputHtml = outputHtml.replace(/<\/body>/i, `${delayTag}\n</body>`);
} else {
  outputHtml += delayTag;
}
```

---

### WR-04: Zero-Delay Value Silently Becomes `null` Due to `|| null` Short-Circuit

**File:** `server.js:337`, `public/index.html:619`
**Issue:** In `/api/fetch` the response is built as:

```js
// server.js line 337:
delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
```

And in `index.html` the client stores it as:

```js
// index.html line 619:
state.delaySeconds = (data.summary && data.summary.delaySeconds) || null;
```

If a page has `var delaySeconds = 0` (zero-second delay — edge case, but parseable),
`delayInfo.delaySeconds` is `0`, `data.summary.delaySeconds` is `0`, and
`0 || null` evaluates to `null`. The delay section would not be shown and `hasDelay`
would still be `true`, producing an inconsistency where `state.hasDelay === true` but
`state.delaySeconds === null`.

The same short-circuit exists server-side in `buildExportHtml` line 489:
`Number(delaySeconds) || 1` would clamp a zero server-supplied value to 1 silently.

**Fix:**
```js
// index.html: use explicit null check instead of truthiness
state.delaySeconds = (data.summary && data.summary.delaySeconds != null)
  ? data.summary.delaySeconds
  : null;

// server.js buildExportHtml line 489: use explicit check
const safeDelay = Math.max(1, Math.round(
  (delaySeconds !== null && delaySeconds !== undefined) ? Number(delaySeconds) : 1
));
```

---

## Info

### IN-01: Hardcoded Assertion Count in Test Suite Will Drift

**File:** `test-integration.js:174`
**Issue:** `const total = 24;` is a manually maintained magic number. When assertions
are added or removed, this count requires a parallel manual update. A mismatch causes
misleading "PASSED X/24" output even if the actual pass rate differs.

**Fix:**
```js
// Count dynamically instead:
const total = /* count of assert() calls */ ; // or track with a counter variable
// Simpler: remove `total` and just report failures.length === 0.
const passed = total - failures.length;
// →
// if (failures.length > 0) { ... } else { console.log(`PASSED all assertions`); }
```

---

### IN-02: `delayScriptContent.replace()` Replaces Only the First Occurrence

**File:** `server.js:490-492`
**Issue:** `String.prototype.replace` with a regex (no `g` flag) replaces only the
first match. If for any reason the original delay script body contains two
`var delaySeconds = N` declarations, only the first is updated.

```js
// Current (line 491):
const rebuilt = delayScriptContent.replace(
  /(?:var|let|const)\s+delaySeconds\s*=\s*\d+(?:\.\d+)?/,
  `var delaySeconds = ${safeDelay}`
);
```

This is low risk in practice (degenerate input), but adding the `g` flag or using
`replaceAll` would make the intent explicit.

---

### IN-03: Unnecessary Escape in Template Literal Tag String

**File:** `server.js:494`
**Issue:** `<\/script>` inside a template literal — the backslash before `/` is
unnecessary. In a template literal (backtick string) there is no parser rule that
would treat `</script>` as closing anything; the escape is leftover from when this
might have been an inline HTML string literal. It is harmless but misleading.

```js
// Current (line 494):
const delayTag = `<script>\n${rebuilt}\n<\/script>`;
// Cleaner:
const delayTag = `<script>\n${rebuilt}\n</script>`;
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
