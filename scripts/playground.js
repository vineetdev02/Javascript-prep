// ============================================================
// JS HUB — PLAYGROUND
// CodeMirror syntax highlighting + Draggable Resizer
// + Pattern Integration (File System Access API)
// ============================================================
window.JSHub = window.JSHub || {};

window.JSHub.playground = {
  _cm:             null,   // CodeMirror instance
  _dirHandle:      null,   // FileSystemDirectoryHandle for scripts/patterns/
  _dirName:        null,   // Display name of the granted folder
  _patternFiles:   [],     // [{ name, handle }]
  _activePattern:  null,   // filename currently loaded in editor (null = free edit)
  _dropdownOpen:   false,
  _IDB_NAME:       'jshub-fsa',
  _IDB_STORE:      'handles',
  _IDB_KEY:        'patterns-dir',

  snippets: {
    'Hello World': `// 👋 Hello World
console.log("Hello, World!");
console.log("Welcome to JSHub Playground ⚡");
console.log("Type your JS below and press Run or Ctrl+Enter");`,

    'Closure Demo': `// 🔒 Closure — function that remembers its outer scope
function makeCounter(start = 0) {
  let count = start;
  return {
    increment: () => ++count,
    decrement: () => --count,
    value:     () => count
  };
}

const counter = makeCounter(10);
counter.increment();
counter.increment();
counter.decrement();
console.log("Counter value:", counter.value());  // 11
console.log("Closure remembers state! ✅");`,

    'Arrow vs Regular': `// ⚡ Arrow vs Regular — 'this' context difference
const obj = {
  name: "JSHub",
  regularMethod: function() {
    return "Regular: this.name = " + this.name;
  },
  arrowMethod: () => {
    return "Arrow: no own 'this' — inherits outer";
  }
};

console.log(obj.regularMethod()); // "JSHub"
console.log(obj.arrowMethod());   // no this.name here

// Currying with arrow functions
const add = a => b => c => a + b + c;
console.log("Curried add(1)(2)(3) =", add(1)(2)(3));`,

    'Array HOF': `// 🎯 Higher-Order Functions
const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const evens   = nums.filter(n => n % 2 === 0);
const doubled = nums.map(n => n * 2);
const sum     = nums.reduce((acc, n) => acc + n, 0);
const hasNine = nums.some(n => n === 9);
const allPos  = nums.every(n => n > 0);

console.log("Evens:",     evens);
console.log("Doubled:",   doubled);
console.log("Sum:",       sum);
console.log("Has 9?",     hasNine);
console.log("All positive?", allPos);`,

    'Hoisting': `// 🏗️ Hoisting — var vs let/const vs function
console.log(hoistedVar); // undefined — no crash (var hoists)
var hoistedVar = "I was hoisted";

greet(); // ✅ works — function declaration fully hoisted
function greet() {
  console.log("Hello from hoisted function!");
}

// let/const exist but are in TDZ before declaration:
try {
  console.log(notYet);  // ❌ ReferenceError
} catch (e) {
  console.error("TDZ error:", e.message);
}
let notYet = "declared now";
console.log("After TDZ:", notYet); // ✅`,
  },

  // ─── PATTERN TEMPLATE ─────────────────────────────────────
  _patternTemplate(n) {
    return `window.patterns.push(function () {
  // ── Your pattern logic here ──────────────────────────
  let output = "";

  const rows = 5;
  for (let i = 1; i <= rows; i++) {
    output += "* ".repeat(i) + "\\n";
  }
  // ─────────────────────────────────────────────────────

  return {
    title: "My Pattern ${n}",   // ← give your pattern a name
    output: output
  };
});`;
  },

  // ═══════════════════════════════════════════════════════════
  render() {
    this._cm          = null;
    this._activePattern = null;
    this._dropdownOpen  = false;
    const app = document.getElementById('app');
    app.innerHTML = this.getTemplate();
    this._initCodeMirror();
    this._bindEvents();
    this._initResizer();
  },

  // ═══════════════════════════════════════════════════════════
  getTemplate() {
    const snippetBtns = Object.keys(this.snippets)
      .map(n => `<button class="snippet-btn" data-snippet="${n}">${n}</button>`)
      .join('');

    return `
    <div class="playground-view">

      <!-- Top Bar -->
      <div class="playground-header">
        <div class="playground-title">
          <span class="pg-icon">⚡</span>
          JavaScript Playground
        </div>
        <div class="snippet-buttons">
          ${snippetBtns}
          <!-- Pattern Dropdown -->
          <div class="pattern-dropdown" id="pattern-dropdown">
            <button class="snippet-btn pattern-dropdown-btn" id="btn-patterns-menu">
              🔷 Patterns ▾
            </button>
            <div class="pattern-dropdown-menu" id="pattern-dropdown-menu">

              <!-- State A: no folder access yet -->
              <div id="pd-no-access">
                <div class="pd-setup-box">
                  <div class="pd-setup-icon">📁</div>
                  <div class="pd-setup-title">Select your patterns folder</div>
                  <div class="pd-setup-hint">
                    Navigate to<br>
                    <code>scripts/patterns/</code><br>
                    inside your project and click&nbsp;<strong>Select</strong>.
                  </div>
                  <div class="pd-setup-note">Remembered for future sessions</div>
                  <button class="pd-grant-btn" id="btn-grant-access">
                    🔓 Choose Folder
                  </button>
                </div>
              </div>

              <!-- State B: access granted — folder info + list -->
              <div id="pd-with-access" style="display:none;">
                <div class="pd-folder-row" id="pd-folder-row">
                  <span class="pd-folder-icon">📁</span>
                  <span class="pd-folder-name" id="pd-folder-name">patterns/</span>
                  <button class="pd-change-btn" id="btn-change-folder">change</button>
                </div>
                <div class="pattern-dropdown-section">Existing Patterns</div>
                <div id="pattern-list-items">
                  <div class="pattern-item pattern-item--hint">Loading…</div>
                </div>
              </div>

              <div class="pattern-dropdown-divider"></div>
              <button class="pattern-item pattern-item--new" id="btn-new-pattern">
                ＋ New Pattern
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pattern Save Bar (hidden by default) -->
      <div class="pattern-save-bar" id="pattern-save-bar" style="display:none;">
        <div class="pattern-save-info">
          <span class="pattern-save-icon">🔷</span>
          <span id="pattern-save-label">Editing pattern</span>
        </div>
        <div class="pattern-save-actions">
          <button class="btn-save-pattern" id="btn-save-pattern">💾 Save Pattern <kbd>Ctrl+S</kbd></button>
          <button class="btn-discard-pattern" id="btn-discard-pattern">✕ Discard</button>
        </div>
      </div>

      <!-- Split Body -->
      <div class="playground-body" id="playground-body">

        <!-- Left: Editor -->
        <div class="editor-panel" id="editor-panel">
          <div class="panel-header">
            <div class="panel-title">
              <span class="panel-dot panel-dot--red"></span>
              <span class="panel-dot panel-dot--yellow"></span>
              <span class="panel-dot panel-dot--green"></span>
              <span class="panel-label" id="editor-filename">editor.js</span>
            </div>
            <div class="panel-actions">
              <button class="btn-run" id="btn-run">▶ Run <kbd>Ctrl+↵</kbd></button>
              <button class="btn-clear-editor" id="btn-clear-editor">⊘ Clear</button>
            </div>
          </div>
          <div class="cm-container" id="cm-container"></div>
        </div>

        <!-- Draggable Divider -->
        <div class="resizer" id="resizer" title="Drag to resize"></div>

        <!-- Right: Output -->
        <div class="output-panel" id="output-panel">
          <div class="panel-header">
            <div class="panel-title">
              <span class="panel-dot panel-dot--cyan"></span>
              <span class="panel-label">console output</span>
            </div>
            <div class="panel-actions">
              <button class="btn-clear-output" id="btn-clear-output">🗑 Clear Output</button>
            </div>
          </div>
          <div class="output-body" id="output-body">
            <div class="output-welcome">
              <div class="output-welcome-icon">⚡</div>
              <div>Press <strong>Run</strong> or <strong>Ctrl + Enter</strong> to execute</div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Toast notification -->
    <div class="pg-toast" id="pg-toast"></div>`;
  },

  // ═══════════════════════════════════════════════════════════
  _initCodeMirror() {
    const container = document.getElementById('cm-container');
    if (!container) return;

    if (typeof CodeMirror === 'undefined') {
      container.innerHTML = `
        <textarea class="code-editor" id="code-editor-fallback"
          spellcheck="false" autocorrect="off"
        >${this.snippets['Hello World']}</textarea>`;
      this._cm = null;
      return;
    }

    this._cm = CodeMirror(container, {
      value:             this.snippets['Hello World'],
      mode:              'javascript',
      theme:             'dracula',
      lineNumbers:       true,
      tabSize:           2,
      indentWithTabs:    false,
      lineWrapping:      false,
      autofocus:         true,
      matchBrackets:     true,
      autoCloseBrackets: true,
      styleActiveLine:   true,
      extraKeys: {
        'Ctrl-Enter': () => this.runCode(),
        'Ctrl-/':     'toggleComment',
        'Ctrl-S':     () => this._handleCtrlS(),
        'Tab':        (cm) => cm.replaceSelection('  '),
      }
    });
  },

  // ═══════════════════════════════════════════════════════════
  _getCode() {
    if (this._cm) return this._cm.getValue();
    const fb = document.getElementById('code-editor-fallback');
    return fb ? fb.value : '';
  },

  _setCode(code) {
    if (this._cm) { this._cm.setValue(code); this._cm.focus(); return; }
    const fb = document.getElementById('code-editor-fallback');
    if (fb) fb.value = code;
  },

  _clearCode() {
    if (this._cm) { this._cm.setValue(''); this._cm.focus(); return; }
    const fb = document.getElementById('code-editor-fallback');
    if (fb) { fb.value = ''; fb.focus(); }
  },

  // ═══════════════════════════════════════════════════════════
  _bindEvents() {
    // Prevent browser Save dialog while active
    if (!this._ctrlSHandler) {
      this._ctrlSHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') e.preventDefault();
      };
      document.addEventListener('keydown', this._ctrlSHandler);
    }

    document.getElementById('btn-run')
      ?.addEventListener('click', () => this.runCode());

    document.getElementById('btn-clear-editor')
      ?.addEventListener('click', () => this._clearCode());

    document.getElementById('btn-clear-output')
      ?.addEventListener('click', () => this._clearOutput());

    // Snippet buttons
    document.querySelectorAll('.snippet-btn:not(.pattern-dropdown-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        this._exitPatternMode();
        this._setCode(this.snippets[btn.dataset.snippet]);
      });
    });

    // Pattern dropdown toggle
    document.getElementById('btn-patterns-menu')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleDropdown();
      });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#pattern-dropdown')) {
        this._closeDropdown();
      }
    });

    // Grant folder access button (first-time setup)
    document.getElementById('btn-grant-access')
      ?.addEventListener('click', () => this._grantFolderAccess());

    // Change folder button (already have access)
    document.getElementById('btn-change-folder')
      ?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._clearHandleFromIDB();
        this._dirHandle = null;
        this._dirName   = null;
        this._patternFiles = [];
        this._syncDropdownState();
        await this._grantFolderAccess();
      });

    // New pattern button
    document.getElementById('btn-new-pattern')
      ?.addEventListener('click', () => {
        this._closeDropdown();
        this._createNewPattern();
      });

    // Save bar buttons
    document.getElementById('btn-save-pattern')
      ?.addEventListener('click', () => this._saveActivePattern());

    document.getElementById('btn-discard-pattern')
      ?.addEventListener('click', () => this._exitPatternMode());
  },

  // ═══════════════════════════════════════════════════════════
  // INDEXEDDB — persist the directory handle across sessions
  // ═══════════════════════════════════════════════════════════

  _openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._IDB_NAME, 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(this._IDB_STORE);
      req.onsuccess  = (e) => resolve(e.target.result);
      req.onerror    = ()  => reject(new Error('IndexedDB open failed'));
    });
  },

  async _saveHandleToIDB(handle) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(this._IDB_STORE, 'readwrite');
        const req = tx.objectStore(this._IDB_STORE).put(handle, this._IDB_KEY);
        tx.oncomplete = resolve;
        req.onerror   = reject;
      });
    } catch { /* non-critical */ }
  },

  async _loadHandleFromIDB() {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction(this._IDB_STORE, 'readonly');
        const req = tx.objectStore(this._IDB_STORE).get(this._IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      });
    } catch { return null; }
  },

  async _clearHandleFromIDB() {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this._IDB_STORE, 'readwrite');
        tx.objectStore(this._IDB_STORE).delete(this._IDB_KEY);
        tx.oncomplete = resolve;
      });
    } catch { /* non-critical */ }
  },

  // ─── Try to restore a previously-saved handle ────────────
  async _tryRestoreHandle() {
    const saved = await this._loadHandleFromIDB();
    if (!saved) return false;

    try {
      // Check if permission is still valid
      let perm = await saved.queryPermission({ mode: 'readwrite' });

      if (perm === 'prompt') {
        // Need one click to re-confirm — don't auto-request here, wait for user gesture
        // We'll re-request when the dropdown is opened
        perm = await saved.requestPermission({ mode: 'readwrite' });
      }

      if (perm === 'granted') {
        this._dirHandle = saved;
        this._dirName   = saved.name;
        return true;
      }
    } catch { /* handle may be stale */ }

    // Saved handle no longer usable — clear it
    await this._clearHandleFromIDB();
    return false;
  },

  // ═══════════════════════════════════════════════════════════
  // PATTERN DROPDOWN
  // ═══════════════════════════════════════════════════════════

  _toggleDropdown() {
    if (this._dropdownOpen) {
      this._closeDropdown();
    } else {
      this._openDropdown();
    }
  },

  async _openDropdown() {
    this._dropdownOpen = true;
    const menu = document.getElementById('pattern-dropdown-menu');
    if (menu) menu.classList.add('open');

    // If no handle in memory, try to restore from IDB first
    if (!this._dirHandle) {
      await this._tryRestoreHandle();
    }

    this._syncDropdownState();

    if (this._dirHandle) {
      await this._refreshPatternList();
    }
  },

  _closeDropdown() {
    this._dropdownOpen = false;
    const menu = document.getElementById('pattern-dropdown-menu');
    if (menu) menu.classList.remove('open');
  },

  // Show/hide the correct panel inside the dropdown
  _syncDropdownState() {
    const noAccess   = document.getElementById('pd-no-access');
    const withAccess = document.getElementById('pd-with-access');
    const folderName = document.getElementById('pd-folder-name');

    if (this._dirHandle) {
      if (noAccess)   noAccess.style.display   = 'none';
      if (withAccess) withAccess.style.display  = 'block';
      if (folderName) folderName.textContent    = this._dirName || this._dirHandle.name;
    } else {
      if (noAccess)   noAccess.style.display   = 'block';
      if (withAccess) withAccess.style.display  = 'none';
    }
  },

  // ─── Grant folder access & persist ───────────────────────
  async _grantFolderAccess() {
    if (!window.showDirectoryPicker) {
      this._toast('File System Access API is not supported. Use Chrome or Edge 86+.', 'error', 5000);
      return false;
    }

    this._toast('Navigate to your scripts/patterns/ folder and click Select', 'info', 8000);

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });

      // Warn if it doesn't look like the patterns folder
      if (!handle.name.toLowerCase().includes('pattern')) {
        this._toast(`Folder "${handle.name}" selected. Make sure this is your scripts/patterns/ folder.`, 'info', 4000);
      }

      this._dirHandle = handle;
      this._dirName   = handle.name;

      await this._saveHandleToIDB(handle);
      this._syncDropdownState();
      await this._refreshPatternList();

      this._toast(`✅ Folder "${handle.name}" connected — remembered for future sessions`, 'success', 4000);
      return true;

    } catch (e) {
      if (e.name !== 'AbortError') {
        this._toast('Could not access folder: ' + e.message, 'error');
      }
      return false;
    }
  },

  async _refreshPatternList() {
    this._patternFiles = [];

    try {
      for await (const [name, handle] of this._dirHandle.entries()) {
        if (handle.kind === 'file' && /^pattern\d+\.js$/.test(name)) {
          this._patternFiles.push({ name, handle });
        }
      }
    } catch (e) {
      this._toast('Could not read patterns folder: ' + e.message, 'error');
      return;
    }

    // Sort by pattern number
    this._patternFiles.sort((a, b) => {
      const na = parseInt(a.name.match(/\d+/)[0]);
      const nb = parseInt(b.name.match(/\d+/)[0]);
      return na - nb;
    });

    this._renderPatternList();
  },

  _renderPatternList() {
    const listEl = document.getElementById('pattern-list-items');
    if (!listEl) return;

    if (this._patternFiles.length === 0) {
      listEl.innerHTML = `<div class="pattern-item pattern-item--hint">No patterns found. Create one!</div>`;
      return;
    }

    listEl.innerHTML = this._patternFiles.map(({ name }) => {
      const num = name.match(/\d+/)[0];
      return `<button class="pattern-item" data-file="${name}">
        <span class="pattern-item-badge">#${num}</span>
        <span class="pattern-item-name">${name}</span>
      </button>`;
    }).join('');

    listEl.querySelectorAll('.pattern-item[data-file]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._closeDropdown();
        this._loadPatternIntoEditor(btn.dataset.file);
      });
    });
  },

  // ─── Load pattern file into editor ───────────────────────
  async _loadPatternIntoEditor(filename) {
    // Grant access if not yet done
    if (!this._dirHandle) {
      const ok = await this._grantFolderAccess();
      if (!ok) return;
    }

    const entry = this._patternFiles.find(p => p.name === filename);
    if (!entry) {
      this._toast(`Pattern "${filename}" not found`, 'error');
      return;
    }

    try {
      const file = await entry.handle.getFile();
      const text = await file.text();
      this._setCode(text);
      this._enterPatternMode(filename);
      this.runCode(); // auto-run so user sees output immediately
    } catch (e) {
      this._toast('Failed to read pattern: ' + e.message, 'error');
    }
  },

  // ─── Create new pattern ───────────────────────────────────
  async _createNewPattern() {
    // Grant access if not yet done
    if (!this._dirHandle) {
      const ok = await this._grantFolderAccess();
      if (!ok) return;
    }

    await this._refreshPatternList();

    // Auto-increment: find next available number
    const usedNums = this._patternFiles.map(p => parseInt(p.name.match(/\d+/)[0]));
    let next = 1;
    while (usedNums.includes(next)) next++;
    const newFilename = `pattern${next}.js`;

    this._setCode(this._patternTemplate(next));
    this._enterPatternMode(newFilename, true);
    this._toast(`New pattern: ${newFilename} — edit and press Save`, 'info');
  },

  // ─── Enter / Exit pattern edit mode ──────────────────────
  _enterPatternMode(filename, isNew = false) {
    this._activePattern = filename;

    const saveBar   = document.getElementById('pattern-save-bar');
    const saveLabel = document.getElementById('pattern-save-label');
    const fileLabel = document.getElementById('editor-filename');

    if (saveBar)   saveBar.style.display = 'flex';
    if (saveLabel) saveLabel.textContent = isNew
      ? `New pattern — ${filename}`
      : `Editing ${filename}`;
    if (fileLabel) fileLabel.textContent = filename;
  },

  _exitPatternMode() {
    this._activePattern = null;
    const saveBar   = document.getElementById('pattern-save-bar');
    const fileLabel = document.getElementById('editor-filename');
    if (saveBar)   saveBar.style.display = 'none';
    if (fileLabel) fileLabel.textContent = 'editor.js';
    this._setCode(this.snippets['Hello World']);
  },

  // ─── Save active pattern ──────────────────────────────────
  async _saveActivePattern() {
    if (!this._activePattern) return;
    if (!this._dirHandle) {
      this._toast('No folder access. Cannot save.', 'error');
      return;
    }

    const code = this._getCode().trim();

    // Validate: code must run and return { title, output }
    const validationResult = this._validatePatternCode(code);
    if (!validationResult.ok) {
      this._toast('❌ Error — pattern not saved: ' + validationResult.error, 'error', 5000);
      return;
    }

    try {
      const fileHandle = await this._dirHandle.getFileHandle(this._activePattern, { create: true });
      const writable   = await fileHandle.createWritable();
      await writable.write(code);
      await writable.close();

      this._toast(`✅ Saved ${this._activePattern}`, 'success');

      // Refresh pattern list and update the handle cache
      await this._refreshPatternList();

      // Update the save bar label (no longer "new")
      const saveLabel = document.getElementById('pattern-save-label');
      if (saveLabel) saveLabel.textContent = `Editing ${this._activePattern}`;

    } catch (e) {
      this._toast('Save failed: ' + e.message, 'error');
    }
  },

  // ─── Validate pattern code ────────────────────────────────
  _validatePatternCode(code) {
    const tempPatterns = [];
    let execErr = null;

    try {
      // Inject a fake window.patterns that captures the push
      const wrapped = code.replace(/window\.patterns/g, '__tempPats__');
      // eslint-disable-next-line no-new-func
      new Function('__tempPats__', wrapped)(tempPatterns);
    } catch (e) {
      execErr = e;
    }

    if (execErr) {
      return { ok: false, error: `${execErr.name}: ${execErr.message}` };
    }

    if (tempPatterns.length === 0) {
      return { ok: false, error: 'Pattern must call window.patterns.push(function() { ... })' };
    }

    let result;
    try {
      result = tempPatterns[0]();
    } catch (e) {
      return { ok: false, error: `Pattern function threw: ${e.message}` };
    }

    if (!result || typeof result !== 'object') {
      return { ok: false, error: 'Pattern function must return an object' };
    }
    if (typeof result.title !== 'string' || !result.title.trim()) {
      return { ok: false, error: 'Return object must have a non-empty "title" string' };
    }
    if (typeof result.output !== 'string') {
      return { ok: false, error: 'Return object must have an "output" string' };
    }

    return { ok: true };
  },

  // ─── Ctrl+S handler ──────────────────────────────────────
  _handleCtrlS() {
    if (this._activePattern) {
      this._saveActivePattern();
    }
    // else: do nothing (prevents browser Save dialog)
  },

  // ═══════════════════════════════════════════════════════════
  _initResizer() {
    const resizer     = document.getElementById('resizer');
    const editorPanel = document.getElementById('editor-panel');
    const outputPanel = document.getElementById('output-panel');
    if (!resizer || !editorPanel || !outputPanel) return;

    let dragging      = false;
    let startX        = 0;
    let startEditorW  = 0;

    resizer.addEventListener('mousedown', (e) => {
      dragging      = true;
      startX        = e.clientX;
      startEditorW  = editorPanel.getBoundingClientRect().width;
      resizer.classList.add('active');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const body       = document.getElementById('playground-body');
      if (!body) return;
      const containerW = body.getBoundingClientRect().width - 8;
      const dx         = e.clientX - startX;
      const minW       = 220;
      const newEditorW = Math.max(minW, Math.min(containerW - minW, startEditorW + dx));
      const newOutputW = containerW - newEditorW;

      editorPanel.style.flex  = 'none';
      editorPanel.style.width = newEditorW + 'px';
      outputPanel.style.flex  = 'none';
      outputPanel.style.width = newOutputW + 'px';

      if (this._cm) this._cm.refresh();
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('active');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      if (this._cm) this._cm.refresh();
    });
  },

  // ═══════════════════════════════════════════════════════════
  _clearOutput() {
    const ob = document.getElementById('output-body');
    if (!ob) return;
    ob.innerHTML = `
      <div class="output-welcome">
        <div class="output-welcome-icon">⚡</div>
        <div>Output cleared. Write code and press Run.</div>
      </div>`;
  },

  // ═══════════════════════════════════════════════════════════
  runCode() {
    const code       = this._getCode().trim();
    const outputBody = document.getElementById('output-body');
    if (!outputBody) return;
    outputBody.innerHTML = '';

    if (!code) {
      outputBody.innerHTML = `<div class="output-line output-line--empty">// Nothing to run. Write some code first.</div>`;
      return;
    }

    const logs = [];
    const orig = {
      log:   console.log,
      error: console.error,
      warn:  console.warn,
      info:  console.info,
    };

    const fmt = (v) => {
      if (v === null)      return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'object') {
        try { return JSON.stringify(v, null, 2); } catch { return String(v); }
      }
      return String(v);
    };

    const capture = (type) => (...args) => logs.push({ type, text: args.map(fmt).join(' ') });

    console.log   = capture('log');
    console.error = capture('error');
    console.warn  = capture('warn');
    console.info  = capture('info');

    let execErr = null;
    try {
      // eslint-disable-next-line no-new-func
      new Function(code)();
    } catch (e) {
      execErr = e;
    }

    console.log   = orig.log;
    console.error = orig.error;
    console.warn  = orig.warn;
    console.info  = orig.info;

    if (execErr) {
      logs.push({ type: 'error', text: `❌ ${execErr.name}: ${execErr.message}` });
    }

    if (logs.length === 0) {
      outputBody.innerHTML = `<div class="output-line output-line--empty">// Code ran with no console output</div>`;
    } else {
      logs.forEach((log, i) => {
        const line = document.createElement('div');
        line.className = `output-line output-line--${log.type}`;
        line.innerHTML = `
          <span class="output-index">${i + 1}</span>
          <pre class="output-text">${this._esc(log.text)}</pre>`;
        outputBody.appendChild(line);
      });
    }

    outputBody.scrollTop = outputBody.scrollHeight;
  },

  // ═══════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════
  _toast(message, type = 'info', duration = 3000) {
    const el = document.getElementById('pg-toast');
    if (!el) return;

    el.textContent  = message;
    el.className    = `pg-toast pg-toast--${type} pg-toast--visible`;

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove('pg-toast--visible');
    }, duration);
  },

  // ═══════════════════════════════════════════════════════════
  _esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
