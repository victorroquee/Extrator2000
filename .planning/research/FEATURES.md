# Feature Landscape — VSL Cloner v1.1

**Domain:** VSL page cloner for Brazilian digital marketing affiliates
**Researched:** 2026-04-11
**Milestone scope:** 3 additive features on top of existing v1.0 (fetch + clean + checkout + export)

---

## Existing feature baseline (already built)

- `/api/fetch`: fetch URL → clean HTML → detect checkout links → return JSON
- `/api/export` and `/api/export-zip`: apply pixel, VTURB embed, checkout replacements → download
- Frontend: sections B (header scripts), C (VTURB embed), D (checkout links), export button
- Export payload fields: `html`, `headerPixel`, `headerPreload`, `vslembed`, `checkoutLinks[]`

New features must extend this baseline without breaking it.

---

## Feature 1: Extra Scripts Tab

### What it is
A dedicated UI tab (or sub-section inside section B) allowing the affiliate to add N optional
additional `<script>` blocks. Each script is injected into `<head>` after the existing pixel
(i.e., after `headerPixel` and `headerPreload`).

### Table stakes (users expect this to work)

| Expectation | Reason |
|-------------|--------|
| Add multiple scripts independently | Affiliates use separate tags per platform: Meta Pixel, Google Tag, TikTok Pixel, Hotjar |
| Remove individual scripts | Mistakes happen; deleting one should not reset others |
| Ordering preserved | Scripts that depend on each other must fire in declared order |
| Scripts injected into `<head>` | Industry convention; body-injected pixels fire late and may miss PageView events |

### Differentiators (nice to have, not expected)

| Differentiator | Value |
|----------------|-------|
| Label/name per script | Helps affiliate identify "this is my TikTok pixel" vs "this is my heat map" |
| Drag-to-reorder | Makes dependency ordering visual; medium complexity |
| Collapse/expand | Keeps UI tidy when 4–6 scripts are present |

### Anti-features

| Anti-Feature | Reason |
|--------------|--------|
| Script validation / linting | Out of scope; affiliates paste raw vendor code that may use eval or odd syntax |
| Script type selector (module/text) | Overkill for this audience; they only paste inline tracking snippets |

### Complexity

**UI complexity:** Medium — dynamic list in vanilla JS, no framework. Pattern is a `+` button that
appends a new `<textarea>` row; a `x` button per row removes it. This is standard DOM manipulation,
well within vanilla JS scope.

**Server complexity:** Low — `buildExportHtml` already receives `headerPixel` and `headerPreload`.
Adding `extraScripts: string[]` to the payload is a one-liner: iterate and `$('head').append(s)`.

### Edge cases

1. **Zero scripts added** — payload sends `extraScripts: []`; server skips loop. No breakage.
2. **Script with `</script>` inside string literal** — cheerio `.append(rawString)` will parse this
   as closing the tag early. Mitigation: use `$.parseHTML()` carefully, or wrap in a comment. The
   safest path is to treat each extra script as raw HTML appended via `$('head').append(script)`.
   Because cheerio's `append()` parses the string as HTML, a `<script>` tag pasted verbatim works
   correctly as long as it is well-formed. Mal-formed inputs will silently break; acceptable for
   this tool because affiliates paste vendor-provided code.
3. **Duplicate scripts** — if the affiliate pastes the same Meta Pixel twice. No deduplication
   needed; this is the affiliate's responsibility.
4. **Very large scripts** — the existing 10 MB `express.json` limit covers this.
5. **Script order relative to `headerPixel`** — insertion order must be: `headerPixel` →
   `headerPreload` → `extraScripts[0]` → `extraScripts[1]` → ... This means `buildExportHtml`
   must append extra scripts last, after the two existing appends.

### Dependency on existing features

- Extends `buildExportHtml` function in `server.js` — add `extraScripts` param
- Extends export payload shape — add `extraScripts: string[]`
- Frontend section B is the logical home; either expand it or add a tab within it

---

## Feature 2: Bundle Images Detection and Replacement

### What it is
After fetching a VSL page, detect `<img>` tags that represent product bottles/potes inside
pricing/bundle sections. Show each detected image in the editor with a thumbnail preview and
an editable URL field. On export, replace all `src` occurrences of that URL (including in
duplicate bundle sections that repeat the same image).

### Table stakes

| Expectation | Reason |
|-------------|--------|
| Show detected product images with visual thumbnail | Affiliate needs to confirm which images were found |
| Editable URL per image | Affiliate wants to swap for their own product shots |
| Replace ALL occurrences on export | Bundle sections are often duplicated (e.g., one near player, one at bottom); must update all |
| Graceful when no images detected | Empty state with clear message, not a broken section |

### Differentiators

