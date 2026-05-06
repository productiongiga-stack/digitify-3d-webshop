// ==========================================================================
// NEBULOUS — designer bootstrap
// Pulls /api/config and rebuilds the dynamic blocks of index.html
// (colors, sizes, hero text, base price, reviews, features, footer)
// BEFORE script.js's DOMContentLoaded init runs.
// ==========================================================================

(function () {
  // Fetch config & user in parallel, then patch DOM and signal ready
  const ready = Promise.all([
    fetch('/api/config').then(r => r.json()).catch(() => null),
    NEB.me().catch(() => null)
  ]).then(([cfg, user]) => {
    window.NEB_CONFIG = cfg || {};
    window.NEB_USER = user || null;
    if (cfg) applyConfig(cfg);
    document.dispatchEvent(new CustomEvent('neb:config-ready', { detail: { cfg, user } }));
    NEB.paintNav();
  });

  // Expose so script.js can wait for us
  window.NEB_READY = ready;

  function fmtEUR(n) { return '€' + (Number(n) || 0).toFixed(2).replace('.', ','); }

  function applyConfig(cfg) {
    if (typeof NEB !== 'undefined' && NEB?.applyBranding) {
      NEB.applyBranding(cfg);
    }

    // ── Brand / hero ─────────────────────────────────────────────────────
    const brandName = cfg.brand?.name || 'NEBULOUS';
    document.title = `${brandName} - Designer`;
    document.querySelectorAll('.logo span:last-child').forEach((el) => { el.textContent = brandName; });
    const hero = cfg.hero || {};
    setText('.hero-badge', hero.badge, true /* keep dot */);
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle && (hero.title1 || hero.title2)) {
      heroTitle.innerHTML = `<span>${escape(hero.title1 || '')}</span><span class="gradient-text">${escape(hero.title2 || '')}</span>`;
    }
    setText('.hero-sub', hero.subtitle);
    const cta = document.querySelector('.hero-cta span');
    if (cta && hero.cta) cta.textContent = hero.cta;
    applyHeroVideo(hero.videoUrl || '', hero);

    // ── Base price tag ──────────────────────────────────────────────────
    const navBase = document.getElementById('navBasePrice');
    if (navBase && cfg.pricing?.basePrice != null) navBase.innerHTML = fmtEUR(cfg.pricing.basePrice);

    // ── Color swatches (designer panel) ─────────────────────────────────
    const colors = (cfg.colors || []).filter(c => c.enabled !== false);
    const colorBox = document.getElementById('colorOptions');
    if (colorBox && colors.length) {
      const idxWhite = colors.findIndex((c) => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(c?.hex || '').trim());
        if (!m) return false;
        const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq > 210;
      });
      const defaultIdx = idxWhite >= 0 ? idxWhite : 0;
      colorBox.innerHTML = colors.map((c, i) => `
        <button class="color-swatch ${i === defaultIdx ? 'active' : ''}" data-color="${c.hex}" data-name="${escape(c.name)}" style="background:${c.hex}" title="${escape(c.name)}"></button>
      `).join('');
      const cn = document.getElementById('colorName');
      if (cn) cn.textContent = colors[defaultIdx].name;
    }

    // ── Sizes ────────────────────────────────────────────────────────────
    const sizes = cfg.sizes || [];
    const sizeBox = document.getElementById('sizeSelector');
    if (sizeBox && sizes.length) {
      const def = sizes.includes('M') ? 'M' : sizes[Math.floor(sizes.length / 2)];
      sizeBox.innerHTML = sizes.map(s => `
        <button class="size-btn ${s === def ? 'active' : ''}" data-size="${s}">${s}</button>
      `).join('');
    }

    // ── Reviews ──────────────────────────────────────────────────────────
    const reviewsGrid = document.querySelector('.reviews-grid');
    if (reviewsGrid && Array.isArray(cfg.reviews)) {
      reviewsGrid.innerHTML = cfg.reviews.map(r => `
        <div class="review-card">
          <div class="review-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
          <p>"${escape(r.text || '')}"</p>
          <div class="review-author">
            <div class="author-avatar">${escape(r.initials || (r.name || '?')[0])}</div>
            <div><strong>${escape(r.name || '')}</strong><span>Geverifieerde aankoop</span></div>
          </div>
        </div>
      `).join('');
    }

    // ── Features ─────────────────────────────────────────────────────────
    const featuresGrid = document.querySelector('.features-grid');
    if (featuresGrid && Array.isArray(cfg.features)) {
      const icons = [
        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
        '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4a2 2 0 012 2v6a2 2 0 01-2 2h-4"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
        '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
      ];
      featuresGrid.innerHTML = cfg.features.map((f, i) => `
        <div class="feature-card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${icons[i % icons.length]}</svg>
          <div><h4>${escape(f.title)}</h4><p>${escape(f.text)}</p></div>
        </div>
      `).join('');
    }

    // ── Footer brand tagline ────────────────────────────────────────────
    if (cfg.brand?.tagline) {
      const fb = document.querySelector('.footer-brand p');
      if (fb) fb.textContent = cfg.brand.tagline;
    }

    // ── Delivery text in modal ──────────────────────────────────────────
    const md = document.querySelector('.modal-details strong');
    if (md && cfg.pricing?.deliveryText) md.textContent = cfg.pricing.deliveryText;
  }

  function setText(sel, val, preserveFirstChild = false) {
    if (val == null) return;
    const el = document.querySelector(sel);
    if (!el) return;
    if (preserveFirstChild && el.firstElementChild) {
      // keep the leading dot/icon, append text
      el.innerHTML = el.firstElementChild.outerHTML + ' ' + escape(val);
    } else {
      el.textContent = val;
    }
  }

  function extractYoutubeId(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const plain = value.match(/^[A-Za-z0-9_-]{8,20}$/);
    if (plain) return plain[0].slice(0, 20);
    const m = value.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{8,20})/);
    return m ? m[1].slice(0, 20) : '';
  }

  function applyHeroVideo(rawVideoUrl, heroCfg) {
    const wrap = document.getElementById('heroVideoWrap');
    const frame = document.getElementById('heroVideoFrame');
    if (!wrap || !frame) return;
    const colorRaw = String(heroCfg?.videoOverlayColor || '#000000').trim();
    const overlayRaw = Number(heroCfg?.videoOverlayOpacity);
    const blurRaw = Number(heroCfg?.videoBlurPx);
    const overlay = Number.isFinite(overlayRaw) ? Math.max(0, Math.min(0.9, overlayRaw)) : 0.55;
    const blur = Number.isFinite(blurRaw) ? Math.max(0, Math.min(8, Math.round(blurRaw))) : 0;
    const overlayEnd = Math.max(0, Math.min(0.9, overlay * 0.55));
    const rgb = hexToRgbTriple(colorRaw) || '0,0,0';
    wrap.style.setProperty('--hero-video-overlay-rgb', rgb);
    wrap.style.setProperty('--hero-video-overlay-opacity', String(overlay));
    wrap.style.setProperty('--hero-video-overlay-opacity-end', String(overlayEnd));
    wrap.style.setProperty('--hero-video-blur', `${blur}px`);
    const id = extractYoutubeId(rawVideoUrl);
    if (!id) {
      frame.removeAttribute('src');
      wrap.hidden = true;
      return;
    }
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&rel=0&modestbranding=1&playsinline=1`;
    wrap.hidden = false;
  }

  function hexToRgbTriple(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return '';
    return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
  }

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
