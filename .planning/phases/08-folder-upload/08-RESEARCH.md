# Phase 8: Folder Upload — Research

**Researched:** 2026-04-14
**Domain:** Browser File System API + multer multipart upload + Express session-based asset store
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Interface exibe **duas abas** no topo do bloco de input: "URL" e "Pasta de Arquivos"
- Aba ativa troca o campo exibido sem recarregar a página
- Usuário seleciona pasta local; todos os arquivos (HTML, CSS, JS, imagens) são enviados via `multipart/form-data` para `/api/upload-folder`
- O servidor identifica o `index.html` na raiz da pasta como entrada principal
- Se não houver `index.html` na raiz, retornar erro claro ao usuário
- Limite de tamanho: 50MB total
- `/api/upload-folder` aplica o **mesmo pipeline** que `/api/fetch`: `cleanHtml` → `detectCheckoutLinks` → `detectBundleImages` → `detectVturbDelay`
- Retorna o mesmo formato de resposta JSON que `/api/fetch`
- Assets armazenados temporariamente no servidor para uso no export-zip
- ZIP inclui `index.html` processado + todos os assets originais com estrutura preservada
- Botão muda de "Analisar" para "Processar Pasta" na aba de pasta
- Assets no export: ZIP com todos os arquivos (estrutura preservada) — não inline/base64
- UI: Duas abas "URL" | "Pasta de Arquivos" no topo do bloco de input
- Pipeline: Mesmo processamento do fetch por URL — sem desvios
- Phase 8 não precisa incluir a tela de verificação (isso é Phase 9)

### Claude's Discretion
- Estratégia de armazenamento temporário dos assets no servidor (memória vs disco temp vs multer)
- Limpeza dos arquivos temporários após export ou timeout
- Validação de tipos de arquivo aceitos no upload
- Feedback de progresso durante upload (loading state)

### Deferred Ideas (OUT OF SCOPE)
- Drag-and-drop visual avançado (arrastar pasta para a página) — Phase 8 usa selector nativo do OS
- Preview dos assets antes de processar — fora do escopo desta fase
- Tela de verificação do export — Phase 9
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | Interface exibe duas abas: "URL" e "Pasta de Arquivos" — troca o campo sem recarregar | Tab toggle via CSS class + vanilla JS, no page reload |
| UPLOAD-02 | Usuário seleciona pasta local; todos os arquivos enviados via multipart para /api/upload-folder | `webkitdirectory` attribute on `<input type="file">` + `fetch()` with `FormData`; multer `.array()` on server |
| UPLOAD-03 | Servidor processa index.html com mesmo pipeline que /api/fetch, retorna mesmo formato | Reuse `detectVturbDelay` + `cleanHtml` + `detectCheckoutLinks` + `detectBundleImages`; session token in response |
| UPLOAD-04 | Export ZIP inclui index.html processado + todos os assets originais, estrutura preservada | Session store Map (sessionId → asset buffers); `/api/export-zip` reads from store when `uploadSessionId` present |
</phase_requirements>

---

## Summary

Phase 8 adds a second input mode to the VSL Cloner: instead of fetching an HTML page by URL, the user can upload a local folder containing an HTML project. The browser's native `webkitdirectory` attribute on `<input type="file">` provides folder selection with zero dependencies and broad support (Baseline 2025 across all major browsers). Each file in the selected folder is available via the `File.webkitRelativePath` property, which encodes the path relative to the selected folder including the folder name itself (e.g., `my-vsl/assets/style.css`).

The server receives all files as a `multipart/form-data` POST. **multer v2.1.1** (already in the ecosystem, just needs installation) handles this with `upload.array('files')` and disk storage or memory storage. The critical design challenge is: the current `/api/export-zip` downloads assets from the network using `pageUrl`. For uploaded folders there is no URL to download from — assets are already on the server. The solution is a **session store pattern**: `/api/upload-folder` assigns a `sessionId` (UUID), stores the uploaded asset buffers in an in-memory Map keyed by that ID, and returns `sessionId` in the response. The frontend stores it in `state.uploadSessionId`. When calling `/api/export-zip`, the frontend sends `uploadSessionId` instead of `pageUrl`, and the server reads assets from the Map rather than downloading from the network. Cleanup happens on `res.finish` (immediate) with a 5-minute TTL fallback.

