(function () {
  var SHOP_PATH = /^\/(?:$|login|register|dashboard|admin|account|cart|shop|designer|prijzen|maattabel|support|faq|contact|verzending|legal|privacy|voorwaarden|retourneren)(?:\/|$)/;

  document.documentElement.classList.add('digitify-page-loading', 'digitify-shell-booting');

  if (!document.getElementById('digitifyCriticalCss')) {
    var style = document.createElement('style');
    style.id = 'digitifyCriticalCss';
    style.textContent = [
      'html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}',
      'body.theme-light.digitify-shop-body{background:#fff9f2;color:#0a0a0a}',
      'body.theme-light.digitify-shop-body{padding-top:65px}',
      'body.theme-light.storefront-page .storefront-hero .hero-headline,',
      'body.theme-light.storefront-page .storefront-hero h1.hero-headline{color:#0a0a0a;text-shadow:none}',
      'body.theme-light.storefront-page .storefront-hero .hero-lead{color:#3d4450;text-shadow:none}',
      'body.theme-light.storefront-page .storefront-hero .storefront-kicker,',
      'body.theme-light.storefront-page .storefront-hero .hero-eyebrow{color:#c8781f;text-shadow:none}',
      'body.theme-light.storefront-page .storefront-hero-facts .hero-fact{color:#3d4450;text-shadow:none}',
      '.digitify-page-overlay{position:fixed;inset:0;z-index:10000;background:#fff9f2;opacity:1;pointer-events:none;transition:opacity .38s ease}',
      'html.digitify-page-ready .digitify-page-overlay{opacity:0}',
      'html.digitify-page-leaving .digitify-page-overlay{opacity:1;pointer-events:auto;transition:opacity .24s ease}',
      'body.digitify-shop-body .digitify-page-content{opacity:0;transition:opacity .42s ease .04s}',
      'html.digitify-page-ready body.digitify-shop-body .digitify-page-content{opacity:1}',
      'html.digitify-shell-booting .digitify-site-header{opacity:0}',
      'html.digitify-page-ready .digitify-site-header{opacity:1;transition:opacity .35s ease .08s}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (document.getElementById('digitifyPageOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'digitifyPageOverlay';
    overlay.className = 'digitify-page-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    (document.body || document.documentElement).appendChild(overlay);
  }

  function markPageContent() {
    if (!document.body || document.body.dataset.pageContentMarked) return;
    var main = document.querySelector('main')
      || document.querySelector('.app-shell')
      || document.querySelector('.auth-wrap');
    if (main && !main.classList.contains('digitify-page-content')) {
      main.classList.add('digitify-page-content');
    }
    document.body.dataset.pageContentMarked = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensureOverlay();
      markPageContent();
    });
  } else {
    ensureOverlay();
    markPageContent();
  }

  if (!window.__NEB_CONFIG_PROMISE && !window.NEB_CONFIG) {
    window.__NEB_CONFIG_PROMISE = fetch('/api/config', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('config');
        return r.json();
      })
      .catch(function () { return null; });
  }

  if (!document.getElementById('digitifyPreconnect')) {
    var preconnect = document.createElement('link');
    preconnect.id = 'digitifyPreconnect';
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://esm.sh';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  }

  if (!document.getElementById('digitifyHeaderDeckCss')) {
    var link = document.createElement('link');
    link.id = 'digitifyHeaderDeckCss';
    link.rel = 'stylesheet';
    link.href = '/digitify-header-deck.css?v=7';
    document.head.appendChild(link);
  }

  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^mailto:|^tel:|^javascript:/i.test(href)) return;
    var url;
    try { url = new URL(href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || !SHOP_PATH.test(url.pathname)) return;
    if (url.href === location.href) return;
    e.preventDefault();
    document.documentElement.classList.remove('digitify-page-ready');
    document.documentElement.classList.add('digitify-page-leaving', 'digitify-page-loading');
    ensureOverlay();
    window.setTimeout(function () { location.href = url.href; }, 240);
  }, true);
})();
