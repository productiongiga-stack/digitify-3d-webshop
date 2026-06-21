(function () {
  document.documentElement.classList.add('digitify-shell-booting');
  const DEFAULT_WP = 'https://digitify.be';

  const ICONS = {
    phone: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"/></svg>',
    mail: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>',
    map: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>',
    whatsapp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    facebook: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>'
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  function siteBase(cfg) {
    return String(cfg?.site?.wordpressUrl || DEFAULT_WP).replace(/\/+$/, '');
  }

  function wpUrl(cfg, path) {
    return siteBase(cfg) + path;
  }

  function ensureHeaderCss() {
    if (document.getElementById('digitifyHeaderDeckCss')) return;
    const link = document.createElement('link');
    link.id = 'digitifyHeaderDeckCss';
    link.rel = 'stylesheet';
    link.href = '/digitify-header-deck.css?v=7';
    document.head.appendChild(link);
  }

  function ensureFooterCss() {
    if (document.getElementById('digitifyFooterCss')) return;
    const link = document.createElement('link');
    link.id = 'digitifyFooterCss';
    link.rel = 'stylesheet';
    link.href = '/digitify-footer.css?v=7';
    document.head.appendChild(link);
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

  function isNavItemActive(item, active) {
    if (item.active != null) return item.active;
    if (Array.isArray(item.keys) && item.keys.includes(active)) return true;
    return item.key === active;
  }

  function navLinkClass(item, active) {
    const isActive = isNavItemActive(item, active);
    return `digitify-nav__link${item.linkClass ? ' ' + item.linkClass : ''}${isActive ? ' is-active' : ''}`;
  }

  function renderDesktopNav(cfg, active) {
    const items = [
      { href: wpUrl(cfg, '/diensten/'), label: 'Diensten', key: 'diensten' },
      { href: wpUrl(cfg, '/cases/'), label: 'Cases', key: 'cases' },
      { href: wpUrl(cfg, '/over-ons/'), label: 'Over ons', key: 'over-ons' },
      { href: wpUrl(cfg, '/contact/'), label: 'Contact', key: 'contact' },
      { href: '/', label: 'Shop', key: 'shop', keys: ['shop', 'producten', 'home'], linkClass: 'digitify-nav__link--shop' },
      { href: '/designer', label: 'Designer', key: 'designer', linkClass: 'digitify-nav__link--shop' }
    ];
    return items.map((item) => `
      <li class="digitify-nav__item">
        <a href="${item.href}" class="${navLinkClass(item, active)}">${item.label}</a>
      </li>`).join('');
  }

  function mobileItemClass(isActive, extra) {
    return `digitify-mobile-nav__item${extra ? ' ' + extra : ''}${isActive ? ' is-active' : ''}`;
  }

  function renderMobileShopLinks(active) {
    const items = [
      { href: '/', label: 'Shop', keys: ['shop', 'producten', 'home'], accent: true },
      { href: '/designer', label: 'Designer', keys: ['designer'], accent: true },
      { href: '/cart', label: 'Winkelmand', keys: ['cart'], accent: true }
    ];
    return items.map((item) => {
      const isActive = item.keys.includes(active);
      return `<a href="${item.href}" class="${mobileItemClass(isActive, item.accent ? 'digitify-mobile-nav__item--accent' : '')}">${item.label}</a>`;
    }).join('');
  }

  function renderMobileSiteLinks(cfg, active) {
    const wp = siteBase(cfg);
    const items = [
      { href: wp + '/', label: 'Home', keys: [] },
      { href: wpUrl(cfg, '/diensten/'), label: 'Diensten', keys: [] },
      { href: wpUrl(cfg, '/cases/'), label: 'Cases', keys: [] },
      { href: wpUrl(cfg, '/over-ons/'), label: 'Over ons', keys: [] },
      { href: wpUrl(cfg, '/contact/'), label: 'Contact', keys: ['contact'] }
    ];
    return items.map((item) => {
      const isActive = item.keys.includes(active);
      return `<a href="${item.href}" class="${mobileItemClass(isActive, 'digitify-mobile-nav__item--muted')}">${item.label}</a>`;
    }).join('');
  }

  function patchHeaderBranding(cfg) {
    const logoPath = cfg?.theme?.logoPath
      ? '/' + String(cfg.theme.logoPath).replace(/^\/+/, '')
      : '/assets/branding/logo-header.png';
    const logoSrc = logoPath.includes('logo-black.png') ? '/assets/branding/logo-header.png' : logoPath;
    document.querySelectorAll('.digitify-logo__img--brand').forEach((img) => {
      if (img.getAttribute('src') !== logoSrc) img.setAttribute('src', logoSrc);
    });
  }

  function renderHeader(cfg, { replace = true } = {}) {
    if (!replace && document.getElementById('digitifySiteHeaderWrap')) {
      patchHeaderBranding(cfg);
      return;
    }
    document.getElementById('digitifySiteHeaderWrap')?.remove();
    document.getElementById('digitify-mobile-nav')?.remove();

    const active = String(document.body.dataset.nav || '').toLowerCase();
    const wp = siteBase(cfg);
    const logoPath = cfg?.theme?.logoPath
      ? '/' + String(cfg.theme.logoPath).replace(/^\/+/, '')
      : '/assets/branding/logo-header.png';
    const logoSrc = logoPath.includes('logo-black.png') ? '/assets/branding/logo-header.png' : logoPath;
    const brandName = String(cfg?.brand?.name || 'Digitify');

    const wrap = document.createElement('div');
    wrap.id = 'digitifySiteHeaderWrap';
    wrap.className = 'digitify-site-header';
    wrap.innerHTML = `
      <header class="digitify-header digitify-header--deck" role="banner">
        <div class="digitify-header__rail" aria-hidden="true"><span class="digitify-header__rail-accent"></span></div>
        <div class="digitify-header__shell">
            <div class="digitify-header__grid digitify-header__grid--shop">
            <div class="digitify-header__start">
              <div class="digitify-header__brand">
                <a href="${wp}/" class="digitify-logo digitify-logo--header" aria-label="${brandName} — Home">
                  <img class="digitify-logo__img--brand" src="${logoSrc}" alt="${brandName}" width="168" height="44" loading="eager" fetchpriority="high" decoding="async">
                </a>
              </div>
            </div>

            <nav class="digitify-header__nav digitify-nav" role="navigation" aria-label="Hoofdnavigatie">
              <ul class="digitify-nav__list">${renderDesktopNav(cfg, active)}</ul>
            </nav>

            <div class="digitify-header__end">
              <div class="digitify-header__actions" aria-label="Shop acties">
                <div class="digitify-header__shop-tools">
                  <span data-cart-icon>
                    <a class="nav-cart" href="/cart" title="Winkelmand" aria-label="Winkelmand">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                    </a>
                  </span>
                  <span data-nav-user class="digitify-header__auth">
                    <a class="digitify-header__auth-link" href="/login">Inloggen</a>
                    <a class="digitify-header__auth-link digitify-header__auth-link--solid" href="/register">Aanmelden</a>
                  </span>
                </div>
                <a href="${wpUrl(cfg, '/contact/')}" class="digitify-header__cta">
                  <span class="digitify-header__cta-label">Offerte</span>
                  <span class="digitify-header__cta-icon" aria-hidden="true">&rarr;</span>
                </a>
              </div>
              <button class="digitify-menu-toggle" type="button" aria-label="Menu openen" aria-expanded="false" aria-controls="digitify-mobile-nav">
                <span></span><span></span><span></span>
              </button>
            </div>
          </div>
        </div>
        <div class="digitify-header__progress" aria-hidden="true"><span></span></div>
      </header>

      <div class="digitify-mobile-nav digitify-mobile-nav--shop" id="digitify-mobile-nav" aria-hidden="true">
        <div class="digitify-mobile-nav__overlay"></div>
        <div class="digitify-mobile-nav__panel" role="dialog" aria-modal="true" aria-label="Menu">
          <div class="digitify-mobile-nav__head">
            <a href="/" class="digitify-mobile-nav__brand" aria-label="Digitify Shop">
              <img class="digitify-logo__img--brand" src="${logoSrc}" alt="${brandName}" width="132" height="35" loading="eager" decoding="async">
            </a>
            <button class="digitify-mobile-nav__close" type="button" aria-label="Menu sluiten">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="digitify-mobile-nav__scroll">
            <section class="digitify-mobile-nav__section">
              <span class="digitify-mobile-nav__label">Shop</span>
              <nav class="digitify-mobile-nav__list" aria-label="Shop navigatie">
                ${renderMobileShopLinks(active)}
              </nav>
            </section>
            <section class="digitify-mobile-nav__section">
              <span class="digitify-mobile-nav__label">Digitify website</span>
              <nav class="digitify-mobile-nav__list digitify-mobile-nav__list--compact" aria-label="Website navigatie">
                ${renderMobileSiteLinks(cfg, active)}
              </nav>
            </section>
            <section class="digitify-mobile-nav__section">
              <span class="digitify-mobile-nav__label">Account</span>
              <nav class="digitify-mobile-nav__list digitify-mobile-nav__list--compact digitify-mobile-nav__auth" data-mobile-auth aria-label="Account navigatie"></nav>
            </section>
          </div>
          <div class="digitify-mobile-nav__footer">
            <a href="mailto:contact@digitify.be" class="digitify-mobile-nav__footer-link">contact@digitify.be</a>
            <a href="${wp}/" class="digitify-mobile-nav__footer-link digitify-mobile-nav__footer-link--accent">digitify.be</a>
          </div>
        </div>
      </div>`;

    document.body.classList.add('digitify-shop-body');
    document.body.prepend(wrap);

    document.querySelectorAll('.nav').forEach((nav) => {
      nav.classList.add('digitify-legacy-hidden');
    });
  }

  function wireHeaderScroll() {
    const siteHeader = document.querySelector('.digitify-site-header');
    const header = document.querySelector('.digitify-header');
    const scrollProgress = document.querySelector('.digitify-header__progress span');
    const update = () => {
      const scrolled = window.scrollY > 20;
      siteHeader?.classList.toggle('is-scrolled', scrolled);
      header?.classList.toggle('is-scrolled', scrolled);
      document.body.classList.toggle('digitify-scrolled', scrolled);
      if (scrollProgress) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? Math.min(100, (window.scrollY / maxScroll) * 100) : 0;
        scrollProgress.style.width = progress + '%';
      }
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  function wireMobileNav() {
    const mobileNav = document.getElementById('digitify-mobile-nav');
    const menuToggle = document.querySelector('.digitify-menu-toggle');
    const mobileClose = document.querySelector('.digitify-mobile-nav__close');
    const mobileOverlay = document.querySelector('.digitify-mobile-nav__overlay');
    if (!mobileNav || !menuToggle) return;

    const setOpen = (open) => {
      mobileNav.classList.toggle('is-open', open);
      mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.classList.toggle('digitify-menu-open', open);
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    menuToggle.addEventListener('click', () => setOpen(!mobileNav.classList.contains('is-open')));
    mobileClose?.addEventListener('click', () => setOpen(false));
    mobileOverlay?.addEventListener('click', () => setOpen(false));
    mobileNav.querySelectorAll('.digitify-mobile-nav__panel a, .digitify-mobile-nav__panel button[data-mobile-logout]').forEach((el) => {
      el.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  async function paintMobileAuth(user) {
    const slot = document.querySelector('[data-mobile-auth]');
    if (!slot) return;
    if (!user) {
      slot.innerHTML = `
      <div class="digitify-mobile-nav__auth-actions">
        <a href="/login" class="digitify-mobile-nav__auth-btn">Inloggen</a>
        <a href="/register" class="digitify-mobile-nav__auth-btn digitify-mobile-nav__auth-btn--solid">Aanmelden</a>
      </div>`;
      return;
    }
    const isStaff = user.role === 'OWNER' || user.role === 'ADMIN';
    slot.innerHTML = `
      <a href="/account" class="digitify-mobile-nav__item digitify-mobile-nav__item--muted">Account</a>
      <a href="/dashboard" class="digitify-mobile-nav__item digitify-mobile-nav__item--muted">Mijn bestellingen</a>
      ${isStaff ? `<a href="/admin?tab=settings" class="digitify-mobile-nav__item digitify-mobile-nav__item--muted">Instellingen</a>` : ''}
      ${isStaff ? `<a href="/admin" class="digitify-mobile-nav__item digitify-mobile-nav__item--muted">Admin</a>` : ''}
      <button type="button" class="digitify-mobile-nav__item digitify-mobile-nav__item--muted digitify-mobile-nav__item--button" data-mobile-logout>Uitloggen</button>`;
    slot.querySelector('[data-mobile-logout]')?.addEventListener('click', async () => {
      await window.NEB?.post('/api/auth/logout');
      location.href = '/login';
    });
  }

  async function refreshAuth() {
    const user = window.NEB_USER || await window.NEB?.me?.().catch(() => null) || null;
    if (window.NEB?.paintNav) await window.NEB.paintNav();
    await paintMobileAuth(user);
    return user;
  }

  async function waitForHeaderSlot(maxMs = 5000) {
    const start = Date.now();
    while (!document.querySelector('.digitify-site-header [data-nav-user]')) {
      if (Date.now() - start > maxMs) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  function getFooterMount() {
    let mount = document.getElementById('siteFooterMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'siteFooterMount';
      document.body.appendChild(mount);
    }
    return mount;
  }

  function renderFooter(cfg) {
    const mount = getFooterMount();
    if (mount.querySelector('.digitify-footer')) return;

    mount.querySelector('.digitify-footer-bridge')?.remove();
    mount.querySelector('.footer')?.remove();

    const wp = siteBase(cfg);
    const tagline = String(cfg?.brand?.tagline || 'Partner in Digital Solutions');
    const footerLogo = (() => {
      const black = cfg?.theme?.logoBlackPath
        ? '/' + String(cfg.theme.logoBlackPath).replace(/^\/+/, '')
        : '/assets/branding/logo-black.png';
      const header = cfg?.theme?.logoPath
        ? '/' + String(cfg.theme.logoPath).replace(/^\/+/, '')
        : '/assets/branding/logo-header.png';
      return black.includes('logo-black') ? black : header;
    })();

    const footer = document.createElement('footer');
    footer.className = 'digitify-footer digitify-footer--light-premium digitify-footer--atelier';
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = `
      <div class="digitify-footer__top-rail" aria-hidden="true"><span></span></div>

      <div class="digitify-footer__closing">
        <div class="digitify-footer__cta digitify-footer__cta--band">
          <div class="digitify-footer__cta-accent-rail" aria-hidden="true"><span></span></div>
          <div class="digitify-footer__cta-band">
            <div class="digitify-footer__cta-copy">
              <span class="digitify-footer__cta-eyebrow">Klaar om te groeien?</span>
              <h2>
                Start uw digitale project
                <span class="digitify-footer__cta-highlight">vandaag</span>
              </h2>
              <p>Vertel ons over uw plannen — wij reageren binnen 24 uur met concrete tips.</p>
            </div>
            <div class="digitify-footer__cta-actions digitify-footer__cta-actions--band">
              <a href="${wpUrl(cfg, '/contact/')}" class="digitify-btn digitify-btn--primary digitify-footer__cta-primary">
                Offerte aanvragen
                <span class="digitify-footer__cta-primary-icon" aria-hidden="true">&rarr;</span>
              </a>
              <p class="digitify-footer__cta-trust">24u reactie · Gratis kennismaking · Gent &amp; remote</p>
              <div class="digitify-footer__cta-quick">
                <a href="tel:+32486515773">${icon('phone')} Bel ons</a>
                <a href="https://wa.me/32486515773" class="digitify-footer__cta-quick--wa" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} WhatsApp</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="digitify-footer__container">
        <div class="digitify-footer__studio">
          <div class="digitify-footer__studio-inner">
            <div class="digitify-footer__brand digitify-footer__brand-hero">
              <a href="${wp}/" class="digitify-footer__logo-link" aria-label="Digitify — Home">
                <img class="digitify-footer__logo-main" src="${footerLogo}" alt="Digitify" width="200" height="56" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/branding/logo-header.png';">
              </a>
              <p class="digitify-footer__tagline"><span data-brand-tagline>${tagline}</span></p>
              <p class="digitify-footer__brand-note">Webdesign, media &amp; marketing voor groeiende merken.</p>
              <div class="digitify-footer__disciplines">
                <span>Webdesign</span>
                <span>Media</span>
                <span>Marketing</span>
              </div>
              <div class="digitify-footer__social">
                <a href="https://www.facebook.com/digitify.be" class="digitify-social-btn digitify-social-btn--facebook" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${icon('facebook')}</a>
                <a href="https://www.instagram.com/digitify.be/" class="digitify-social-btn digitify-social-btn--instagram" target="_blank" rel="noopener noreferrer" aria-label="Instagram">${icon('instagram')}</a>
              </div>
            </div>

            <div class="digitify-footer__grid">
              <nav class="digitify-footer__col digitify-footer__col--nav" aria-label="Footer navigatie">
                <span class="digitify-footer__col-label">Navigatie</span>
                <ul class="digitify-footer__links digitify-footer__links--numbered">
                  <li><a href="${wp}/">Home</a></li>
                  <li><a href="${wpUrl(cfg, '/diensten/')}">Diensten</a></li>
                  <li><a href="${wpUrl(cfg, '/cases/')}">Cases</a></li>
                  <li><a href="${wpUrl(cfg, '/over-ons/')}">Over ons</a></li>
                  <li><a href="${wpUrl(cfg, '/contact/')}">Contact</a></li>
                  <li><a href="/" class="digitify-footer__link--shop">Shop</a></li>
                  <li><a href="/designer" class="digitify-footer__link--shop">Designer</a></li>
                </ul>
              </nav>

              <nav class="digitify-footer__col digitify-footer__col--services" aria-label="Footer diensten">
                <span class="digitify-footer__col-label">Expertise</span>
                <ul class="digitify-footer__links digitify-footer__links--numbered">
                  <li><a href="${wpUrl(cfg, '/webdesign/')}">Websites &amp; webshops</a></li>
                  <li><a href="${wpUrl(cfg, '/media/')}">Video &amp; content</a></li>
                  <li><a href="${wpUrl(cfg, '/marketing/')}">Ads &amp; campagnes</a></li>
                </ul>
              </nav>

              <div class="digitify-footer__col digitify-footer__col--contact">
                <span class="digitify-footer__col-label">Contact</span>
                <ul class="digitify-footer__links digitify-footer__links--contact">
                  <li>${icon('map')}<span>Boekweitstraat 7, 9000 Gent</span></li>
                  <li>${icon('phone')}<a href="tel:+32486515773">+32 486 51 57 73</a></li>
                  <li>${icon('mail')}<a href="mailto:contact@digitify.be">contact@digitify.be</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="digitify-footer__ticker" aria-hidden="true">
          <div class="digitify-footer__ticker-track">
            <span>Webdesign</span><span>Media</span><span>Marketing</span><span>Gent</span><span>Digital Solutions</span><span>Cases</span>
            <span>Webdesign</span><span>Media</span><span>Marketing</span><span>Gent</span><span>Digital Solutions</span><span>Cases</span>
          </div>
        </div>

        <div class="digitify-footer__rail">
          <div class="digitify-footer__rail-accent" aria-hidden="true"><span></span></div>
          <div class="digitify-footer__rail-inner">
            <p class="digitify-footer__copyright">
              &copy; ${new Date().getFullYear()} Digitify
              <span class="digitify-footer__bar-dot" aria-hidden="true">&middot;</span>
              BE0685.556.507
            </p>
            <nav class="digitify-footer__legal" aria-label="Juridische links">
              <a href="${wpUrl(cfg, '/algemene-voorwaarden/')}">Algemene Voorwaarden</a>
              <a href="${wpUrl(cfg, '/cookiebeleid/')}">Cookiebeleid</a>
              <a href="${wpUrl(cfg, '/privacyverklaring/')}">Privacyverklaring</a>
            </nav>
          </div>
        </div>
      </div>`;
    mount.appendChild(footer);
  }

  async function init() {
    ensureFooterCss();
    injectAmbient();

    let cfg = window.NEB_CONFIG || {};
    renderHeader(cfg);
    wireHeaderScroll();
    wireMobileNav();
    renderFooter(cfg);
    if (window.NEB?.applyBranding) NEB.applyBranding(cfg);

    await refreshAuth();

    if (document.body.classList.contains('storefront-page')) {
      const hasEmbeddedCatalog = Array.isArray(window.NEB_CONFIG?.products) && window.NEB_CONFIG.products.length > 0;
      await new Promise((resolve) => {
        if (document.documentElement.classList.contains('digitify-storefront-ready')) {
          resolve();
          return;
        }
        document.addEventListener('digitify:storefront-ready', resolve, { once: true });
        window.setTimeout(resolve, hasEmbeddedCatalog ? 900 : 2200);
      });
    }

    document.documentElement.classList.add('digitify-page-ready');
    document.documentElement.classList.remove('digitify-shell-booting');
    document.documentElement.classList.add('digitify-shell-ready');
    document.dispatchEvent(new CustomEvent('digitify:shell-ready'));
    window.setTimeout(() => {
      document.documentElement.classList.remove('digitify-page-loading', 'digitify-page-leaving');
      document.getElementById('digitifyPageOverlay')?.remove();
    }, 420);

    try {
      const hasCatalog = Array.isArray(window.NEB_CONFIG?.products) && window.NEB_CONFIG.products.length > 0;
      if (!hasCatalog && window.NEB?.config) {
        const fresh = await NEB.config();
        window.NEB_CONFIG = fresh;
        renderHeader(fresh, { replace: false });
        if (window.NEB?.applyBranding) NEB.applyBranding(fresh);
        renderFooter(fresh);
        await refreshAuth();
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DigitifyShell = { init, refreshAuth, paintMobileAuth, waitForHeaderSlot, siteBase, wpUrl };
})();