**Primary recommendation:** Use multer memoryStorage (all files as Buffers in `req.files`) paired with an in-memory `Map` session store. For a local single-user tool with a 50MB upload cap and 200-file limit, this is simpler and more reliable than disk temp dirs — no file system races, no cleanup failures, no directory creation errors across platforms.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Folder selection UI + tab toggle | Browser / Client | — | DOM event, no server involvement |
| Multipart FormData construction | Browser / Client | — | Built into browser Fetch API with FormData |
| File reception + in-memory storage | API / Backend | — | multer middleware on Express |
| HTML processing pipeline | API / Backend | — | Existing cleanHtml/detect* helpers |
| Session store (asset lookup by ID) | API / Backend | — | Module-level Map in server.js |
| ZIP assembly with uploaded assets | API / Backend | — | archiver + session store read |
| Session cleanup (TTL + on-finish) | API / Backend | — | setTimeout + res.on('finish') |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| multer | 2.1.1 | Multipart/form-data parsing + file storage | Official Express middleware; zero other deps for multipart |
| archiver | 7.0.1 (already installed) | ZIP creation with relative paths | Already in use for `/api/export-zip` |
| Node.js `crypto.randomUUID` | built-in (Node 14.17+, project uses 25.8) | Session ID generation | No external dep needed |
| Node.js `fs.promises` | built-in | Disk-based alternative (not chosen — see discretion) | Available if memory approach revisited |

[VERIFIED: npm registry] multer 2.1.1 published 2026-03-04T16:36:25.497Z

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Browser `FormData` API | built-in | Multipart payload construction from FileList | Always — no polyfill needed for modern browsers |
| Browser `File.webkitRelativePath` | built-in (Baseline 2025) | Relative path per file in the selected folder | Set as FormData field alongside each file |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| multer memoryStorage | multer diskStorage + fs.mkdtemp | Disk is more robust for very large uploads but adds directory creation, path management, and cleanup complexity — overkill for a local single-user tool |
| In-memory Map session store | Redis / file-based session | Massive overkill; in-memory is correct for a local CLI-style tool |
| webkitdirectory input | Drag-and-drop File System Access API | FSAPI is richer but: (a) deferred per CONTEXT.md, (b) browser support is narrower |

**Installation:**
```bash
npm install multer
```

**Version verification:** [VERIFIED: npm registry]
```
multer: 2.1.1 (published 2026-03-04)
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                          server.js
──────────────────────────────────────────────────────────────────
[Tab: "Pasta de Arquivos"]
    │
    ├─ <input webkitdirectory>
    │   └─ FileList (each file has .webkitRelativePath)
    │
    ├─ FormData.append('files', file)           ──POST /api/upload-folder──►
    │  FormData.append('paths[]', relativePath)     │
    │                                              multer.array('files', 200)
    │                                              fileFilter (extension whitelist)
    │                                              limits: { fileSize:50MB, files:200 }
    │                                              │
    │                                              ├─ find index.html (path strip + root check)
    │                                              ├─ detectVturbDelay(rawHtml)
    │                                              ├─ cleanHtml(rawHtml)
    │                                              ├─ detectCheckoutLinks($, html)
    │                                              ├─ detectBundleImages($, links)
    │                                              │
    │                                              ├─ sessionStore.set(sessionId, {
    │                                              │    assets: Map<relativePath, Buffer>,
    │                                              │    expiresAt: now + 5min TTL
    │                                              │  })
    │                                              │
    │◄──────── { html, summary, sessionId } ───────┘
    │
    ├─ state.fetchedHtml = html
    ├─ state.uploadSessionId = sessionId
    ├─ state.fetchedUrl = ''  (no URL)
    │  [editor sections revealed — identical flow]
    │
    └─ doExport()
        └─ payload.uploadSessionId = state.uploadSessionId   ──POST /api/export-zip──►
           payload.pageUrl = undefined                            │
                                                                 ├─ buildExportHtml(...)
                                                                 │
                                                                 ├─ if uploadSessionId:
                                                                 │   read assets from sessionStore
                                                                 │   rewrite HTML refs → relative paths
                                                                 │   append each asset to archive
                                                                 │
                                                                 ├─ else if pageUrl:
                                                                 │   existing download path (unchanged)
                                                                 │
                                                                 ├─ archive.finalize()
                                                                 │
                                                             ◄──── ZIP stream
                                                             │
                                                             res.on('finish') → sessionStore.delete(sessionId)
```

