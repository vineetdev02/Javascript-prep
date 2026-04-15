// ============================================================
// JS HUB — HOME PAGE
// ============================================================
window.JSHub = window.JSHub || {};

window.JSHub.home = {
  quoteIndex: 0,
  quoteTimer: null,

  quotes: [
    { text: "Code is not just syntax — it's the language of your ambition.", author: "— JSHub" },
    { text: "Every expert was once a beginner. Write code. Break things. Learn fast.", author: "— The Grind" },
    { text: "The best time to master JavaScript was yesterday. The second best time is now.", author: "— JSHub" },
    { text: "Don't just memorize. Understand deeply — then you'll never forget.", author: "— The Method" },
    { text: "Great engineers aren't born. They're forged in the fire of debugging.", author: "— The Stack" },
  ],

  render() {
    const app = document.getElementById('app');
    app.innerHTML = this.getTemplate();
    this.startQuoteRotation();
    this.startCounters();
  },

  getTemplate() {
    return `
    <div class="home-view">

      <!-- ── Hero ── -->
      <section class="hero">
        <div class="hero-bg-glow"></div>
        <div class="hero-content">

          <div class="hero-badge">
            <span class="badge-dot"></span>
            Google / Apple / Meta Level Interview Prep
          </div>

          <h1 class="hero-title">
            Master <span class="gradient-text">JavaScript.</span><br>
            Land the <span class="gradient-text-amber">Dream Job.</span>
          </h1>

          <div class="quote-container">
            <p class="quote-text" id="quote-text">"${this.quotes[0].text}"</p>
            <span class="quote-author" id="quote-author">${this.quotes[0].author}</span>
          </div>

          <div class="hero-cta">
            <button class="btn-primary" onclick="window.JSHub.router.navigate('playground')">
              Open Playground ⚡
            </button>
            <button class="btn-secondary" onclick="window.JSHub.router.navigate('patterns')">
              View Patterns 🔷
            </button>
          </div>

        </div>
      </section>

      <!-- ── Marquee Banner ── -->
      <div class="banner-strip">
        <div class="banner-track">
          <span>🚀 Variables &amp; Scope</span>
          <span>⚡ Functions Deep Dive</span>
          <span>🔷 Patterns Gallery</span>
          <span>🎯 Closures</span>
          <span>🔥 Currying</span>
          <span>💡 Higher-Order Functions</span>
          <span>🧩 IIFE Pattern</span>
          <span>⭐ Arrow Functions</span>
          <span>🔐 TDZ &amp; Hoisting</span>
          <span>🌐 Scope Chain</span>
          <span>🚀 Variables &amp; Scope</span>
          <span>⚡ Functions Deep Dive</span>
          <span>🔷 Patterns Gallery</span>
          <span>🎯 Closures</span>
          <span>🔥 Currying</span>
          <span>💡 Higher-Order Functions</span>
          <span>🧩 IIFE Pattern</span>
          <span>⭐ Arrow Functions</span>
          <span>🔐 TDZ &amp; Hoisting</span>
          <span>🌐 Scope Chain</span>
        </div>
      </div>

      <!-- ── Stats ── -->
      <section class="stats-section">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number" id="stat-topics">0</div>
            <div class="stat-label">Deep Dive Topics</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="stat-modules">0</div>
            <div class="stat-label">Core Modules</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" id="stat-playground">0</div>
            <div class="stat-label">Live Playground</div>
          </div>
        </div>
      </section>

      <!-- ── Feature Cards ── -->
      <section class="features-section">
        <h2 class="section-title">What You'll <span class="gradient-text">Master</span></h2>
        <div class="features-grid">

          <div class="feature-card feature-card--cyan">
            <span class="feature-icon">📦</span>
            <h3 class="feature-title">Variables &amp; Scope</h3>
            <p class="feature-desc">
              var vs let vs const, hoisting, temporal dead zone, closures, scope chain &mdash;
              the absolute foundation every JS dev must know cold.
            </p>
            <div class="feature-topics">
              <span class="topic-chip">Hoisting</span>
              <span class="topic-chip">TDZ</span>
              <span class="topic-chip">Closures</span>
              <span class="topic-chip">Scope Chain</span>
              <span class="topic-chip">Shadowing</span>
            </div>
            <div class="feature-count">9 Topics · 9 Deep-Dive Files</div>
          </div>

          <div class="feature-card feature-card--purple">
            <span class="feature-icon">⚙️</span>
            <h3 class="feature-title">Functions Deep Dive</h3>
            <p class="feature-desc">
              Arrow vs regular, IIFE, currying, partial application, composition, HOF &mdash;
              every functional pattern you'll be grilled on.
            </p>
            <div class="feature-topics">
              <span class="topic-chip">Currying</span>
              <span class="topic-chip">HOF</span>
              <span class="topic-chip">IIFE</span>
              <span class="topic-chip">Composition</span>
              <span class="topic-chip">Pure Fn</span>
            </div>
            <div class="feature-count">12 Topics · 12 Deep-Dive Files</div>
          </div>

          <div class="feature-card feature-card--amber">
            <span class="feature-icon">🔷</span>
            <h3 class="feature-title">Patterns Gallery</h3>
            <p class="feature-desc">
              Visual pattern output &mdash; live-rendered from your own pattern scripts.
              See the output, study the logic, add your own.
            </p>
            <div class="feature-topics">
              <span class="topic-chip">Live Render</span>
              <span class="topic-chip">Visual</span>
              <span class="topic-chip">Logic</span>
              <span class="topic-chip">Auto-loads</span>
            </div>
            <div class="feature-count">Live · Auto-Loads All Patterns</div>
          </div>

        </div>
      </section>

      <!-- ── Motivation Bar ── -->
      <div class="motivation-bar">
        <span class="moti-text">💪 You're preparing for</span>
        <span class="moti-highlight">Google</span>
        <span class="moti-text">·</span>
        <span class="moti-highlight moti-highlight--purple">Apple</span>
        <span class="moti-text">·</span>
        <span class="moti-highlight moti-highlight--amber">Meta</span>
        <span class="moti-text">level interviews. Stay consistent. Keep grinding. 🔥</span>
      </div>

    </div>
    `;
  },

  startQuoteRotation() {
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    this.quoteIndex = 0;

    this.quoteTimer = setInterval(() => {
      this.quoteIndex = (this.quoteIndex + 1) % this.quotes.length;
      const q      = this.quotes[this.quoteIndex];
      const textEl = document.getElementById('quote-text');
      const authEl = document.getElementById('quote-author');
      if (!textEl) { clearInterval(this.quoteTimer); return; }

      textEl.style.opacity = '0';
      authEl.style.opacity = '0';

      setTimeout(() => {
        textEl.textContent = `"${q.text}"`;
        authEl.textContent = q.author;
        textEl.style.transition = 'opacity 0.4s ease';
        authEl.style.transition = 'opacity 0.4s ease';
        textEl.style.opacity = '1';
        authEl.style.opacity = '1';
      }, 400);
    }, 4500);
  },

  startCounters() {
    this.animateCounter('stat-topics',     21,  1400);
    this.animateCounter('stat-modules',     2,   800);
    this.animateCounter('stat-playground',  1,   600);
  },

  animateCounter(id, target, duration) {
    const el = document.getElementById(id);
    if (!el) return;
    let current  = 0;
    const steps  = 40;
    const delay  = duration / steps;
    const inc    = Math.ceil(target / steps);

    const timer = setInterval(() => {
      current = Math.min(current + inc, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, delay);
  }
};