| Differentiator | Value |
|----------------|-------|
| Automatic bundle quantity labeling (2/3/6) | Helps affiliate orient which image goes to which card |
| Image upload (not just URL replace) | Out of scope v1.1 (confirmed in PROJECT.md); would require multipart upload |

### Anti-features

| Anti-Feature | Reason |
|--------------|--------|
| Image editing (crop, resize) | v2 scope per PROJECT.md |
| Color correction or background removal | Out of scope entirely |
| Uploading new images to the page assets | Requires ZIP asset management changes; defer |

### Detection: what selectors identify product images vs decorative images

This is the highest-complexity sub-problem. Evidence from the real `pagina-afiliado.html`
(JellyLean) shows two patterns:

**Pattern A — `<img>` inside a bundle anchor or pricing card:**
```html
<a class="buylink kit3" data-bottles="6" data-image="img-6-bottles.webp">
  <img src="assets/img/img-6-bottles.webp" alt="6 Bottles">
</a>
```
Images are direct children of a `<a>` or `<div>` that has bundle-quantity signals.

**Pattern B — `<img>` inside a section that contains checkout links:**
The bundle section wraps both the buy links AND the product images. An `<img>` is a bundle image
if it lives inside the same `section/div` ancestor that also contains a checkout-pattern URL.

**Pattern C — `data-image` attribute on the buy link anchor:**
JellyLean uses `data-image="img-6-bottles.webp"` on the `<a>` element itself — the image src
is referenced by attribute, not by an `<img>` tag directly present. The actual rendered image
may be injected by JS (`products.js` in that page). This is the hardest case: the `<img>` may
not exist in the static HTML at all.

**Recommended detection algorithm (server-side, cheerio):**

1. Find all ancestor containers that contain at least one checkout-pattern link (use existing
   `CHECKOUT_URL_PATTERNS`).
2. Within those containers, collect all `<img>` tags.
3. Filter out decorative images: skip `<img>` whose `src` contains `logo`, `icon`, `avatar`,
   `banner`, `bg`, `background`, `arrow`, `check`, `star`, `flag`, `seal`, `badge`. These are
   heuristics validated against common ClickBank VSL page structures.
4. Keep `<img>` whose `src` or `alt` contains keywords: `bottle`, `pote`, `frasco`, `kit`,
   `pack`, `produto`, `product`, `supplement`, or that are `data-image` attributes on buy anchors.
5. Deduplicate by `src` URL — the same image URL appearing in two identical bundle sections
   counts as one detected image, but replacement must be global.

**Alt-text is unreliable** — many pages omit `alt` or use generic values. Rely primarily on
proximity-to-checkout and filename keywords.

**False positives are low-risk here** — the affiliate sees thumbnails and can simply ignore/delete
entries that are not product images.

### Complexity

**Server complexity:** Medium — new detection function in `server.js`, returns array of
`{ src, alt, nearestBundleQty }`. Returned in `/api/fetch` response alongside `checkoutLinks`.

**Export/replacement complexity:** Low — on export, iterate `bundleImages[]`, for each entry
find all `<img src="[original]">` in the HTML and replace `src` with affiliate URL. Use
cheerio's `$('img[src="..."]').attr('src', newSrc)` — handles all occurrences including duplicates.

**UI complexity:** Medium — new section E with thumbnail grid. Each item has an `<img>` preview
(pointing to original URL) and a URL input. Thumbnail is just an `<img>` tag in the panel;
it loads the image from the original page's domain, which works because the affiliate just
fetched it.

### Edge cases

1. **Same image URL in multiple bundle sections** — deduplicated in detection, replaced globally
   on export. This is the core requirement.
2. **Relative vs absolute `src`** — the fetched and cleaned HTML may retain relative paths.
   The `/api/fetch` response already has the original URL; server should normalize `src` to
   absolute URLs during detection (same `resolveUrl()` helper already exists in `server.js`).
3. **Image served behind CDN with token query params** — URL matching must strip query params
   for deduplication, but write the full URL in the replacement. Use `new URL(src).pathname`
   for dedup key, store full `src` for display and replacement.
4. **No images in bundle sections** — return empty array, show "Nenhuma imagem de bundle
   detectada" in the panel. Do not crash.
5. **`data-image` only pattern (no actual `<img>` tag)** — cannot do thumbnail preview; can
   still surface the `data-image` value as an editable field and replace `data-image` attribute
   on export. Flag as LOW confidence detection in the UI (e.g., grey out thumbnail area with
   "Imagem carregada via JS").
6. **WebP/AVIF/SVG format** — thumbnails render natively in modern browsers via `<img src>`.
   No conversion needed.
7. **Image from original page domain blocked by CORS for thumbnail** — `<img>` tags are not
   CORS-restricted; they load from any domain fine for display purposes.

### Dependency on existing features