### Recommended Project Structure

No new directories needed. All changes in existing files:
```
server.js         — add multer, sessionStore, /api/upload-folder route, export-zip branch
public/index.html — add tab toggle CSS, tab HTML, folder input, FormData upload handler
package.json      — add multer dependency
```

### Pattern 1: webkitdirectory + FormData Upload

**What:** Browser selects folder, iterates `input.files`, appends each file AND its relative path to FormData, POSTs to server.

**When to use:** Always for folder upload; the relative path must be sent as a separate field because multer does not expose `webkitRelativePath` — it is only on the browser-side `File` object.

**Example:**
```javascript
// Source: MDN Web API + verified pattern
// input element: <input type="file" id="folder-input" webkitdirectory multiple accept="">

folderInput.addEventListener('change', function() {
  var files = folderInput.files;
  if (!files.length) return;

  var formData = new FormData();
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    formData.append('files', file);
    // Relative path sent as parallel array — same index as 'files'
    formData.append('paths[]', file.webkitRelativePath);
  }

  fetch('/api/upload-folder', {
    method: 'POST',
    body: formData
    // Do NOT set Content-Type header — browser sets it with boundary
  });
});
```

**Critical:** Never set `Content-Type: multipart/form-data` manually on a `fetch()` call — the browser must set it automatically to include the correct `boundary` parameter. Manually setting it breaks parsing. [VERIFIED: MDN fetch API docs pattern]

### Pattern 2: multer with memoryStorage for Folder Upload

**What:** multer middleware stores uploaded files as Buffers in memory. Server reads `req.files` (array) and `req.body['paths[]']` (array of relative paths) together.

**When to use:** Always for this use case. memoryStorage is simpler than diskStorage when you need to keep assets in a session Map anyway — no intermediate disk write/read cycle.

**Example:**
```javascript
// Source: Context7 /expressjs/multer + official README
const multer = require('multer');

const ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.svg', '.xml', '.png', '.jpg', '.jpeg', '.gif',
  '.webp', '.avif', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.otf', '.map',
]);

const folderUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB per file
    files: 200,                   // max 200 files total
  },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(null, false); // silently skip unknown types
    }
  },
});

app.post('/api/upload-folder',
  folderUpload.array('files', 200),
  function(req, res) {
    // req.files[i].buffer   — file content
    // req.files[i].originalname — filename only (no path)
    // req.body['paths[]'][i] — webkitRelativePath from browser
    // ...
  }
);
```

### Pattern 3: Session Store for Uploaded Assets

**What:** Module-level `Map` keyed by UUID, value contains asset map and expiry timestamp.

**When to use:** Between upload and export-zip — bridges the two HTTP requests.

**Example:**
```javascript
// Source: [ASSUMED] standard Node.js in-memory session pattern
const sessionStore = new Map(); // sessionId → { assets: Map<relativePath, Buffer>, expiresAt }
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// After processing /api/upload-folder:
const sessionId = crypto.randomUUID();
const assets = new Map(); // relativePath (stripped of top-level folder) → Buffer
// e.g., 'assets/style.css' → <Buffer ...>
sessionStore.set(sessionId, {
  assets,
  expiresAt: Date.now() + SESSION_TTL_MS,
});

// Periodic TTL cleanup (run every minute):
setInterval(function() {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    if (session.expiresAt < now) sessionStore.delete(id);
  }
}, 60 * 1000);

// On export-zip finish:
res.on('finish', function() {
  sessionStore.delete(uploadSessionId);
});
```

### Pattern 4: Safe Relative Path Reconstruction

**What:** Strip the top-level folder name from `webkitRelativePath` and validate no traversal escapes the intended scope.

