// ==========================================================================
// NEBULOUS — shared client helpers (auth, nav, API, toast)
// ==========================================================================

if (window.location.protocol === 'file:') {
  const pathRaw = String(window.location.pathname || '').replace(/\/+$/, '');
  const m = pathRaw.match(/\/public\/([^/]+?)(?:\.html)?$/i);
  let slug = (m && m[1] ? m[1] : '').toLowerCase();
  if (!slug) {
    const last = pathRaw.split('/').filter(Boolean).pop() || 'index';
    slug = last.replace(/\.html$/i, '').toLowerCase();
  }
  const target = slug === 'index' ? '/' : `/${slug}`;
  window.location.replace(`http://localhost:3737${target}`);
}

const NEB = (() => {
  const HEX6_RE = /^#([0-9a-fA-F]{6})$/;
  const FONT_MAP = {
    POPPINS: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
    INTER: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    SPACE_GROTESK: "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    SYSTEM: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    SERIF: "Georgia, 'Times New Roman', Times, serif"
  };

  function normalizeHex(raw, fallback) {
    const s = String(raw || '').trim();
    if (HEX6_RE.test(s)) return s.toLowerCase();
    return fallback;
  }
  function toAssetUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return '/' + s.replace(/^\/+/, '');
  }
  function hexToRgb(hex) {
    const h = normalizeHex(hex, '#ffffff').slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${r},${g},${b},${a})`;
  }
  function mixHex(aHex, bHex, ratio) {
    const a = Math.max(0, Math.min(1, Number(ratio) || 0));
    const c1 = hexToRgb(aHex);
    const c2 = hexToRgb(bHex);
    const r = Math.round(c1.r + (c2.r - c1.r) * a);
    const g = Math.round(c1.g + (c2.g - c1.g) * a);
    const b = Math.round(c1.b + (c2.b - c1.b) * a);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }
  function isLightHex(hex) {
    const { r, g, b } = hexToRgb(hex);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 162;
  }

  let configRequest = null;
  let meRequest = null;

  const json = (path, opts = {}) => {
    if (window.location.protocol === 'file:' && String(path || '').startsWith('/')) {
      const err = new Error('Lokale file-modus gedetecteerd. Open via http://localhost:3737 zodat API-calls werken.');
      err.status = 0;
      err.data = { error: err.message, hint: 'Gebruik localhost i.p.v. file:// URL' };
      return Promise.reject(err);
    }
    const isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
    const headers = { ...(opts.headers || {}) };
    let body = opts.body;
    if (!isFormData && body && typeof body !== 'string') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(body);
    }
    return fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers,
      body
    }).then(async r => {
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) {
        let msg = (data && data.error) || `HTTP ${r.status}`;
        if (r.status === 413) {
          msg = 'Bestand te groot voor directe upload. Vernieuw de pagina en upload opnieuw (chunk-upload wordt dan gebruikt).';
        } else if (r.status === 403) {
          if (data?.code === 'TWO_FACTOR_SETUP_REQUIRED') {
            msg = data.error || 'Voltooi eerst 2FA via Account → 2FA.';
          } else if (typeof data === 'string' && /forbidden/i.test(data) && /::/.test(data)) {
            msg = 'Upload geblokkeerd door hosting. Vernieuw de pagina (hard refresh) en probeer opnieuw.';
          } else if (typeof data === 'string' && data.trim()) {
            msg = data.trim().slice(0, 240);
          } else if (data?.error) {
            msg = data.error;
          }
        }
        const err = new Error(msg);
        err.status = r.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  };

  function isHostedDeployment() {
    const host = String(window.location.hostname || '').toLowerCase();
    return host && host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
  }

  function uploadPlatformConfig() {
    const stored = window.NEB_UPLOAD_PLATFORM || {};
    const cfg = window.NEB_CONFIG?.platform || {};
    const maxDirect = Number(cfg.maxDirectUploadBytes ?? stored.maxDirectUploadBytes);
    const chunkBytes = Number(cfg.chunkUploadBytes ?? stored.chunkUploadBytes);
    const chunkedEnabled = cfg.chunkedUploadsEnabled ?? stored.chunkedUploadsEnabled;
    return {
      maxDirectUploadBytes: Number.isFinite(maxDirect) && maxDirect > 0
        ? maxDirect
        : Math.floor(3.5 * 1024 * 1024),
      chunkUploadBytes: Number.isFinite(chunkBytes) && chunkBytes > 0
        ? chunkBytes
        : 2 * 1024 * 1024,
      chunkedUploadsEnabled: chunkedEnabled !== false
    };
  }

  function setUploadPlatformConfig(platform) {
    if (!platform || typeof platform !== 'object') return;
    window.NEB_UPLOAD_PLATFORM = { ...uploadPlatformConfig(), ...platform };
    window.NEB_CONFIG = window.NEB_CONFIG || {};
    window.NEB_CONFIG.platform = window.NEB_UPLOAD_PLATFORM;
  }

  function maxDirectUploadBytes() {
    return uploadPlatformConfig().maxDirectUploadBytes;
  }

  function chunkUploadBytes() {
    return uploadPlatformConfig().chunkUploadBytes;
  }

  function shouldUseChunkedUpload(file) {
    if (!file) return false;
    const platform = uploadPlatformConfig();
    if (platform.chunkedUploadsEnabled && file.size > maxDirectUploadBytes()) return true;
    return file.size > maxDirectUploadBytes();
  }

  function preferChunkedAdminUpload(file) {
    if (!file) return false;
    if (isHostedDeployment()) return true;
    const platform = uploadPlatformConfig();
    if (platform.chunkedUploadsEnabled) return true;
    return shouldUseChunkedUpload(file);
  }

  async function uploadChunked(file, meta) {
    const chunkSize = chunkUploadBytes();
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    let sessionId = '';
    for (let i = 0; i < totalChunks; i++) {
      const form = new FormData();
      if (sessionId) form.append('sessionId', sessionId);
      form.append('chunkIndex', String(i));
      form.append('totalChunks', String(totalChunks));
      form.append('meta', JSON.stringify({ ...meta, totalBytes: file.size }));
      const start = i * chunkSize;
      const slice = file.slice(start, Math.min(file.size, start + chunkSize));
      form.append('chunk', slice, file.name || 'upload.bin');
      const out = await json('/api/admin/uploads/chunk', { method: 'POST', body: form });
      sessionId = out.sessionId || sessionId;
      if (out.done) return out;
    }
    const err = new Error('Chunk-upload niet afgerond');
    err.status = 500;
    throw err;
  }

  return {
    json,
    get: (p) => json(p),
    post: (p, body) => json(p, { method: 'POST', body }),
    put: (p, body) => json(p, { method: 'PUT', body }),
    del: (p) => json(p, { method: 'DELETE' }),
    shouldUseChunkedUpload,
    preferChunkedAdminUpload,
    uploadChunked,
    setUploadPlatformConfig,
    uploadPlatformConfig,

    me: () => {
      if (window.NEB_USER) return Promise.resolve(window.NEB_USER);
      if (!meRequest) {
        if (window.__NEB_ME_PROMISE) {
          meRequest = window.__NEB_ME_PROMISE
            .then((user) => {
              window.__NEB_ME_PROMISE = null;
              if (user) window.NEB_USER = user;
              return user || null;
            })
            .catch(() => null);
        } else {
          meRequest = json('/api/auth/me')
            .then((d) => {
              const user = d?.user || null;
              if (user) window.NEB_USER = user;
              return user;
            });
        }
      }
      return meRequest;
    },
    config: () => {
      if (!configRequest) {
        if (window.__NEB_CONFIG_PROMISE) {
          configRequest = window.__NEB_CONFIG_PROMISE
            .then((cfg) => {
              window.__NEB_CONFIG_PROMISE = null;
              if (cfg && typeof cfg === 'object') window.NEB_CONFIG = cfg;
              return cfg || window.NEB_CONFIG || {};
            })
            .catch((err) => {
              configRequest = null;
              throw err;
            });
        } else {
          configRequest = json('/api/config').catch((err) => {
            configRequest = null;
            throw err;
          });
        }
      }
      return configRequest;
    },

    invalidateConfigCache() {
      configRequest = null;
    },

    fmtEUR: (n) => '€' + (Number(n) || 0).toFixed(2).replace('.', ','),
    sortCatalogProducts(products) {
      return [...(Array.isArray(products) ? products : [])].sort((a, b) => {
        const ao = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 9999;
        const bo = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 9999;
        if (ao !== bo) return ao - bo;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'nl');
      });
    },
    fmtDate: (s) => {
      if (!s) return '';
      const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
      return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    statusPill(status) {
      const map = {
        NEW: ['Nieuw', 'pill-new'],
        APPROVED: ['Goedgekeurd', 'pill-pending'],
        APPROVED_AWAITING_PAYMENT: ['Goedgekeurd (betaallink volgt)', 'pill-pending'],
        PAYMENT_PENDING: ['Betaling in behandeling', 'pill-pending'],
        PAID: ['Betaald', 'pill-paid'],
        IN_PRODUCTION: ['In productie', 'pill-prod'],
        SHIPPED: ['Verzonden', 'pill-shipped'],
        DELIVERED: ['Bezorgd', 'pill-delivered'],
        CANCELLED: ['Geannuleerd', 'pill-cancelled'],
        PENDING: ['Wacht op goedkeuring', 'pill-pending'],
        ACTIVE: ['Actief', 'pill-active'],
        BLOCKED: ['Geblokkeerd', 'pill-blocked']
      };
      const [label, cls] = map[status] || [status, ''];
      return `<span class="pill ${cls}">${label}</span>`;
    },

    invoiceStatusPill(invoice) {
      const status = String(invoice?.status || '').toUpperCase();
      const overdue = !!invoice?.overdue;
      const map = {
        CONCEPT: ['Factuur concept', 'pill-invoice-concept'],
        DEFINITIVE: overdue
          ? ['Factuur overdue', 'pill-invoice-overdue']
          : ['Factuur open', 'pill-invoice-open'],
        PAID: ['Factuur betaald', 'pill-invoice-paid'],
        VOID: ['Factuur geannuleerd', 'pill-invoice-void']
      };
      const [label, cls] = map[status] || ['Factuur onbekend', 'pill-invoice-concept'];
      return `<span class="pill ${cls}">${label}</span>`;
    },

    invoiceDuePill(invoice) {
      if (!invoice?.due_date || String(invoice?.status || '').toUpperCase() !== 'DEFINITIVE') return '';
      const due = new Date(String(invoice.due_date).includes('T') ? invoice.due_date : `${invoice.due_date}Z`);
      if (!Number.isFinite(due.getTime())) return '';
      if (invoice?.overdue) return `<span class="pill pill-invoice-overdue">Vervallen ${this.fmtDate(invoice.due_date)}</span>`;
      return `<span class="pill pill-invoice-due">Vervalt ${this.fmtDate(invoice.due_date)}</span>`;
    },

    rolePill(role) {
      const map = { OWNER: 'pill-owner', ADMIN: 'pill-admin', USER: 'pill-user' };
      return `<span class="pill ${map[role] || ''}">${role}</span>`;
    },

    toast(msg, kind = '') {
      let el = document.querySelector('.neb-toast');
      if (!el) {
        el = document.createElement('div');
        el.className = 'neb-toast';
        Object.assign(el.style, {
          position: 'fixed', bottom: '24px', right: '24px',
          background: 'var(--bg-card)', color: 'var(--text)',
          border: '1px solid var(--border)', borderRadius: '12px',
          padding: '12px 18px', fontSize: '.9rem', zIndex: 9999,
          boxShadow: '0 10px 30px rgba(0,0,0,.4)', opacity: '0',
          transition: 'opacity .25s, transform .25s', transform: 'translateY(8px)'
        });
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.borderColor = kind === 'error' ? 'rgba(239,68,68,.5)' : kind === 'success' ? 'rgba(34,197,94,.5)' : 'var(--border)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 2600);
    },

    initials(user) {
      if (!user) return '?';
      const s = ((user.firstName || '') + ' ' + (user.lastName || '')).trim();
      if (s) return s.split(' ').slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
      return (user.email || '?')[0].toUpperCase();
    },

    cartHeaderSlot() {
      return document.querySelector('.digitify-site-header [data-cart-icon]')
        || document.querySelector('.digitify-header__shop-tools [data-cart-icon]')
        || document.querySelector('[data-cart-icon]');
    },

    navUserSlot() {
      return document.querySelector('.digitify-site-header [data-nav-user]')
        || document.querySelector('.digitify-header__auth[data-nav-user]')
        || document.querySelector('.digitify-header__auth [data-nav-user]')
        || document.querySelector('[data-nav-user]');
    },

    _navMenuCloseHandler: null,

    async paintNav(opts = {}) {
      const slot = this.navUserSlot();
      if (!slot) return;
      await this.paintCart();
      const user = window.NEB_USER || await this.me().catch(() => null);
    if (!user) {
      if (this._navMenuCloseHandler) {
        document.removeEventListener('click', this._navMenuCloseHandler);
        this._navMenuCloseHandler = null;
      }
      slot.innerHTML = `
          <a class="digitify-header__auth-link" href="/login">Inloggen</a>
          <a class="digitify-header__auth-link digitify-header__auth-link--solid" href="/register">Aanmelden</a>`;
      window.DigitifyShell?.paintMobileAuth?.(null);
      return null;
    }
      const isStaff = user.role === 'OWNER' || user.role === 'ADMIN';
      slot.innerHTML = `
        <div class="nav-user-menu" id="navUserMenu">
          <a class="nav-user" href="#" data-toggle>
            <span class="nav-user-avatar">${this.initials(user)}</span>
            <span>${(user.firstName || user.email).slice(0, 20)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </a>
          <div class="menu">
            <a href="/account">Account</a>
            ${isStaff ? `<a href="/admin?tab=settings">Instellingen</a>` : ''}
            <div class="divider"></div>
            <a href="/dashboard">Mijn bestellingen <span class="role-badge">${user.role}</span></a>
            <a href="/cart">Winkelmand</a>
            ${isStaff ? `
            <div class="divider"></div>
            <a href="/admin">Bestellingen</a>
            <a href="/admin?tab=users">Klanten</a>` : ''}
            <div class="divider"></div>
            <a href="/designer">Designer</a>
            <div class="divider"></div>
            <button type="button" data-logout>Uitloggen</button>
          </div>
        </div>`;
      const menu = slot.querySelector('#navUserMenu');
      menu.querySelector('[data-toggle]').addEventListener('click', (e) => {
        e.preventDefault();
        menu.classList.toggle('open');
      });
      if (this._navMenuCloseHandler) {
        document.removeEventListener('click', this._navMenuCloseHandler);
      }
      this._navMenuCloseHandler = (e) => {
        const openMenu = document.getElementById('navUserMenu');
        if (openMenu && !openMenu.contains(e.target)) openMenu.classList.remove('open');
      };
      document.addEventListener('click', this._navMenuCloseHandler);
      menu.querySelector('[data-logout]').addEventListener('click', async () => {
        await this.post('/api/auth/logout');
        location.href = '/login';
      });
      window.DigitifyShell?.paintMobileAuth?.(user);
      return user;
    },

    async requireAuth(roles = null) {
      const user = await this.me().catch(() => null);
      if (!user) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return null; }
      if (roles && !roles.includes(user.role)) { location.href = '/dashboard'; return null; }
      return user;
    },

    themeModeFromConfig(cfg = window.NEB_CONFIG || {}) {
      const raw = String(cfg?.theme?.themeMode || cfg?.theme?.mode || 'DARK').toUpperCase();
      return raw === 'LIGHT' ? 'LIGHT' : 'DARK';
    },

    initTheme() {
      const cfg = window.NEB_CONFIG || {};
      this.setTheme(this.themeModeFromConfig(cfg), { applyBranding: false });
    },

    setTheme(mode = 'DARK', opts = {}) {
      const normalized = String(mode || 'DARK').toUpperCase() === 'LIGHT' ? 'LIGHT' : 'DARK';
      document.body.classList.toggle('theme-light', normalized === 'LIGHT');
      if (window.NEB_CONFIG) {
        window.NEB_CONFIG.theme = window.NEB_CONFIG.theme || {};
        window.NEB_CONFIG.theme.themeMode = normalized;
      }
      if (opts.applyBranding !== false && window.NEB_CONFIG) this.applyBranding(window.NEB_CONFIG);
    },

    applyHeroVideo(cfg = {}) {
      const hero = cfg?.hero || {};
      const wrap = document.getElementById('heroVideoWrap');
      const frame = document.getElementById('heroVideoFrame');
      if (!wrap || !frame) return;
      const url = String(hero.videoUrl || '').trim();
      if (!url) { wrap.hidden = true; return; }
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
      const videoId = ytMatch ? ytMatch[1] : (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : null);
      if (!videoId) { wrap.hidden = true; return; }
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&controls=0&disablekb=1&modestbranding=1&playlist=${videoId}`;
      wrap.hidden = false;
      // Zet CSS-variabelen voor overlay kleur en opacity
      const overlayColor = String(hero.videoOverlayColor || '#000000').trim();
      const hex = overlayColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      const opacity = Math.min(0.95, Math.max(0, Number(hero.videoOverlayOpacity ?? 0.55)));
      const blur = Math.min(20, Math.max(0, Number(hero.videoBlurPx || 0)));
      const root = document.documentElement;
      root.style.setProperty('--hero-video-overlay-rgb', `${r},${g},${b}`);
      root.style.setProperty('--hero-video-overlay-opacity', String(opacity));
      root.style.setProperty('--hero-video-overlay-opacity-end', String(Math.max(0, opacity - 0.2)));
      root.style.setProperty('--hero-video-blur', `${blur}px`);
      // Hero tekst uit config toepassen
      const t1 = document.getElementById('heroTitle1');
      const t2 = document.getElementById('heroTitle2');
      const sub = document.getElementById('heroSubtitle');
      if (t1 && hero.title1) t1.textContent = hero.title1;
      if (t2 && hero.title2) t2.textContent = hero.title2;
      if (sub && hero.subtitle) sub.textContent = hero.subtitle;
    },

    applyBranding(cfg = {}) {
      const theme = cfg?.theme || {};
      const root = document.documentElement;
      const body = document.body;
      const themeMode = this.themeModeFromConfig(cfg);
      this.setTheme(themeMode, { applyBranding: false });
      const setVar = (name, value) => {
        root.style.setProperty(name, value);
        body?.style.setProperty(name, value);
      };

      let accent = normalizeHex(theme.accentColor, themeMode === 'LIGHT' ? '#111827' : '#ffffff');
      let accent2 = normalizeHex(theme.accentColor2, themeMode === 'LIGHT' ? '#475569' : '#bdbdbd');
      if (themeMode === 'LIGHT' && accent === '#ffffff') accent = '#111827';
      if (themeMode === 'LIGHT' && accent2 === '#bdbdbd') accent2 = '#475569';
      const invoiceOpenBg = normalizeHex(theme.invoiceOpenBg, '#1d4ed8');
      const invoiceOpenText = normalizeHex(theme.invoiceOpenText, '#eff6ff');
      const invoiceDueBg = normalizeHex(theme.invoiceDueBg, '#f59e0b');
      const invoiceDueText = normalizeHex(theme.invoiceDueText, '#111827');
      const onAccent = isLightHex(accent) ? '#0b0b0b' : '#ffffff';
      const buttonStyle = String(theme.buttonStyle || 'ROUNDED').toUpperCase();
      const sectionTone = String(theme.sectionTone || 'MUTED').toUpperCase();
      const headingFont = FONT_MAP[String(theme.headingFont || 'POPPINS').toUpperCase()] || FONT_MAP.POPPINS;
      const bodyFont = FONT_MAP[String(theme.bodyFont || 'POPPINS').toUpperCase()] || FONT_MAP.POPPINS;

      const btnRadius = buttonStyle === 'PILL' ? '999px' : buttonStyle === 'SHARP' ? '8px' : '12px';
      const hover = mixHex(accent, isLightHex(accent) ? '#000000' : '#ffffff', 0.12);
      const sectionBg = sectionTone === 'FLAT'
        ? 'var(--bg)'
        : sectionTone === 'BOLD'
          ? rgba(accent, 0.1)
          : rgba(accent, 0.06);

      setVar('--font-heading', headingFont);
      setVar('--font-body', bodyFont);
      setVar('--brand-accent', accent);
      setVar('--brand-accent-2', accent2);
      setVar('--brand-on-accent', onAccent);
      setVar('--brand-gradient', `linear-gradient(135deg, ${accent}, ${accent2})`);
      setVar('--accent-soft', rgba(accent, 0.18));
      setVar('--btn-bg', accent);
      setVar('--btn-fg', onAccent);
      setVar('--btn-bg-hover', hover);
      setVar('--r-btn', btnRadius);
      setVar('--section-bg', sectionBg);
      setVar('--orb-1-color', rgba(accent, 0.55));
      setVar('--orb-2-color', rgba(accent2, 0.55));
      setVar('--orb-3-color', rgba(mixHex(accent, accent2, 0.5), 0.55));
      setVar('--invoice-open-bg', invoiceOpenBg);
      setVar('--invoice-open-text', invoiceOpenText);
      setVar('--invoice-open-border', rgba(invoiceOpenBg, 0.6));
      setVar('--invoice-due-bg', invoiceDueBg);
      setVar('--invoice-due-text', invoiceDueText);
      setVar('--invoice-due-border', rgba(invoiceDueBg, 0.55));

      const logoMark = String(theme.logoMark || '✦').trim().slice(0, 2) || '✦';
      const logoSrc = toAssetUrl(theme.logoPath || '');
      document.querySelectorAll('.logo-mark').forEach(el => {
        if (logoSrc) {
          el.classList.add('has-logo-image');
          el.innerHTML = `<img src="${logoSrc}" alt="${cfg?.brand?.name || 'Logo'}">`;
          const img = el.querySelector('img');
          if (img) {
            img.onerror = () => {
              el.classList.remove('has-logo-image');
              el.textContent = logoMark;
            };
          }
        } else {
          el.classList.remove('has-logo-image');
          el.textContent = logoMark;
        }
      });
      if (cfg?.brand?.name) {
        document.querySelectorAll('.logo span:last-child, .auth-logo span:last-child').forEach(el => {
          el.textContent = cfg.brand.name;
        });
      }

      const faviconHref = toAssetUrl(theme.faviconPath || '');
      if (faviconHref) {
        let faviconLink = document.querySelector('link#neb-favicon');
        if (!faviconLink) {
          faviconLink = document.createElement('link');
          faviconLink.id = 'neb-favicon';
          faviconLink.rel = 'icon';
          faviconLink.type = 'image/png';
          document.head.appendChild(faviconLink);
        }
        faviconLink.href = faviconHref;
      }
    },

    paintThemeSwitch() {
      const slot = document.querySelector('[data-theme-switch]');
      if (!slot) return;
      slot.innerHTML = '';
      this.setTheme(this.themeModeFromConfig(window.NEB_CONFIG || {}), { applyBranding: false });
    },

    async paintCart() {
      const slot = this.cartHeaderSlot();
      if (!slot) return;
      const user = window.NEB_USER || await this.me().catch(() => null);
      let count = 0;
      if (user) {
        try {
          const { items } = await this.get('/api/cart');
          count = (items || []).reduce((s, i) => s + (i.qty || 0), 0);
        } catch {}
      }
      slot.innerHTML = `
        <a class="nav-cart" href="/cart" title="Winkelmand" aria-label="Winkelmand${count ? `, ${count} items` : ''}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
          ${count ? `<span class="cart-badge" id="navCartBadge">${count}</span>` : ''}
        </a>`;
    },

    async paintAdminBadges() {
      try {
        const b = await this.get('/api/admin/badges');
        const ord = document.querySelector('.tab[data-tab="orders"]');
        const usr = document.querySelector('.tab[data-tab="users"]');
        if (ord) { if (b.newOrders) ord.dataset.badge = b.newOrders; else ord.removeAttribute('data-badge'); }
        if (usr) { if (b.pending) usr.dataset.badge = b.pending; else usr.removeAttribute('data-badge'); }
        const navAdmin = document.querySelector('.nav-link[href="/admin"]');
        if (navAdmin) {
          const total = (b.newOrders || 0) + (b.pending || 0);
          if (total) navAdmin.dataset.badge = total; else navAdmin.removeAttribute('data-badge');
        }
      } catch {}
    },

    bumpCart() {
      const el = document.getElementById('navCartBadge');
      if (!el) return;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 350);
    },

    refreshCartBadge() {
      return this.paintCart();
    },

    mediaLoaderHtml(size = 'md') {
      const cls = size === 'sm'
        ? 'digitify-load-cube--sm'
        : size === 'lg'
          ? 'digitify-load-cube--lg'
          : 'digitify-load-cube--md';
      return `<span class="digitify-media-loader" aria-hidden="true"><span class="digitify-load-cube ${cls}"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>`;
    },

    wireMediaImage(img) {
      if (!img) return;
      let stage = img.closest('.digitify-media-stage');
      if (!stage) {
        stage = document.createElement('span');
        stage.className = 'digitify-media-stage is-media-loading';
        img.parentNode?.insertBefore(stage, img);
        stage.appendChild(img);
        stage.insertAdjacentHTML('beforeend', this.mediaLoaderHtml('md'));
      }
      if (!stage.querySelector('.digitify-media-loader')) {
        stage.insertAdjacentHTML('beforeend', this.mediaLoaderHtml('md'));
      }
      if (img.__digitifyMediaAbort) img.__digitifyMediaAbort.abort();
      const ac = new AbortController();
      img.__digitifyMediaAbort = ac;
      const { signal } = ac;
      const show = () => stage.classList.add('is-media-loading');
      const hide = () => stage.classList.remove('is-media-loading');
      const fail = () => {
        img.removeAttribute('src');
        img.hidden = true;
        show();
      };
      const sync = () => {
        const rawSrc = String(img.getAttribute('src') || '').trim();
        const isGenericFallback = /tshirt_mockup/i.test(rawSrc);
        if (!rawSrc || isGenericFallback) {
          if (isGenericFallback) {
            img.removeAttribute('src');
            img.hidden = true;
          }
          show();
          return;
        }
        img.hidden = false;
        if (img.complete && img.naturalWidth > 0) hide();
        else {
          show();
          img.addEventListener('load', hide, { once: true, signal });
          img.addEventListener('error', fail, { once: true, signal });
        }
      };
      img.dataset.mediaBound = '1';
      sync();
    },

    wireMediaImages(root) {
      const scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll('img[data-digitify-media]').forEach((img) => this.wireMediaImage(img));
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  NEB.initTheme();
  NEB.paintThemeSwitch();
  const existingCfg = window.NEB_CONFIG;
  if (existingCfg) {
    NEB.applyBranding(existingCfg);
    NEB.applyHeroVideo(existingCfg);
  } else {
    NEB.config()
      .then((cfg) => {
        window.NEB_CONFIG = cfg || {};
        NEB.applyBranding(cfg || {});
        NEB.applyHeroVideo(cfg || {});
      })
      .catch(() => {});
  }
  if (document.querySelector('.digitify-site-header')) {
    NEB.paintNav().catch(() => {});
  } else {
    document.addEventListener('digitify:shell-ready', () => {
      NEB.paintNav().catch(() => {});
    }, { once: true });
  }
  NEB.wireMediaImages(document);
});
