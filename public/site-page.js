(function () {
  let shopCategoryFilter = 'all';

  const FOOTER_HTML = `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-top">
          <div class="footer-brand">
            <div class="footer-kicker">Digitify Webshop</div>
            <div><span class="logo-mark">&#x2726;</span> <span data-brand-name>Digitify</span></div>
            <p data-brand-tagline>Partner in Digital Solutions</p>
          </div>
          <div class="footer-cols">
            <div>
              <h5>Shop</h5>
              <a href="/shop">Catalogus</a>
              <a href="/">3D producten</a>
              <a href="/prijzen">Prijzen</a>
              <a href="/cart">Winkelmand</a>
            </div>
            <div>
              <h5>Website</h5>
              <a href="https://digitify.be/diensten/">Diensten</a>
              <a href="https://digitify.be/cases/">Cases</a>
              <a href="https://digitify.be/over-ons/">Over ons</a>
              <a href="https://digitify.be/contact/">Contact</a>
            </div>
            <div>
              <h5>Support</h5>
              <a href="/support">Support</a>
              <a href="/faq">FAQ</a>
              <a href="/contact">Contact</a>
              <a href="/verzending">Verzending</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>&copy; <span data-year></span> <span data-brand-name>Digitify</span>. Alle rechten voorbehouden.</p>
          <div class="footer-meta-links">
            <a href="/privacy">Privacy</a>
            <a href="/voorwaarden">Voorwaarden</a>
            <a href="https://digitify.be/">digitify.be</a>
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
    const tagline = String(cfg?.brand?.tagline || 'Partner in Digital Solutions');
    document.querySelectorAll('[data-brand-name]').forEach((el) => { el.textContent = brandName; });
    const tag = document.querySelector('[data-brand-tagline]');
    if (tag) tag.textContent = tagline;
    document.title = `${brandName} - ${document.body?.dataset?.pageTitle || 'Webshop'}`;
  }

  function renderFooter() {
    const mount = document.getElementById('siteFooterMount');
    if (!mount) return;
    mount.insertAdjacentHTML('beforeend', FOOTER_HTML);
    const yearEl = mount.querySelector('[data-year]');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function productPrice(p, cfg) {
    if (p?.basePrice != null) return Number(p.basePrice) || 0;
    const base = Number(cfg?.pricing?.basePrice || 0);
    return base * Math.max(0.1, Number(p?.priceMultiplier || 1));
  }

  function has3d(product) {
    return product?.category === '3d' || !!(product?.model3d && product.model3d.enabled);
  }

  function filterProducts(products) {
    if (shopCategoryFilter === '3d') return products.filter(has3d);
    if (shopCategoryFilter === 'standard') return products.filter((p) => !has3d(p));
    return products;
  }

  function renderShopFilters() {
    const host = document.getElementById('shopCategoryFilters');
    if (!host) return;
    const tabs = [
      { id: 'all', label: 'Alle producten' },
      { id: '3d', label: 'Met 3D preview' },
      { id: 'standard', label: 'Standaard' }
    ];
    host.innerHTML = tabs.map((tab) =>
      `<button type="button" class="shop-filter-tab${shopCategoryFilter === tab.id ? ' active' : ''}" data-shop-filter="${tab.id}">${tab.label}</button>`
    ).join('');
    host.querySelectorAll('[data-shop-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        shopCategoryFilter = String(btn.dataset.shopFilter || 'all');
        renderShopFilters();
        renderShopCards(window.NEB_CONFIG || {});
      });
    });
  }

  function renderShopCards(cfg) {
    const host = document.getElementById('shopProducts');
    if (!host) return;
    const products = filterProducts(Array.isArray(cfg?.products) ? cfg.products.filter((p) => p && p.enabled !== false) : []);
    if (!products.length) {
      host.innerHTML = '<p class="muted">Geen producten in deze categorie.</p>';
      return;
    }
    host.innerHTML = products.map((p) => {
      const price = '€' + productPrice(p, cfg).toFixed(2).replace('.', ',');
      const img = '/' + String(p.mockupPath || 'assets/tshirt_mockup.png').replace(/^\/+/, '');
      const badge = has3d(p) ? '<span class="product-badge-3d">3D preview</span>' : '';
      const link = has3d(p) ? `/?product=${encodeURIComponent(p.id)}` : `/?product=${encodeURIComponent(p.id)}`;
      return `
        <article class="shop-card">
          <img src="${img}" alt="${escapeHtml(String(p.name || 'Product'))}">
          ${badge}
          <h3>${escapeHtml(String(p.name || 'Product'))}</h3>
          <p>${escapeHtml(String(p.description || ''))}</p>
          <div class="price">Vanaf ${price}</div>
          <p style="margin-top:.75rem"><a class="btn btn-ghost btn-sm" href="${link}" style="text-decoration:none">${has3d(p) ? 'Bekijk in 3D' : 'Bestellen'}</a></p>
        </article>`;
    }).join('');
  }

  async function init() {
    NEB.initTheme();
    renderFooter();
    setActiveNav();
    renderShopFilters();
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
