// ============================================================
// JS HUB — PATTERNS VIEW
// Loads your existing scripts/patterns/pattern*.js files
// and renders them as glowing cards.
// ============================================================
window.JSHub = window.JSHub || {};

window.JSHub.patternsView = {
  _loaded: false, // cache flag so scripts load only once

  render() {
    const app = document.getElementById('app');
    app.innerHTML = this.getTemplate();

    if (this._loaded && window.patterns && window.patterns.length > 0) {
      // Already loaded — render from cache immediately
      this._hideLoader();
      this._renderCards();
    } else {
      // First time — reset and load pattern scripts
      window.patterns = [];
      this._loadNext(1);
    }
  },

  getTemplate() {
    return `
    <div class="patterns-view">

      <div class="patterns-header">
        <h2 class="patterns-title">🔷 Pattern <span class="gradient-text">Gallery</span></h2>
        <p class="patterns-subtitle">
          Live-rendered from your <code>scripts/patterns/</code> files.
          Add more <code>pattern2.js</code>, <code>pattern3.js</code>… they auto-load!
        </p>
      </div>

      <div class="patterns-loader" id="patterns-loader">
        <div class="spinner"></div>
        <span>Loading patterns…</span>
      </div>

      <div class="patterns-grid" id="patterns-grid"></div>

    </div>
    `;
  },

  _loadNext(n) {
    const script = document.createElement('script');
    script.src   = `./scripts/patterns/pattern${n}.js?_v=${Date.now()}`;

    script.onload  = () => this._loadNext(n + 1);
    script.onerror = () => {
      this._loaded = true;
      this._hideLoader();
      this._renderCards();
    };

    document.body.appendChild(script);
  },

  _hideLoader() {
    const loader = document.getElementById('patterns-loader');
    if (loader) loader.style.display = 'none';
  },

  _renderCards() {
    const grid = document.getElementById('patterns-grid');
    if (!grid) return;

    if (!window.patterns || window.patterns.length === 0) {
      grid.innerHTML = `
        <div class="no-patterns">
          <div style="font-size:40px;margin-bottom:12px;">🔷</div>
          No patterns found yet.<br>
          Add <code>scripts/patterns/pattern1.js</code> to get started!
        </div>`;
      return;
    }

    window.patterns.forEach((patternFn, index) => {
      try {
        const result = patternFn();
        const card   = document.createElement('div');
        card.className = 'pattern-card';
        card.style.animationDelay = `${index * 0.08}s`;

        card.innerHTML = `
          <div class="pattern-card-header">
            <h3 class="pattern-card-title">⭐ ${this._esc(result.title)}</h3>
            <span class="pattern-card-badge">#${index + 1}</span>
          </div>
          <pre class="pattern-output">${this._esc(result.output)}</pre>`;

        grid.appendChild(card);
      } catch (e) {
        console.error('Pattern render error:', e);
      }
    });
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