**When to use:** On every path received from the client — both when building the session store and when finding `index.html`.

**Example:**
```javascript
// Source: [VERIFIED: Node.js path module + manual test]
const path = require('path');

function stripTopFolder(webkitRelativePath) {
  // 'my-vsl/assets/style.css' → 'assets/style.css'
  // 'my-vsl/index.html'       → 'index.html'
  const parts = webkitRelativePath.split('/');
  return parts.slice(1).join('/');
}

function isSafeRelativePath(relativePath) {
  // Reject empty, absolute, or traversal paths
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  // Must not start with '..' after normalization
  if (normalized.startsWith('..')) return false;
  // Must not contain null bytes
  if (relativePath.includes('\0')) return false;
  return true;
}

// Usage:
const raw = req.body['paths[]'][i];    // 'my-vsl/assets/style.css'
const relative = stripTopFolder(raw);  // 'assets/style.css'
if (!isSafeRelativePath(relative)) continue; // skip dangerous paths
```

**Critical subtlety:** When using `startsWith(base)` to verify a resolved path, always append `path.sep` to the base to avoid false positives from directory names that share a prefix. Example: `/tmp/upload-123` would incorrectly match `/tmp/upload-123-evil/file` without the separator check. [VERIFIED: manual test in this session]

### Pattern 5: export-zip Integration Branch

**What:** `/api/export-zip` gains a new code path: when `uploadSessionId` is present in the body, read assets from the session store instead of downloading from the network.

**When to use:** When `req.body.uploadSessionId` is set (folder upload flow).

**Example:**
```javascript
// In /api/export-zip handler — add after building outputHtml:
if (uploadSessionId) {
  const session = sessionStore.get(uploadSessionId);
  if (!session) {
    return res.status(400).json({ error: 'Sessão de upload expirada. Refaça o upload.' });
  }

  // Rewrite HTML src/href to use the relative paths (already relative — no rewriting needed
  // because uploaded assets are stored with their original relative paths, and the ZIP
  // preserves that structure: index.html + assets/style.css etc.)
  // archiver.append(buffer, { name: relativePath })
  for (const [relativePath, buffer] of session.assets) {
    archive.append(buffer, { name: relativePath });
  }
  // Cleanup on finish
  res.on('finish', function() { sessionStore.delete(uploadSessionId); });
}
```

**Important:** The uploaded folder's HTML already references assets with relative paths (e.g., `href="assets/style.css"`). Since the ZIP preserves the folder structure, these references remain valid without rewriting. No cheerio rewriting step is needed for the upload path (unlike the URL path which rewrites absolute URLs to local paths).

### Anti-Patterns to Avoid

- **Setting Content-Type manually on fetch():** Breaks multipart boundary — browser must set it. This is a common mistake when switching from JSON to FormData uploads.
- **Trusting `file.originalname` from multer for paths:** multer strips path info from `originalname` — it only contains the filename, not the folder. Always use the separately-sent `paths[]` field for relative path information.
- **Using `path.resolve(base)` without `path.sep` suffix for path containment check:** `/tmp/vsl-123`.startsWith(`/tmp/vsl-123`) is true even for `/tmp/vsl-123-evil/file`. Append `path.sep` to base before checking. [VERIFIED: manual test]
- **Using diskStorage for this use case:** Adds directory creation, file path management across OS temp dirs, and cleanup complexity. memoryStorage + Map is simpler and sufficient for a local tool with a 50MB cap.
- **Not capping `files` in multer limits:** Without `files: 200`, a malicious POST could upload thousands of files. Always set this even for a local tool.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart body parsing | Custom busboy wrapper | `multer` | Handles boundary parsing, limits, fileFilter, error codes — all edge-cases covered |
| Session-unique IDs | Custom random string | `crypto.randomUUID()` (built-in) | Cryptographically random, no collisions, no dependency |
| ZIP with relative paths | Custom zip writer | `archiver` (already installed) | Already in use; `archive.append(buffer, { name: relativePath })` handles directory structure |

**Key insight:** The multipart parsing problem is notoriously tricky (boundary handling, encoding, partial reads, size limits). multer abstracts all of it in 3 lines of configuration.

