(function () {
  const FOOTER_HTML = `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-top">
          <div class="footer-brand">
            <div class="footer-kicker">Premium Print Studio</div>
            <div><span class="logo-mark">&#x2726;</span> <span data-brand-name>Digitify</span></div>
            <p data-brand-tagline>Custom premium t-shirts, gemaakt voor jou.</p>
          </div>
          <div class="footer-cols">
            <div>
              <h5>Shop</h5>
              <a href="/shop">Shop</a>
              <a href="/">Producten</a>
              <a href="/prijzen">Prijzen</a>
              <a href="/maattabel">Maattabel</a>
            </div>
            <div>
              <h5>Support</h5>
              <a href="/support">Support</a>
              <a href="/faq">FAQ</a>
              <a href="/contact">Contact</a>
              <a href="/verzending">Verzending</a>
            </div>
            <div>
              <h5>Legal</h5>
              <a href="/legal">Legal</a>
              <a href="/privacy">Privacy</a>
              <a href="/voorwaarden">Voorwaarden</a>
              <a href="/retourneren">Retourneren</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; <span data-year></span> <span data-brand-name>Digitify</span>. Alle rechten voorbehouden.</p>
          <div class="footer-meta-links">
            <a href="/privacy">Privacy</a>
            <a href="/voorwaarden">Voorwaarden</a>
            <a href="/contact">Contact</a>
          </div>
        </div>
      </div>
    </footer>`;

  function setActiveNav() {
    const current = document.body?.dataset?.nav || '';
    document.querySelectorAll('.nav-link[data-nav]').forEach((el) => {
      const on = String(el.dataset.nav || '') === current;
      el.classList.toggle('active', on);
    });
  }

  function applyBrandBits(cfg) {
    const brandName = String(cfg?.brand?.name || 'Digitify');
    const tagline = String(cfg?.brand?.tagline || 'Custom premium t-shirts, gemaakt voor jou.');
    document.querySelectorAll('[data-brand-name]').forEach((el) => { el.textContent = brandName; });
    const tag = document.querySelector('[data-brand-tagline]');
    if (tag) tag.textContent = tagline;
    document.title = `${brandName} - ${document.body?.dataset?.pageTitle || 'Informatie'}`;
  }

  function renderFooter() {
    const mount = document.getElementById('siteFooterMount');
    if (!mount) return;
    mount.innerHTML = FOOTER_HTML;
    const yearEl = mount.querySelector('[data-year]');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function renderShopCards(cfg) {
    const host = document.getElementById('shopProducts');
    if (!host) return;
    const products = Array.isArray(cfg?.products) ? cfg.products.filter((p) => p && p.enabled !== false) : [];
    const base = Number(cfg?.pricing?.basePrice || 34.95);
    if (!products.length) {
      host.innerHTML = '<p class="muted">Geen producten beschikbaar.</p>';
      return;
    }
    host.innerHTML = products.map((p) => {
      const mul = Math.max(0.1, Number(p.priceMultiplier || 1));
      const price = '€' + (base * mul).toFixed(2).replace('.', ',');
      const img = '/' + String(p.mockupPath || 'assets/tshirt_mockup.png').replace(/^\/+/, '');
      return `
        <article class="shop-card">
          <img src="${img}" alt="${escapeHtml(String(p.name || 'Product'))}">
          <h3>${escapeHtml(String(p.name || 'Product'))}</h3>
          <p>${escapeHtml(String(p.description || 'Product met 3D preview.'))}</p>
          <div class="price">Vanaf ${price}</div>
          <p style="margin-top:.75rem"><a class="btn btn-ghost btn-sm" href="/" style="text-decoration:none">Bekijk in 3D</a></p>
        </article>`;
    }).join('');
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function init() {
    NEB.initTheme();
    renderFooter();
    setActiveNav();
    try {
      const cfg = await NEB.config();
      window.NEB_CONFIG = cfg || {};
      NEB.applyBranding(cfg || {});
      applyBrandBits(cfg || {});
      renderShopCards(cfg || {});
    } catch (err) {
      console.warn('Config kon niet geladen worden:', err?.message || err);
    }
    NEB.paintNav();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