- Reuses `resolveUrl()` helper already in `server.js`
- Reuses `CHECKOUT_URL_PATTERNS` for proximity detection
- Extends `/api/fetch` response: add `bundleImages: [{ src, alt, bundleQty }]`
- Extends export payload: add `bundleImages: [{ originalSrc, affiliateSrc }]`
- Extends `buildExportHtml`: loop `bundleImages`, apply `$('img[src="..."]').attr()` for each

---

## Feature 3: VTURB Delay Block Detection and Editing

### What it is
Detect the VTURB "delay reveal" script block in the fetched HTML, extract the `delaySeconds`
value, show it as an editable number input, and on export rebuild the block with the new value.

The target block pattern:
```html
<style>.esconder { display: none; }</style>
<script>
  var delaySeconds = 10;
  var player = document.querySelector("vturb-smartplayer");
  player.addEventListener("player:ready", function() {
    player.displayHiddenElements(delaySeconds, [".esconder"], { persist: true });
  });
</script>
```

Confirmed real-world presence: `pagina-afiliado.html` (JellyLean) contains
`<div class="esconder" style="display: none;">` — this is the hidden content that the player
reveals after `delaySeconds`. The script block was cleaned during fetch (because it contains
`vturb` keyword in `SCRIPT_REMOVE_KEYWORDS`). This is a CRITICAL edge case — see below.

### Table stakes

| Expectation | Reason |
|-------------|--------|
| Extract the current delay value (seconds) | Affiliate needs to know what the original was |
| Editable number input | Affiliate may want 15s instead of 10s |
| On export, rebuild the complete block with new value | All three parts must survive: `.esconder` style, the script, the `.esconder` div content |
| Show "not detected" gracefully | Not all pages use this pattern |

### Differentiators

| Differentiator | Value |
|----------------|-------|
| Keep the `.esconder` class name editable | Rare need; not table stakes |
| Support multiple delay blocks | Some pages have 2 reveal sections; Medium complexity |

### Anti-features

| Anti-Feature | Reason |
|--------------|--------|
| Allow arbitrary JS editing of the delay script | Security footgun; affiliates only need the number |
| CSS selector list editing | Only power users need this; overkill for v1.1 |

### Complexity

**Detection complexity:** Medium — need to parse the script content for `var delaySeconds = N`.
This must happen BEFORE the cleanup pass, or the delay script must be excluded from cleanup.

**Export complexity:** Low once detection is solved — string template reconstruction is trivial.

**UI complexity:** Low — a single number input with a label.

### CRITICAL EDGE CASE: Current cleanup removes the delay block

The existing `cleanHtml()` in `server.js` removes any script whose content includes `vturb`
(line 132: `SCRIPT_REMOVE_KEYWORDS` includes `'vturb'` and `'smartplayer'`). The delay script
contains `"vturb-smartplayer"` in `document.querySelector("vturb-smartplayer")`, which triggers
removal.

**Consequence:** By the time `/api/fetch` returns `html`, the delay block is already gone.
The delay information is lost before it can be extracted.

**Two valid solutions:**