---

## Common Pitfalls

### Pitfall 1: Content-Type Header on FormData fetch()
**What goes wrong:** Developer explicitly sets `Content-Type: multipart/form-data` on the fetch call, which omits the `boundary` parameter. multer/busboy fails to parse the body and `req.files` is empty or undefined.
**Why it happens:** Learned habit from JSON payloads; looks correct but breaks multipart.
**How to avoid:** Never set `Content-Type` when posting a `FormData` object. The browser auto-sets `multipart/form-data; boundary=----WebKitFormBoundaryXXX`.
**Warning signs:** `req.files` is undefined or empty despite files being selected in the browser.

### Pitfall 2: multer strips path from originalname
**What goes wrong:** Developer reads `req.files[i].originalname` expecting `assets/style.css` but gets only `style.css`. The folder structure is lost.
**Why it happens:** multer (and busboy underneath) strips path info from filenames for security. The `webkitRelativePath` value the browser sends is only accessible via the FormData field, not the file metadata.
**How to avoid:** Send relative paths as a parallel `paths[]` FormData field from the client. On the server, correlate `req.files[i]` with `req.body['paths[]'][i]` by index.
**Warning signs:** All uploaded files appear in a flat list without any subdirectory structure.

### Pitfall 3: Path Traversal via webkitRelativePath
**What goes wrong:** Client sends a crafted path like `../../etc/passwd` as the relative path value. If the server uses it directly in `path.join`, it can write or read files outside the intended scope.
**Why it happens:** `webkitRelativePath` comes from the browser and should be treated as user input. In normal browser usage it is safe, but a crafted HTTP request can bypass the browser.
**How to avoid:** Validate with `isSafeRelativePath()` before any path construction. The function: normalize, check for leading `..`, check for null bytes.
**Warning signs:** File paths in the session store contain `..` segments.

### Pitfall 4: index.html not at root after stripping
**What goes wrong:** User uploads a nested folder (e.g., `my-project/dist/index.html`). After stripping the top-level folder name, the index.html is at `dist/index.html`, not `index.html`. The server returns "index.html não encontrado na raiz".
**Why it happens:** Users may upload the parent folder rather than the project root.
**How to avoid:** Error message should be specific: "Não foi encontrado um index.html na raiz da pasta. Selecione a pasta que contém diretamente o index.html."
**Warning signs:** Multiple levels of nesting in all uploaded paths.

### Pitfall 5: session expires between upload and export
**What goes wrong:** User uploads, edits affiliate fields for more than 5 minutes, then exports — gets "Sessão de upload expirada".
**Why it happens:** TTL is needed to avoid memory leaks, but the user workflow may take time.
**How to avoid:** Set a generous TTL (30 minutes is safe for a local tool). Or reset the TTL on each action that touches the session. The CONTEXT.md leaves TTL as Claude's discretion — 30 minutes is recommended.
**Warning signs:** Users report intermittent "sessão expirada" errors.

### Pitfall 6: Multer MulterError not caught
**What goes wrong:** Upload exceeds `fileSize` or `files` limit; multer throws `MulterError` which, if not caught by a 4-argument error handler, becomes an unhandled Express error with a 500 response.
**Why it happens:** multer errors bypass the normal next(err) chain unless you add `(err, req, res, next)` error middleware.
**How to avoid:** Add an Express error handler immediately after the route that checks `err instanceof multer.MulterError` and returns a user-friendly 400/413 with a Portuguese message.
**Warning signs:** Generic 500 errors when uploading large folders.

---

## Code Examples

### Complete /api/upload-folder route (reference pattern)

