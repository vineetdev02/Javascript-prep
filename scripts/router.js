// ============================================================
// JS HUB — ROUTER
// ============================================================
window.JSHub = window.JSHub || {};

window.JSHub.router = {
  currentView: null,

  init() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.dataset.view);
      });
    });
    this.navigate('home');
  },

  navigate(view) {
    if (this.currentView === view) return;

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
    });

    // Fade out, swap view, fade in
    const app = document.getElementById('app');
    app.classList.remove('fade-in');
    app.style.opacity = '0';
    app.style.transform = 'translateY(10px)';

    setTimeout(() => {
      switch (view) {
        case 'home':        window.JSHub.home.render();         break;
        case 'playground':  window.JSHub.playground.render();   break;
        case 'patterns':    window.JSHub.patternsView.render(); break;
      }
      app.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      app.style.opacity   = '1';
      app.style.transform = 'translateY(0)';
      this.currentView = view;
    }, 180);
  }
};