**Option A — Extract before clean (recommended):**
Run delay block detection on `rawHtml` before `cleanHtml()` is called. Store extracted
`{ delaySeconds, fullBlock }` in the fetch response. The `html` field remains fully cleaned
(delay block removed). On export, inject the rebuilt block back (with affiliate's chosen seconds).

Pros: Clean separation. Server detects once, client edits the value, export rebuilds.
Cons: Block content must be reconstructed on export (not a raw pass-through).

**Option B — Whitelist the delay script from cleanup:**
In `cleanHtml()`, skip removal if the script matches the `displayHiddenElements` pattern.
The block stays in the HTML. The client receives it in the raw `html` and detects it client-side
or via a second parse.

Cons: Breaks the "remove all vturb scripts" contract. The delay script has a hard dependency
on the affiliate's VTURB player being present, so it must be rebuilt anyway with the affiliate's
player ID — keeping the original script is wrong.

**Recommended approach: Option A.** Extract `{ delaySeconds, rawDelayBlock }` from `rawHtml`,
return in the fetch response, inject rebuilt template on export.

### Detection pattern (server-side)

```javascript
// Detect delay block in rawHtml BEFORE cleanHtml()
function detectVturbDelay(html) {
  // Match the style + script pair
  const match = html.match(
    /var\s+delaySeconds\s*=\s*(\d+)[\s\S]*?displayHiddenElements/
  );
  if (!match) return null;
  return { delaySeconds: parseInt(match[1], 10) };
}
```

The `.esconder` style block is a separate `<style>` tag. It is NOT removed by `cleanHtml()`
(only `<script>` tags are cleaned, not `<style>` tags). So `.esconder { display: none; }` will
survive in the output HTML. Only the `<script>` part needs to be reconstructed on export.

**Export reconstruction template:**
```javascript
function buildDelayScript(seconds) {
  return `<script>
var delaySeconds = ${seconds};
var player = document.querySelector("vturb-smartplayer");
player.addEventListener("player:ready", function() {
  player.displayHiddenElements(delaySeconds, [".esconder"], { persist: true });
});
</script>`;
}
```

This is injected into `<head>` or just before `</body>` on export, after the VTURB embed.
Correct placement: after the VTURB player embed code, because it references
`document.querySelector("vturb-smartplayer")` which must exist in the DOM when the script runs.
Placing it in `<head>` with `defer` or at end of `<body>` both work; end of `<body>` is safer.

### Edge cases

1. **Script not found** — `delaySeconds` input not shown. Export proceeds without injecting
   delay block. No error.
2. **Multiple `delaySeconds` declarations** — rare, take the first match.
3. **Delay block uses `let`/`const` instead of `var`** — regex must cover all three:
   `(?:var|let|const)\s+delaySeconds\s*=\s*(\d+)`.
4. **Non-integer delay (e.g., `10.5`)** — use `parseFloat`, show as decimal in input, rebuild
   as number. Fractional seconds are valid in VTURB API.
5. **Player selector is not `"vturb-smartplayer"`** — some pages use `"smart-player"` or a
   custom ID. Detection should capture the selector string too: return
   `{ delaySeconds, playerSelector }` so the export template can use the correct selector.
6. **`.esconder` class name differs** — some pages use `.hidden`, `.reveal-section`. Detection
   should capture the class name array from `displayHiddenElements` call, store it, and replay
   it verbatim in the rebuilt script. Don't hardcode `.esconder`.
7. **`displayHiddenElements` call is not the VTURB pattern** — false positive detection. The
   regex must require both `delaySeconds` variable AND `displayHiddenElements` call in the same
   script block. Use a multiline match scoped to one `<script>` tag, not the full document.

---

## Table Stakes vs Differentiators — Cross-Feature Summary

| Feature | Table Stakes | Differentiators | Deferred |
|---------|-------------|-----------------|---------|
| Extra Scripts | Dynamic list add/remove, head injection, ordering preserved | Labels per script, collapse/expand | Drag reorder, validation |
| Bundle Images | Detection + thumbnail + URL edit + global replace on export | Auto bundle-qty label | Upload, image edit |
| VTURB Delay | Extract value → editable input → rebuild on export | Multiple delay blocks | CSS selector editing |

---

## Feature Dependencies on Existing Code

| New Feature | Existing Dependency | Change Required |
|-------------|--------------------|-----------------| 
| Extra Scripts | `buildExportHtml()` | Add `extraScripts: string[]` param |
| Extra Scripts | Export API payload | Add `extraScripts` field |
| Bundle Images | `/api/fetch` response | Add `bundleImages[]` to response |
| Bundle Images | `buildExportHtml()` | Add `bundleImages` param, loop replacements |
| Bundle Images | `resolveUrl()` helper | Reuse as-is |
| Bundle Images | `CHECKOUT_URL_PATTERNS` | Reuse as-is for proximity detection |
| VTURB Delay | `cleanHtml()` call order | Detect BEFORE calling cleanHtml |
| VTURB Delay | `/api/fetch` handler | Add pre-clean detection step |
| VTURB Delay | `/api/fetch` response | Add `vturbDelay: { delaySeconds, playerSelector, hiddenClasses }` |
| VTURB Delay | Export payload | Add `vturbDelay` field |
| VTURB Delay | `buildExportHtml()` | Inject rebuilt delay script near `</body>` |

---

## Phase Ordering Recommendation

Given the dependencies above, the natural implementation order is:

1. **VTURB Delay** — server-only, touches existing fetch handler in a well-isolated way.
   Server change (extract before clean) + new response field + export reconstruction.
   No UI complexity except one number input.

2. **Extra Scripts** — server is trivial; UI is the complexity. Tab/list DOM manipulation
   in vanilla JS, new payload field. Does not require changes to detection logic.

3. **Bundle Images** — most detection complexity. New cheerio detection algorithm, new
   response fields, thumbnail UI, global replace on export. Should come after VTURB delay
   so the codebase is stable before the largest addition.

---

## Sources

- Codebase inspection: `/Users/victorroque/Downloads/Extrator2000/server.js` (direct read)
- Codebase inspection: `/Users/victorroque/Downloads/Extrator2000/public/index.html` (direct read)
- Real VSL sample: `/Users/victorroque/Downloads/Extrator2000/pagina-afiliado.html` (JellyLean ClickBank page)
- Project context: `/Users/victorroque/Downloads/Extrator2000/.planning/PROJECT.md` (direct read)
- Confidence for all findings: HIGH — based on direct codebase inspection, no external sources needed for this feature research