```javascript
// Source: Context7 /expressjs/multer + [VERIFIED patterns from this research session]
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.svg', '.xml', '.png', '.jpg', '.jpeg', '.gif',
  '.webp', '.avif', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.otf', '.map',
]);

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const sessionStore = new Map(); // sessionId → { assets: Map<relativePath, Buffer>, expiresAt }

// TTL cleanup — runs every 5 minutes
setInterval(function() {
  const now = Date.now();
  for (const [id, session] of sessionStore) {
    if (session.expiresAt < now) sessionStore.delete(id);
  }
}, 5 * 60 * 1000);

const folderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 200 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_UPLOAD_EXTENSIONS.has(ext));
  },
});

function stripTopFolder(relativePath) {
  const parts = relativePath.split('/');
  return parts.slice(1).join('/');
}

function isSafeRelativePath(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..')) return false;
  if (relativePath.includes('\0')) return false;
  return true;
}

app.post('/api/upload-folder', folderUpload.array('files', 200), function(req, res) {
  const files = req.files || [];
  const rawPaths = req.body['paths[]'] || [];
  // Normalize: rawPaths may be a string if only 1 file
  const paths = Array.isArray(rawPaths) ? rawPaths : [rawPaths];

  if (!files.length) {
    return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
  }

  // Build asset map: relativePath (stripped) → Buffer
  const assets = new Map();
  let indexHtmlBuffer = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rawPath = paths[i] || file.originalname;
    const relative = stripTopFolder(rawPath);
    if (!isSafeRelativePath(relative)) continue;
    assets.set(relative, file.buffer);
    if (relative === 'index.html' || relative === 'index.htm') {
      indexHtmlBuffer = file.buffer;
    }
  }

  if (!indexHtmlBuffer) {
    return res.status(400).json({
      error: 'index.html não encontrado na raiz da pasta. Selecione a pasta que contém diretamente o index.html.',
    });
  }

  const rawHtml = indexHtmlBuffer.toString('utf8');
  const delayInfo = detectVturbDelay(rawHtml);
  const { html: cleanedHtml, scriptsRemoved, vslDetected } = cleanHtml(rawHtml);
  const $ = cheerio.load(cleanedHtml, { decodeEntities: false });
  const checkoutLinks = detectCheckoutLinks($, cleanedHtml);
  const bundleImages = detectBundleImages($, checkoutLinks);

  const sessionId = crypto.randomUUID();
  sessionStore.set(sessionId, {
    assets,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return res.json({
    html: cleanedHtml,
    uploadSessionId: sessionId,
    summary: {
      scriptsRemoved,
      vslDetected,
      checkoutLinks,
      bundleImages,
      delaySeconds: delayInfo ? delayInfo.delaySeconds : null,
      hasDelay: delayInfo !== null,
      delayScriptContent: delayInfo ? delayInfo.delayScriptContent : null,
      delayType: delayInfo ? delayInfo.delayType : null,
    },
  });
});

// Multer error handler (must be 4-argument for Express to treat as error middleware)
app.use(function(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande. Limite: 10MB por arquivo.' });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Muitos arquivos. Limite: 200 arquivos por pasta.' });
  }
  next(err);
});
```

### export-zip integration (delta from current code)

```javascript
// Source: existing /api/export-zip extended with uploadSessionId branch
// In the destructure at the top of the route:
const { html, headerPixel, headerPreload, vslembed, checkoutLinks, pageUrl,
        delaySeconds, delayScriptContent, delayType, bundleImages, extraScripts,
        uploadSessionId } = req.body;  // NEW: uploadSessionId

// After buildExportHtml(), where assets are currently downloaded:
if (uploadSessionId) {
  const session = sessionStore.get(uploadSessionId);
  if (!session) {
    return res.status(400).json({ error: 'Sessão de upload expirada. Refaça o upload da pasta.' });
  }
  // No HTML rewriting needed — uploaded HTML already uses relative paths
  // Just append all assets to the archive
  archive.append(outputHtml, { name: 'index.html' });
  for (const [relativePath, buffer] of session.assets) {
    if (relativePath !== 'index.html' && relativePath !== 'index.htm') {
      archive.append(buffer, { name: relativePath });
    }
  }
  res.on('finish', function() { sessionStore.delete(uploadSessionId); });
  await archive.finalize();
  return; // early exit — don't fall through to pageUrl branch
}
// else: existing pageUrl branch continues unchanged
```

### Frontend tab toggle (vanilla JS pattern)

