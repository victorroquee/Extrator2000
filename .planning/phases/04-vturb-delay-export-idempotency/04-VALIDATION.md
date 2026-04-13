---
phase: 4
slug: vturb-delay-export-idempotency
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for VTURB Delay + Export Idempotency.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node.js assertions (no framework) |
| **Config file** | none |
| **Quick run command** | `node test-integration.js` |
| **Full suite command** | `node test-integration.js && node test-delay-ui.js` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node test-integration.js`
- **After every plan wave:** Run `node test-integration.js && node test-delay-ui.js`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DELAY-01 | T-04-03 | `detectVturbDelay` returns null on absent block — no crash | unit | `node test-integration.js` | ✅ | ✅ green |
| 04-01-02 | 01 | 1 | DELAY-03 | T-04-01 | `safeDelay` clamped to Math.max(1,...) — no negative inject | unit | `node test-integration.js` | ✅ | ✅ green |
| 04-01-03 | 01 | 1 | EXPORT-06 | — | second export returns identical pixel count (=1) | unit | `node test-integration.js` | ✅ | ✅ green |
| 04-02-01 | 02 | 2 | DELAY-02 | T-04-05 | input min/max enforced; section hidden when no delay | DOM unit | `node test-delay-ui.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. jsdom added as devDependency for DELAY-02 DOM tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Section C.5 visible in real browser with live VSL page | DELAY-02 (supplemental) | Live external URL + running server required | Start `node server.js`, fetch a real VSL page with `displayHiddenElements` block, confirm section appears with correct value |
| ZIP download contains updated `var delaySeconds = N` | DELAY-03 (supplemental) | End-to-end ZIP download requires browser session | Change delay input, click export, inspect downloaded `index.html` |

---

## Validation Audit 2026-04-13

| Metric | Count |
|--------|-------|
| Gaps found | 1 (DELAY-02) |
| Resolved | 1 |
| Escalated | 0 |

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 3s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-13
