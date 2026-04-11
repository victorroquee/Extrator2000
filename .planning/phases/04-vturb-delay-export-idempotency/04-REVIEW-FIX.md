---
phase: 04-vturb-delay-export-idempotency
fixed_at: 2026-04-11T00:00:00Z
review_path: .planning/phases/04-vturb-delay-export-idempotency/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-04-11
**Source review:** .planning/phases/04-vturb-delay-export-idempotency/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: SSRF Bypass via IPv6 Loopback and Octal-Encoded IPs

**Files modified:** `server.js`
**Commit:** 6a6f93c
**Applied fix:** Added two new guards before the existing hostname checks: (1) reject any hostname starting with `[` to block IPv6 literals such as `[::1]`; (2) reject hostnames matching `/^[\d.]+$/` to block decimal/octal encoded IPs such as `2130706433` or `0177.0.0.1`. Node.js URL parsing returns `[::1]` (with brackets) for IPv6 literals, so the bracket-prefix check is reliable.

---

### WR-01: `onclick` URL Replacement Overwrites All URLs, Not Just Checkout URLs

**Files modified:** `server.js`
**Commit:** f030956
**Applied fix:** In both the selector-based path (line ~427) and the no-selector bulk path (line ~453), replaced the global `/https?:\/\/[^\s'"]+/g` replace with a first-match-only approach: extract the first URL with `.match()`, then replace only that specific URL string. This prevents analytics or tracking URLs in the same `onclick` attribute from being silently overwritten.

---

### WR-02: No-Selector Bulk Replacement Uses Only the First Link, Silently Discards Others

**Files modified:** `server.js`
**Commit:** 2a6598e
**Applied fix:** Added an explicit `console.warn` when `noSelector.length > 1`, informing operators that only the first no-selector entry will be applied and that CSS selectors should be used for multiple distinct checkout buttons. The platform-matching approach suggested in the review was not applicable because the payload contains no `originalHref` field to classify against. The single-winner behavior is preserved and now explicitly documented in both the warning and code comments.

---

### WR-03: `</body>` Case-Sensitivity Gap in Delay Injection

**Files modified:** `server.js`
**Commit:** 812d403
**Applied fix:** Replaced `outputHtml.includes('</body>')` + `outputHtml.replace('</body>', ...)` with `/<\/body>/i.test(outputHtml)` + `outputHtml.replace(/<\/body>/i, ...)`. The case-insensitive regex handles `</BODY>`, `</Body>`, and any other casing variant. Also removed the unnecessary `\/` escape in the `<\/script>` template literal (same block).

---

### WR-04: Zero-Delay Value Silently Becomes `null` Due to `|| null` Short-Circuit

**Files modified:** `server.js`, `public/index.html`
**Commit:** 4de9d68
**Applied fix:**
- `public/index.html` line 619: replaced `(data.summary.delaySeconds) || null` with an explicit null check `(data.summary.delaySeconds != null) ? data.summary.delaySeconds : null` so a value of `0` is preserved rather than coerced to `null`.
- `server.js` `buildExportHtml`: replaced `Number(delaySeconds) || 1` with `(delaySeconds !== null && delaySeconds !== undefined) ? Number(delaySeconds) : 1` so a zero value is passed through to `Math.max(1, ...)` rather than short-circuiting to `1` before the clamp.

---

_Fixed: 2026-04-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