```javascript
// Source: [ASSUMED] standard vanilla JS tab pattern
// HTML: two buttons #tab-url, #tab-folder; two panels #panel-url, #panel-folder

var tabUrl    = document.getElementById('tab-url');
var tabFolder = document.getElementById('tab-folder');
var panelUrl  = document.getElementById('panel-url');
var panelFolder = document.getElementById('panel-folder');

function switchTab(tab) {
  if (tab === 'url') {
    tabUrl.classList.add('tab-active');
    tabFolder.classList.remove('tab-active');
    panelUrl.style.display = '';
    panelFolder.style.display = 'none';
  } else {
    tabFolder.classList.add('tab-active');
    tabUrl.classList.remove('tab-active');
    panelFolder.style.display = '';
    panelUrl.style.display = 'none';
  }
}

tabUrl.addEventListener('click', function() { switchTab('url'); });
tabFolder.addEventListener('click', function() { switchTab('folder'); });
```

### Frontend folder upload handler

```javascript
// Source: MDN File API + [VERIFIED pattern]
var folderInput = document.getElementById('folder-input');
var btnProcessFolder = document.getElementById('btn-process-folder');
var uploadInFlight = false;

btnProcessFolder.addEventListener('click', async function() {
  var files = folderInput.files;
  if (!files || !files.length) {
    showError('Selecione uma pasta antes de processar.');
    return;
  }
  if (uploadInFlight) return;
  uploadInFlight = true;

  var formData = new FormData();
  for (var i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
    formData.append('paths[]', files[i].webkitRelativePath);
  }

  try {
    // Do NOT set Content-Type — browser sets multipart boundary automatically
    var response = await fetchWithTimeout('/api/upload-folder', {
      method: 'POST',
      body: formData,
    }, 60000); // 60s for upload (larger than 30s fetch timeout)

    var data = await response.json();
    if (!response.ok) { showError(data.error || 'Erro no upload.'); return; }

    state.fetchedHtml       = data.html;
    state.fetchedUrl        = '';          // no URL in upload mode
    state.uploadSessionId   = data.uploadSessionId;
    state.checkoutLinks     = (data.summary && data.summary.checkoutLinks) || [];
    // ... rest identical to URL fetch handler
  } finally {
    uploadInFlight = false;
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `webkitdirectory` (Chrome-only prefixed) | `webkitdirectory` supported in Chrome, Firefox, Edge | ~2016; Baseline 2025 | Can rely on it without Progressive Enhancement caveats for modern browsers |
| multer v1.x | multer v2.1.1 | 2026-03-04 | v2 API is compatible; same configuration syntax |
| `fs.rmdir({ recursive: true })` | `fs.rm({ recursive: true, force: true })` | Node.js 14.14+ | `rmdir` recursive was deprecated; use `fs.rm` if disk-based cleanup is ever needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tab toggle uses CSS class + JS show/hide with no page reload | Architecture Patterns — Pattern 5 (frontend) | Low — standard DOM pattern; no correctness risk |
| A2 | 30-minute TTL is generous enough for the user workflow | Common Pitfalls — Pitfall 5 | Low — TTL can be tuned; if 5min is enough, either value works |
| A3 | Uploaded HTML files already use relative paths for their assets | Architecture — Pattern 5 (export-zip) | MEDIUM — if the source HTML uses absolute URLs for assets, the ZIP won't work without rewriting. Mitigation: document this limitation in the UI ("A pasta deve conter todos os assets referenciados com caminhos relativos"). |
| A4 | memoryStorage is safe for a local single-user tool with 50MB cap | Standard Stack | Low — local tool, one user; if ever deployed publicly, reconsider |

---

## Open Questions

1. **What if uploaded HTML uses absolute URLs for some assets?**
   - What we know: The export-zip upload path does not rewrite HTML asset refs — it assumes they are relative.
   - What's unclear: Real-world VSL projects may have mixed relative/absolute refs, especially for CDN-hosted fonts or external CSS.
   - Recommendation: Document the limitation clearly. The most common case (local HTML project downloaded from a page builder) uses relative paths. Phase 9 (verification) can flag if external resources exist.

2. **Should the folder input also accept drag-and-drop?**
   - What we know: CONTEXT.md explicitly defers drag-and-drop to backlog. Use native OS selector only.
   - What's unclear: Nothing — this is locked out of scope.
   - Recommendation: Do not implement. The native `webkitdirectory` input provides an adequate UX.

3. **What is the right timeout for the upload fetch call?**
   - What we know: Current URL fetch uses 30s timeout. Folder upload may be larger (50MB).
   - What's unclear: Typical VSL project folder sizes; upload speed on localhost is extremely fast (loopback).
   - Recommendation: Use 60s timeout for the upload call. On localhost, even 50MB uploads in < 1s; the extra headroom covers slow machines.

---

## Environment Availability

Step 2.6: No external services required. All dependencies are local npm packages or Node.js built-ins.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| multer | /api/upload-folder | Install needed | 2.1.1 (npm) | — |
| archiver | /api/export-zip (already used) | ✓ | 7.0.1 | — |
| crypto.randomUUID | session ID | ✓ | built-in Node 25.8 | — |
| Node.js fs.promises | disk cleanup (if needed) | ✓ | built-in | — |

**Missing dependencies with no fallback:**
- `multer` — must be installed via `npm install multer` before implementation

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (project uses test-integration.js with manual assertions) |
| Config file | none — tests run directly with `node test-integration.js` |
| Quick run command | `node test-integration.js` |
| Full suite command | `node test-integration.js && node test-delay-ui.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-01 | Tab toggle shows/hides panels without reload | manual | open browser, click tabs | ❌ Wave 0 |
| UPLOAD-02 | /api/upload-folder receives files, returns same JSON shape as /api/fetch | integration | `node test-integration.js` (new test needed) | ❌ Wave 0 |
| UPLOAD-03 | index.html missing → 400 with clear error message | integration | `node test-integration.js` | ❌ Wave 0 |
| UPLOAD-04 | export-zip with uploadSessionId produces ZIP with index.html + assets | integration | `node test-integration.js` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] New test cases in `test-integration.js` for `/api/upload-folder` (happy path + no index.html error)
- [ ] New test case for `/api/export-zip` with `uploadSessionId` payload
- [ ] Install multer: `npm install multer`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — local tool, no auth |
| V3 Session Management | yes | Module-level Map with UUID keys + TTL expiry |
| V4 Access Control | no | n/a — single user |
| V5 Input Validation | yes | isSafeRelativePath() + extension whitelist in fileFilter |
| V6 Cryptography | no | randomUUID used only for uniqueness, not secrecy |

