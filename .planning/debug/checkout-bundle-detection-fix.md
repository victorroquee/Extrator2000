---
status: fixed
trigger: "Phase 7 — checkout buttons are all getting the same bundle label (6 potes) and the same CSS selector is being generated for buttons with the same CSS class, causing the wrong affiliate link to be applied to all buttons on export."
created: 2026-04-14
updated: 2026-04-14
slug: checkout-bundle-detection-fix
---

# Debug Session: checkout-bundle-detection-fix

## Symptoms

- **Expected:** Each checkout button (2 potes, 3 potes, 6 potes) gets its own correct bundle label in the editor; export applies each affiliate link only to the matching button
- **Actual:** All buttons show the same bundle label (6 potes) OR no label; export applies one link to all buttons regardless of bundle
- **Errors:** None — silent wrong behavior
- **Timeline:** Present since implementation; detection never worked correctly for same-class buttons
- **Reproduction:** Fetch any VSL page with multiple checkout buttons sharing the same CSS class; observe all get same bundle or same selector

## Suspected Root Causes

1. `buildCssSelector` in `server.js` returns `tag.firstClass` — identical for all buttons with the same class
2. `detectBundle` uses `$(el).closest('section,div,p,td,li')` context — too broad, may include text from other bundle sections

## Current Focus

hypothesis: "buildCssSelector returns same selector for all same-class buttons AND detectBundle context grabs too-wide a parent"
test: "Read server.js detectCheckoutLinks + buildCssSelector + detectBundle; inspect what context text is built for each button"
expecting: "Confirmed: selector is non-unique; context contains cross-bundle text"
next_action: "apply fix"

## Evidence Gathered

### Issue #1: Non-unique selectors (server.js:99-109)
```javascript
function buildCssSelector($, el) {
  const tag = el.name;
  const id = $(el).attr('id');
  if (id) return `${tag}#${id}`;
  const cls = $(el).attr('class');
  if (cls) {
    const first = cls.trim().split(/\s+/)[0];
    return `${tag}.${first}`;  // ❌ SAME for all same-class buttons
  }
  return tag;
}
```
**Problem**: All buttons with class="btn-checkout" get selector `button.btn-checkout` → non-unique → export applies one link to ALL.

### Issue #2: Too-broad context (server.js:247)
```javascript
const parentText = $(el).closest('section, div, p, td, li').first().text().trim();
```
**Problem**: `.closest()` may grab a parent `<section>` or `<div>` that contains ALL bundle buttons (2 potes, 3 potes, 6 potes) → `parentText` includes text from other bundles → wrong bundle detected.

### Root Cause Confirmed
Both suspected issues are present in the code exactly as hypothesized.

## Fix Strategy

1. **Make selectors unique**: Add nth-of-type index when class-based selector would be non-unique
2. **Narrow context**: Use only the button's immediate parent, not `.closest()` traversal

## Fix Applied

### Change 1: buildCssSelector now tracks used selectors (server.js:99-120)
- Added `usedSelectors` parameter (Set)
- When a class-based selector is already used, append `:nth-of-type(N)` based on sibling index
- Example: `button.btn-checkout` → `button.btn-checkout:nth-of-type(2)` for second button

### Change 2: detectCheckoutLinks uses narrow context (server.js:234-258)
- Changed from `.closest('section, div, p, td, li')` to `.parent()` (immediate parent only)
- Passes `usedSelectors` Set to `buildCssSelector` for uniqueness tracking
- Context now limited to button text + immediate parent text only

## Next Steps

1. **Test**: Fetch a VSL page with multiple same-class checkout buttons (e.g., 2/3/6 potes)
2. **Verify**: Each button gets unique selector and correct bundle label
3. **Validate export**: Confirm each affiliate link applies only to matching button
