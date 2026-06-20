(function () {
  const DEFAULT_WP = 'https://digitify.be';

  function siteBase(cfg) {
    return String(cfg?.site?.wordpressUrl || DEFAULT_WP).replace(/\/+$/, '');
  }

  function wpUrl(cfg, path) {
    return siteBase(cfg) + path;
  }

  function injectAmbient() {
    if (document.querySelector('.digitify-ambient')) return;
    const el = document.createElement('div');
    el.className = 'digitify-ambient';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="digitify-ambient__mesh"></div>
      <div class="digitify-ambient__orbs">
        <span class="digitify-ambient__orb--a"></span>
        <span class="digitify-ambient__orb--b"></span>
        <span class="digitify-ambient__orb--c"></span>
      </div>`;
    document.body.prepend(el);
  }

  function renderHeader(cfg) {
    if (document.body.classList.contains('admin-page')) return;
    const existing = document.getElementById('digitifySiteHeader');
    if (existing) existing.remove();

    const active = String(document.body.dataset.nav || '').toLowerCase();
    const wp = siteBase(cfg);
    const logoPath = cfg?.theme?.logoPath ? '/' + String(cfg.theme.logoPath).replace(/^\/+/, '') : '/assets/branding/logo-black.png';
    const brandName = String(cfg?.brand?.name || 'Digitify');
    const tagline = String(cfg?.brand?.tagline || 'Partner in Digital Solutions');

    const header = document.createElement('header');
    header.id = 'digitifySiteHeader';
    header.className = 'digitify-site-header';
    header.innerHTML = `
      <div class="digitify-header-shell">
        <div class="digitify-header-brand">
          <a href="${wp}/" class="logo" aria-label="Digitify — Home">
            <span class="logo-mark has-logo-image"><img src="${logoPath}" alt="${brandName}"></span>
          </a>
          <p class="digitify-header-tag">${tagline}</p>
        </div>
        <nav class="digitify-header-nav" aria-label="Hoofdnavigatie">
          <a href="${wpUrl(cfg, '/diensten/')}">Diensten</a>
          <a href="${wpUrl(cfg, '/cases/')}">Cases</a>
          <a href="${wpUrl(cfg, '/over-ons/')}">Over ons</a>
          <a href="${wpUrl(cfg, '/contact/')}">Contact</a>
          <a href="/shop" class="is-shop${active === 'shop' ? ' is-active' : ''}">Webshop</a>
        </nav>
        <div class="digitify-header-end">
          <div class="digitify-header-contact">
            <a href="tel:+32486515773" aria-label="Bel ons">☎</a>
            <a href="mailto:contact@digitify.be" aria-label="Mail ons">✉</a>
            <a href="https://wa.me/32486515773" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">WA</a>
          </div>
          <a href="${wpUrl(cfg, '/contact/')}" class="digitify-header-cta">Offerte <span aria-hidden="true">→</span></a>
          <span data-cart-icon></span>
          <span data-nav-user style="display:flex;gap:.5rem;align-items:center"></span>
        </div>
      </div>`;
    document.body.classList.add('digitify-shop-body');
    document.body.prepend(header);

    document.querySelectorAll('.nav').forEach((nav) => {
      if (!nav.closest('#digitifySiteHeader')) nav.classList.add('digitify-legacy-hidden');
    });
  }

  function renderFooterBridge(cfg) {
    const mount = document.getElementById('siteFooterMount');
    if (!mount || mount.querySelector('.digitify-footer-bridge')) return;
    const bridge = document.createElement('div');
    bridge.className = 'digitify-footer-bridge';
    bridge.innerHTML = `<p><a href="${siteBase(cfg)}/">← Terug naar digitify.be</a> · Webdesign, media & marketing</p>`;
    mount.prepend(bridge);
  }

  async function init() {
    if (document.body.classList.contains('admin-page')) return;
    injectAmbient();
    let cfg = window.NEB_CONFIG || {};
    try {
      if (window.NEB?.config) cfg = await NEB.config();
      window.NEB_CONFIG = cfg;
    } catch (_) {}

    renderHeader(cfg);
    renderFooterBridge(cfg);

    if (window.NEB?.applyBranding) NEB.applyBranding(cfg);
    if (window.NEB?.paintNav) await NEB.paintNav();
    if (window.NEB?.paintCart) NEB.paintCart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DigitifyShell = { init, siteBase, wpUrl };
})();