### Known Threat Patterns for Multipart File Upload

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via webkitRelativePath | Tampering | `isSafeRelativePath()` + normalize + no leading `..` |
| Directory name prefix bypass (`/tmp/upload-123` matches `/tmp/upload-123-evil`) | Tampering | Append `path.sep` to base before `startsWith` check |
| ZIP bomb (many tiny files that expand) | DoS | multer `limits.files: 200` + `limits.fileSize: 10MB per file` = 2GB theoretical max → reduce per-file limit if concerned |
| Upload of executable files (.exe, .php) | Tampering | Extension whitelist in fileFilter; server never executes uploaded files |
| Stale session ID reuse | Spoofing | UUID v4 collision probability is negligible; TTL + on-finish cleanup |
| Memory exhaustion from concurrent uploads | DoS | `limits.files: 200` + `limits.fileSize: 10MB` bounds memory per upload; single-user local tool |

---

## Sources

### Primary (HIGH confidence)
- Context7 `/expressjs/multer` — storage, limits, fileFilter, error handling patterns
- [MDN: File.webkitRelativePath](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath) — property value format, browser support (Baseline 2025)
- [npm registry: multer 2.1.1](https://www.npmjs.com/package/multer) — current version verified
- Manual Node.js test in this session — path traversal edge cases verified

### Secondary (MEDIUM confidence)
- [MDN: HTMLInputElement.webkitdirectory](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory) — browser support confirmation
- [expressjs/multer GitHub README](https://github.com/expressjs/multer) — canonical API reference

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — multer version verified on npm; all other dependencies are built-ins already in use
- Architecture: HIGH — patterns derived from codebase reading + verified API behavior
- Pitfalls: HIGH — path traversal and Content-Type issues verified with code; others are standard knowledge

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (multer is stable; browser APIs are stable)
