import * as THREE from 'https://esm.sh/three@0.170.0';
import { createAssetUrlResolver } from './asset-url.js';
import {
  createPreviewOrbit,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP
} from './preview-orbit.js';
import {
  coalesceModel3dManifest,
  fitPerspectiveCameraToHeroDisplay,
  fitPerspectiveCameraToModel,
  inferModelFormat,
  loadModelScene,
  modelQuality,
  prepareSceneTextures,
  wrapModelForDisplay
} from './model3d-runtime.js';
import {
  applyModel3dPresentation,
  configureRendererPresentation,
  disposePresentationState,
  refreshPresentationForModel,
  resolvePresentation,
  updateContactShadowPlane
} from './model3d-presentation.js';

const HERO_PIXEL_RATIO_CAP = 3;
const HERO_AUTO_ROTATE_SPEED_DEFAULT = 0.42;
const SELECTION_PREVIEW_ROTATE_SPEED = 0.28;
const MINI_PREVIEW_ROTATE_SPEED = 0.52;
const MINI_PREVIEW_WIDTH = 86;
const MINI_PREVIEW_HEIGHT = 94;
const HERO_DOCK_PREVIEW_WIDTH = 72;
const HERO_DOCK_PREVIEW_HEIGHT = 80;
const HERO_DOCK_ROTATE_SPEED = 0.48;

const state = {
  config: null,
  products: [],
  selectedProduct: null,
  selectedColorHex: '',
  selectedColorName: '',
  selectedSize: '',
  renderer: null,
  scene: null,
  camera: null,
  modelGroup: null,
  activeModel: null,
  frameId: 0,
  lastFrameTime: 0,
  heroView: { target: null, baseDistance: 5, zoom: 1 },
  heroPresentation: null,
  heroOrbit: null,
  heroDrag: {
    pausedAuto: false,
    baseRotationX: 0,
    baseRotationY: 0
  },
  selectionPreview: {
    renderer: null,
    scene: null,
    camera: null,
    modelGroup: null,
    manifest: null,
    loadToken: null,
    view: { target: null, baseDistance: 5, zoom: 1 },
    drag: {
      active: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      pausedAuto: false
    },
    orbit: null,
    presentation: null
  },
  miniPreviews: new Map(),
  heroDockPreviews: new Map(),
  miniVisible: new Set(),
  reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false,
  pageVisible: true,
  categoryFilter: 'all'
};

const touchLikeDevice = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches || false;
const prefersMobilePosterOnly = window.matchMedia?.('(max-width: 768px) and (hover: none)')?.matches || false;
let miniVisibilityObserver = null;

window.report3dError = (productId, stage, err) => {
  const message = String(err?.message || err || '').slice(0, 500);
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ productId: String(productId || ''), stage: String(stage || ''), message })
  }).catch(() => {});
};

const reduceMotionMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
reduceMotionMq?.addEventListener?.('change', (e) => {
  state.reduceMotion = !!e.matches;
  document.body.classList.toggle('storefront-reduce-motion', state.reduceMotion);
  updateReduceMotionNotice();
});
document.body?.classList.toggle('storefront-reduce-motion', state.reduceMotion);

function updateReduceMotionNotice() {
  const el = $('#storefrontMotionNotice');
  if (el) el.hidden = !state.reduceMotion;
}

document.addEventListener('visibilitychange', () => {
  state.pageVisible = document.visibilityState === 'visible';
});

const $ = (sel) => document.querySelector(sel);
const fmtEUR = (value) => NEB.fmtEUR(Number(value || 0));
let resolveAssetUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `/${value.replace(/^\/+/, '')}`;
};
const assetUrl = (raw) => resolveAssetUrl(raw);
const escapeHtml = (raw) => String(raw == null ? '' : raw)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const normalizeHex = (raw) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(raw || '').trim());
  return match ? `#${match[1].toLowerCase()}` : '';
};

function productPrice(product) {
  if (product?.basePrice != null) return Number(product.basePrice) || 0;
  const globalBase = Number(state.config?.pricing?.basePrice || 0);
  return globalBase * Math.max(0.1, Number(product?.priceMultiplier || 1));
}

function productSizes(product) {
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  return sizes.map((size) => ({
    code: String(typeof size === 'string' ? size : size?.code || '').trim().toUpperCase(),
    label: String(typeof size === 'string' ? size : size?.code || '').trim().toUpperCase()
  })).filter((size) => size.code);
}

function productColors(product) {
  const globalColors = Array.isArray(state.config?.colors) ? state.config.colors : [];
  const selected = Array.isArray(product?.colorHexes) && product.colorHexes.length
    ? product.colorHexes
    : globalColors.filter(c => c && c.enabled !== false).map(c => c.hex);
  return selected.map((hex) => {
    const clean = normalizeHex(hex);
    const match = globalColors.find((c) => normalizeHex(c.hex) === clean);
    return clean ? { hex: clean, name: match?.name || clean } : null;
  }).filter(Boolean);
}

function modelManifest(product) {
  return coalesceModel3dManifest(product?.model3d, {
    posterFallback: product?.mockupPath || 'assets/tshirt_mockup.png',
    defaultRotateSpeed: HERO_AUTO_ROTATE_SPEED_DEFAULT
  });
}

function heroRotateSpeed(manifest) {
  const raw = Number(manifest?.rotateSpeed);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(3, raw);
  return HERO_AUTO_ROTATE_SPEED_DEFAULT;
}

function hasProductModel3d(product) {
  const manifest = modelManifest(product);
  return manifest.enabled && !!manifest.modelPath;
}

function getDesignerMockupPath(product) {
  const designerPath = String(product?.designerMockupPath || '').trim().replace(/^\/+/, '');
  if (designerPath) return designerPath;
  return String(product?.mockupPath || '').trim().replace(/^\/+/, '');
}

function isDesignerCatalogProduct(product) {
  if (!product || product.enabled === false) return false;
  if (product.designerEnabled !== true) return false;
  return !!getDesignerMockupPath(product);
}

function productShowsDesignerLink(product) {
  return !!(product?.id && product.designerEnabled === true && getDesignerMockupPath(product));
}

function productPreviewPoster(product) {
  const manifest = modelManifest(product);
  return assetUrl(manifest.posterPath || product?.mockupPath || 'assets/tshirt_mockup.png');
}

function paintRendererClear(renderer) {
  if (!renderer) return;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.clear(true, true, true);
}

function configureHeroRendererSurface(renderer, scene) {
  if (!renderer) return;
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  if (renderer.domElement) renderer.domElement.style.background = 'transparent';
  if (scene) scene.background = null;
}

function setStageMediaMode(stage, mode) {
  if (!stage) return;
  stage.dataset.mediaMode = mode;
}

function setHeroMediaMode(mode) {
  const stage = document.querySelector('.storefront-hero-stage');
  setStageMediaMode(stage, mode);
  const hero = $('#productHero');
  if (hero) hero.dataset.heroMode = mode;
  syncHeroChrome(mode);
}

function syncHeroChrome(_mode) {
  /* Hero uses poster + crossfade; no spinner overlay. */
}

function scheduleSelectionPreview(product) {
  if (state.selectionPreviewTimer) window.clearTimeout(state.selectionPreviewTimer);
  state.selectionPreviewTimer = window.setTimeout(() => {
    state.selectionPreviewTimer = null;
    loadSelectionPreview(product);
  }, 60);
}

function syncHeroViewFromCamera() {
  const displayModel = state.modelGroup?.children?.[0];
  if (!displayModel || !state.camera) return;
  displayModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(displayModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  if (!state.heroView.target) state.heroView.target = new THREE.Vector3();
  state.heroView.target.copy(center);
  state.heroView.baseDistance = Math.max(0.08, state.camera.position.distanceTo(center));
}

function applyHeroViewZoom() {
  if (!state.heroView?.target || !state.camera) return;
  const offset = state.camera.position.clone().sub(state.heroView.target);
  if (offset.lengthSq() < 1e-8) offset.set(0, 0, 1);
  offset.normalize().multiplyScalar(state.heroView.baseDistance / state.heroView.zoom);
  state.camera.position.copy(state.heroView.target).add(offset);
  state.camera.lookAt(state.heroView.target);
  state.camera.updateProjectionMatrix();
}

function resetHeroOrbit() {
  if (!state.modelGroup) return;
  state.heroView.zoom = 1;
  state.modelGroup.rotation.x = state.heroDrag.baseRotationX;
  state.modelGroup.rotation.y = state.heroDrag.baseRotationY;
  state.heroDrag.pausedAuto = true;
  const displayModel = state.modelGroup.children?.[0];
  if (displayModel) {
    fitHeroCameraToModel(displayModel, state.activeModel?.manifest);
    state.renderer?.render(state.scene, state.camera);
  }
  window.setTimeout(() => { state.heroDrag.pausedAuto = false; }, 1600);
}

function modelDisplayScale(manifest) {
  const raw = Number(manifest?.scale);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(20, Math.max(0.01, raw));
}

/** Groot 3D-voorbeeld rechts: vaste schaal, niet admin “Grootte in shop”. */
function manifestForSelectionPreview(manifest) {
  return {
    ...manifest,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: 1
  };
}

/** Product card thumbs: fixed framing, independent of admin “Grootte in shop”. */
function manifestForMiniPreview(manifest) {
  const heroRotY = Number(manifest?.rotationY) || 0;
  const catalogYaw = Math.abs(heroRotY) > 50 ? 32 : Math.max(-40, Math.min(40, heroRotY * 0.25));
  return {
    ...manifest,
    rotationX: -10,
    rotationY: catalogYaw,
    rotationZ: 0,
    scale: 1
  };
}

function fitMiniCameraToModel(camera, displayModel) {
  fitPerspectiveCameraToModel(camera, displayModel, { margin: 1.18, yLift: 0.02 });
}

function fitHeroCameraToModel(displayModel, manifest) {
  fitPerspectiveCameraToHeroDisplay(state.camera, displayModel, {
    userScale: modelDisplayScale(manifest),
    margin: 1.2,
    yLift: 0.02
  });
  syncHeroViewFromCamera();
  applyHeroViewZoom();
}

function syncSelectionViewFromCamera() {
  const sp = state.selectionPreview;
  const displayModel = sp.modelGroup?.children?.[0];
  if (!displayModel || !sp.camera) return;
  displayModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(displayModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  if (!sp.view.target) sp.view.target = new THREE.Vector3();
  sp.view.target.copy(center);
  sp.view.baseDistance = Math.max(0.08, sp.camera.position.distanceTo(center));
}

function applySelectionViewZoom() {
  const sp = state.selectionPreview;
  if (!sp.view?.target || !sp.camera) return;
  const offset = sp.camera.position.clone().sub(sp.view.target);
  if (offset.lengthSq() < 1e-8) offset.set(0, 0, 1);
  offset.normalize().multiplyScalar(sp.view.baseDistance / sp.view.zoom);
  sp.camera.position.copy(sp.view.target).add(offset);
  sp.camera.lookAt(sp.view.target);
  sp.camera.updateProjectionMatrix();
}

function adjustSelectionPreviewZoom(factor) {
  const sp = state.selectionPreview;
  if (!sp.modelGroup?.children?.length || !sp.renderer) return;
  sp.view.zoom = THREE.MathUtils.clamp(sp.view.zoom * factor, PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX);
  applySelectionViewZoom();
  sp.renderer.render(sp.scene, sp.camera);
}

function resetSelectionPreviewView() {
  const sp = state.selectionPreview;
  sp.view.zoom = 1;
  sp.drag.pausedAuto = false;
  if (sp.modelGroup) sp.modelGroup.rotation.set(0, 0, 0);
  const displayModel = sp.modelGroup?.children?.[0];
  if (displayModel) {
    fitSelectionCameraToModel(displayModel);
    sp.renderer?.render(sp.scene, sp.camera);
  }
}

function fitSelectionCameraToModel(displayModel) {
  fitPerspectiveCameraToModel(state.selectionPreview.camera, displayModel, {
    margin: 1.04,
    yLift: 0.018
  });
  syncSelectionViewFromCamera();
  applySelectionViewZoom();
}

function setupSelectionPreviewInteraction() {
  const canvas = $('#selection3dCanvas');
  const stage = $('#storefrontSelectionStage');
  if (!canvas || canvas.dataset.selection3dBound) return;
  canvas.dataset.selection3dBound = '1';

  const sp = state.selectionPreview;
  sp.orbit?.dispose();
  sp.orbit = createPreviewOrbit({
    canvas,
    getModelGroup: () => sp.modelGroup,
    getCanInteract: () => stage?.dataset?.mediaMode === '3d' && !!sp.modelGroup?.children?.length,
    onRender: () => sp.renderer?.render(sp.scene, sp.camera),
    onDragStart: () => { sp.drag.pausedAuto = true; },
    onDragEnd: () => {
      window.setTimeout(() => { sp.drag.pausedAuto = false; }, 1600);
    },
    zoomButtons: {
      in: $('#selection3dZoomIn'),
      out: $('#selection3dZoomOut'),
      reset: $('#selection3dZoomReset')
    },
    viewState: sp.view,
    camera: sp.camera,
    THREE,
    resetView: resetSelectionPreviewView,
    fitCamera: null
  });
}

function setSelectionStageMediaMode(mode) {
  setStageMediaMode($('#storefrontSelectionStage'), mode);
}

function filteredProducts() {
  const filter = String(state.categoryFilter || 'all').toLowerCase();
  if (filter === '3d') return state.products.filter((p) => p.category === '3d' || hasProductModel3d(p));
  if (filter === 'standard') return state.products.filter((p) => p.category === 'standard' && !hasProductModel3d(p));
  return state.products;
}

function renderCategoryFilters() {
  const host = $('#storefrontCategoryFilters');
  if (!host) return;
  const current = String(state.categoryFilter || 'all').toLowerCase();
  const tabs = [
    { id: 'all', label: 'Alle producten' },
    { id: '3d', label: 'Met 3D preview' },
    { id: 'standard', label: 'Standaard' }
  ];
  host.innerHTML = tabs.map((tab) =>
    `<button type="button" class="shop-filter-tab${current === tab.id ? ' active' : ''}" data-category-filter="${tab.id}">${escapeHtml(tab.label)}</button>`
  ).join('');
}

function productFromUrlParam() {
  const raw = new URLSearchParams(window.location.search).get('product');
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return null;
  return state.products.find((p) => String(p.id || '').toLowerCase() === id) || null;
}

function productCardMedia(product) {
  const poster = productPreviewPoster(product);
  const hasMini3d = hasProductModel3d(product);
  const mini3d = hasMini3d
    ? `<canvas class="storefront-mini-canvas" data-mini-product="${escapeHtml(product.id)}" aria-hidden="true" aria-describedby="storefront-poster-${escapeHtml(product.id)}"></canvas>`
    : '';
  return `
    <span class="storefront-product-media${hasMini3d ? ' has-3d' : ''}" data-has-3d="${hasMini3d ? 'true' : 'false'}">
      ${mini3d}
      <img id="storefront-poster-${escapeHtml(product.id)}" class="storefront-product-thumb${hasMini3d ? ' storefront-mini-poster' : ''}" src="${escapeHtml(poster)}" alt="${escapeHtml(product.name || 'Product')}" loading="lazy" onerror="this.onerror=null;this.src='/assets/tshirt_mockup.png';">
    </span>`;
}

function selectProduct(product) {
  if (!product) return;
  state.selectedProduct = product;
  const colors = productColors(product);
  const sizes = productSizes(product);
  state.selectedColorHex = colors[0]?.hex || '';
  state.selectedColorName = colors[0]?.name || '';
  state.selectedSize = sizes[0]?.code || 'M';
  renderHero();
  renderOptions();
  loadHeroModel(product);
  scheduleSelectionPreview(product);
}

function renderHero() {
  const product = state.selectedProduct;
  if (!product) return;
  const config = state.config || {};
  const price = productPrice(product);
  const heroKicker = $('#heroProductKicker');
  const heroTitle = $('#heroProductTitle');
  const heroDescription = $('#heroProductDescription');
  const navBasePrice = $('#navBasePrice');
  const storefrontPrice = $('#storefrontPrice');
  if (heroKicker) {
    heroKicker.textContent = `${config.brand?.name || 'Digitify'} · ${product.category === '3d' || hasProductModel3d(product) ? '3D preview' : 'Product'}`;
  }
  if (heroTitle) heroTitle.textContent = product.name || 'Product';
  if (heroDescription) {
    heroDescription.textContent = product.description || 'Bekijk dit product in 3D en bestel zonder uploadstap.';
  }
  if (navBasePrice) navBasePrice.textContent = fmtEUR(price);
  if (storefrontPrice) storefrontPrice.textContent = fmtEUR(price);
  const note = String(config.conversion?.checkoutNote || '').trim()
    || (String(config.checkout?.approvalMode || 'MANUAL').toUpperCase() === 'DIRECT'
      ? 'Je kan na het plaatsen van de bestelling meteen veilig betalen.'
      : 'Na goedkeuring ontvang je je beveiligde betaallink per e-mail.');
  const checkoutNote = $('#storefrontCheckoutNote');
  if (checkoutNote) checkoutNote.textContent = note;
  const facts = [
    { type: 'price', text: `Vanaf ${fmtEUR(price)}` },
    {
      type: 'approval',
      text: String(config.checkout?.approvalMode || 'MANUAL').toUpperCase() === 'DIRECT'
        ? 'Direct betalen mogelijk'
        : 'Goedkeuring mogelijk'
    },
    {
      type: 'delivery',
      text: config.pricing?.deliveryText ? `Levering: ${config.pricing.deliveryText}` : 'Online bestellen'
    }
  ];
  const heroFacts = $('#heroProductFacts');
  if (heroFacts) {
    heroFacts.innerHTML = facts
      .map((fact) => `<span class="hero-fact" data-fact="${escapeHtml(fact.type)}">${escapeHtml(fact.text)}</span>`)
      .join('');
  }
  const poster = productPreviewPoster(product);
  const posterEl = $('#hero3dPoster');
  const heroHas3d = hasProductModel3d(product);
  if (posterEl) {
    posterEl.hidden = false;
    posterEl.src = poster;
    posterEl.alt = product.name || 'Product';
    if (heroHas3d) posterEl.setAttribute('fetchpriority', 'high');
  }
  const designLink = $('#heroDesignLink');
  if (designLink) {
    const showDesigner = productShowsDesignerLink(product);
    designLink.hidden = !showDesigner;
    designLink.classList.toggle('hidden', !showDesigner);
    if (showDesigner) {
      designLink.href = `/designer?product=${encodeURIComponent(product.id)}`;
    } else {
      designLink.removeAttribute('href');
    }
  }
  renderHero3dDock();
}

function renderOptions() {
  const selectedId = String(state.selectedProduct?.id || '');
  const visible = filteredProducts();
  $('#storefrontProducts').innerHTML = visible.map((product) => {
    const active = String(product.id || '') === selectedId;
    const badge = (product.category === '3d' || hasProductModel3d(product))
      ? '<span class="product-badge-3d">3D preview</span>'
      : '';
    return `
      <button class="storefront-product-card${active ? ' active' : ''}" type="button" data-product-id="${escapeHtml(product.id)}">
        ${productCardMedia(product)}
        <span>
          ${badge}
          <strong>${escapeHtml(product.name || 'Product')}</strong>
          <small>${escapeHtml(product.description || 'Product in catalogus')}</small>
        </span>
        <em>${escapeHtml(fmtEUR(productPrice(product)))}</em>
      </button>`;
  }).join('');

  const sizes = productSizes(state.selectedProduct);
  $('#storefrontSize').innerHTML = sizes.map((size) =>
    `<option value="${escapeHtml(size.code)}" ${size.code === state.selectedSize ? 'selected' : ''}>${escapeHtml(size.label)}</option>`
  ).join('');

  const colors = productColors(state.selectedProduct);
  $('#storefrontColors').innerHTML = colors.map((color) => `
    <button class="storefront-swatch${color.hex === state.selectedColorHex ? ' active' : ''}" type="button" data-color="${escapeHtml(color.hex)}" data-name="${escapeHtml(color.name)}" title="${escapeHtml(color.name)}">
      <span style="background:${escapeHtml(color.hex)}"></span>
    </button>
  `).join('');
  renderMiniPreviews();
}

function configureRendererQuality(renderer, manifest, context = 'hero') {
  const pres = resolvePresentation(manifest, context);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pres.pixelRatioCap));
  configureRendererPresentation(renderer, pres);
}

function setupThree() {
  const canvas = $('#hero3dCanvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
    stencil: false
  });
  const defaultManifest = { quality: 'high' };
  configureRendererQuality(renderer, defaultManifest, 'hero');
  const scene = new THREE.Scene();
  scene.background = null;
  configureHeroRendererSurface(renderer, scene);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.12, 4.6);
  const modelGroup = new THREE.Group();
  scene.add(modelGroup);
  state.heroPresentation = applyModel3dPresentation({
    renderer,
    scene,
    manifest: defaultManifest,
    context: 'hero'
  });
  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.modelGroup = modelGroup;
  resizeThree();
  const heroStage = document.querySelector('.storefront-hero-stage');
  const heroShowcase = $('#storefrontHeroShowcase');
  const onHeroLayoutChange = () => {
    resizeThree();
    resizeSelectionPreview();
    resizeAllMiniPreviews();
    resizeAllHeroDockPreviews();
  };
  window.addEventListener('resize', onHeroLayoutChange);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => onHeroLayoutChange());
    if (heroStage) ro.observe(heroStage);
    else if (heroShowcase) ro.observe(heroShowcase);
    const productsRoot = $('#storefrontProducts');
    if (productsRoot) ro.observe(productsRoot);
  }
  setupHeroPreviewInteraction();
  animateThree();
}

function setupHeroPreviewInteraction() {
  const canvas = $('#hero3dCanvas');
  if (!canvas || canvas.dataset.heroOrbitBound) return;
  canvas.dataset.heroOrbitBound = '1';

  state.heroOrbit?.dispose();
  state.heroOrbit = createPreviewOrbit({
    canvas,
    getModelGroup: () => state.modelGroup,
    getCanInteract: () => document.querySelector('.storefront-hero-stage')?.dataset?.mediaMode === '3d',
    enableZoom: false,
    onRender: () => state.renderer?.render(state.scene, state.camera),
    onDragStart: () => { state.heroDrag.pausedAuto = true; },
    onDragEnd: () => {
      window.setTimeout(() => { state.heroDrag.pausedAuto = false; }, 1800);
    },
    viewState: state.heroView,
    camera: state.camera,
    THREE,
    resetView: resetHeroOrbit
  });
}

function getHeroStageSize() {
  const stage = document.querySelector('.storefront-hero-stage');
  const showcase = $('#storefrontHeroShowcase');
  const el = stage || showcase;
  const rect = el?.getBoundingClientRect?.();
  return {
    width: Math.max(1, Math.round(rect?.width || el?.clientWidth || 480)),
    height: Math.max(1, Math.round(rect?.height || el?.clientHeight || 420))
  };
}

function resizeThree() {
  if (!state.renderer || !state.camera) return;
  const { width, height } = getHeroStageSize();
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  const displayModel = state.modelGroup?.children?.[0];
  if (displayModel) fitHeroCameraToModel(displayModel, state.activeModel?.manifest);
}

async function loadHeroModel(product) {
  if (!state.renderer) setupThree();
  const token = Symbol('model-load');
  state.loadingToken = token;
  const manifest = modelManifest(product);
  const has3d = hasProductModel3d(product) && manifest.enabled && !!manifest.modelPath;

  if (state.modelGroup) state.modelGroup.clear();
  state.activeModel = null;
  paintRendererClear(state.renderer);

  if (!has3d) {
    setHeroMediaMode('2d');
    return;
  }

  setHeroMediaMode('2d');
  try {
    configureRendererQuality(state.renderer, manifest, 'hero');
    configureHeroRendererSurface(state.renderer, state.scene);
    const object = await loadModelScene(manifest, assetUrl);
    if (state.loadingToken !== token) return;
    await prepareSceneTextures(state.renderer, object);
    state.modelGroup.clear();
    const maxAnisotropy = modelQuality(manifest) === 'high'
      ? (state.renderer?.capabilities?.getMaxAnisotropy?.() || 4)
      : Math.min(4, state.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const displayModel = wrapModelForDisplay(object, manifest, {
      edgeHighlight: inferModelFormat(manifest) === 'obj' && modelQuality(manifest) === 'high',
      maxAnisotropy
    });
    state.modelGroup.add(displayModel);
    state.heroDrag.baseRotationX = 0;
    state.heroDrag.baseRotationY = 0;
    state.modelGroup.rotation.set(0, 0, 0);
    state.activeModel = { productId: product.id, manifest };
    state.heroPresentation = refreshPresentationForModel(
      state.renderer,
      state.scene,
      state.heroPresentation,
      displayModel,
      manifest
    );
    setHeroMediaMode('3d');
    resizeThree();
    if (state.modelGroup?.children?.[0]) fitHeroCameraToModel(state.modelGroup.children[0], manifest);
    state.renderer.render(state.scene, state.camera);
  } catch (err) {
    console.warn('3D model laden mislukt:', err);
    report3dError(product?.id, 'hero', err);
    if (state.loadingToken !== token) return;
    setHeroMediaMode('2d');
  }
}

function disposeObject3d(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.filter(Boolean).forEach((material) => {
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((key) => {
        if (material[key]?.dispose) material[key].dispose();
      });
      material.dispose?.();
    });
  });
}

function clearSelectionPreviewModel() {
  const group = state.selectionPreview.modelGroup;
  if (!group) return;
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3d(child);
  }
}

function ensureSelectionPreviewRenderer() {
  const canvas = $('#selection3dCanvas');
  if (!canvas || state.selectionPreview.renderer) return;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  configureRendererQuality(renderer, { quality: 'high' }, 'hero');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.12, 5.4);
  const modelGroup = new THREE.Group();
  scene.add(modelGroup);
  state.selectionPreview.presentation = applyModel3dPresentation({
    renderer,
    scene,
    manifest: { quality: 'high' },
    context: 'hero'
  });
  state.selectionPreview.renderer = renderer;
  state.selectionPreview.scene = scene;
  state.selectionPreview.camera = camera;
  state.selectionPreview.modelGroup = modelGroup;
  if (!state.selectionPreview.view.target) {
    state.selectionPreview.view.target = new THREE.Vector3();
  }
  paintRendererClear(renderer);
  setupSelectionPreviewInteraction();
  const selectionStage = $('#storefrontSelectionStage');
  if (selectionStage && typeof ResizeObserver !== 'undefined' && !selectionStage.dataset.resizeObserved) {
    selectionStage.dataset.resizeObserved = '1';
    new ResizeObserver(() => resizeSelectionPreview()).observe(selectionStage);
  }
}

function resizeSelectionPreview() {
  const sp = state.selectionPreview;
  if (!sp.renderer || !sp.camera) return;
  const stage = $('#storefrontSelectionStage');
  const width = Math.max(220, stage?.clientWidth || 280);
  const height = Math.max(240, stage?.clientHeight || 300);
  sp.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  sp.renderer.setSize(width, height, false);
  sp.camera.aspect = width / height;
  sp.camera.updateProjectionMatrix();
  const displayModel = sp.modelGroup?.children?.[0];
  if (displayModel) fitSelectionCameraToModel(displayModel);
}

async function loadSelectionPreview(product) {
  const wrap = $('#storefrontSelectionPreview');
  const canvas = $('#selection3dCanvas');
  const poster = $('#selection3dPoster');
  const label = $('#selectionPreviewLabel');
  const eyebrow = $('#selectionPreviewEyebrow');
  if (!wrap || !canvas || !poster || !product) return;

  const stage = $('#storefrontSelectionStage');
  const manifest = modelManifest(product);
  const has3d = hasProductModel3d(product);
  const posterUrl = productPreviewPoster(product);

  poster.src = posterUrl;
  poster.alt = product.name || 'Product';
  label.textContent = product.name || 'Product';
  eyebrow.textContent = has3d ? '3D voorbeeld' : 'Productafbeelding';
  wrap.dataset.previewMode = has3d ? '3d' : '2d';

  const token = Symbol('selection-preview');
  state.selectionPreview.loadToken = token;
  clearSelectionPreviewModel();
  paintRendererClear(state.selectionPreview.renderer);
  state.selectionPreview.manifest = null;

  if (!has3d) {
    setSelectionStageMediaMode('2d');
    return;
  }

  setSelectionStageMediaMode('2d');
  try {
    const object = await loadModelScene(manifest, assetUrl);
    if (state.selectionPreview.loadToken !== token) return;
    ensureSelectionPreviewRenderer();
    await prepareSceneTextures(state.selectionPreview.renderer, object);
    configureRendererQuality(state.selectionPreview.renderer, manifest, 'hero');
    const maxAnisotropy = modelQuality(manifest) === 'high'
      ? (state.selectionPreview.renderer?.capabilities?.getMaxAnisotropy?.() || 4)
      : Math.min(4, state.selectionPreview.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const previewManifest = manifestForSelectionPreview(manifest);
    const displayModel = wrapModelForDisplay(object, previewManifest, {
      edgeHighlight: inferModelFormat(manifest) === 'obj',
      maxAnisotropy
    });
    state.selectionPreview.view.zoom = 1;
    state.selectionPreview.drag.pausedAuto = false;
    state.selectionPreview.modelGroup.rotation.set(0, 0, 0);
    state.selectionPreview.modelGroup.add(displayModel);
    state.selectionPreview.manifest = previewManifest;
    state.selectionPreview.presentation = refreshPresentationForModel(
      state.selectionPreview.renderer,
      state.selectionPreview.scene,
      state.selectionPreview.presentation,
      displayModel,
      manifest
    );
    setSelectionStageMediaMode('3d');
    resizeSelectionPreview();
    state.selectionPreview.renderer.render(
      state.selectionPreview.scene,
      state.selectionPreview.camera
    );
  } catch (err) {
    console.warn('Selectie-3D laden mislukt:', err);
    report3dError(product?.id, 'selection', err);
    if (state.selectionPreview.loadToken !== token) return;
    setSelectionStageMediaMode('2d');
    wrap.dataset.previewMode = '2d';
  }
}

function disposeMiniPreviewEntry(entry) {
  if (!entry) return;
  entry.active = false;
  if (entry.scene && entry.presentation) {
    disposePresentationState(entry.scene, entry.presentation);
    entry.presentation = null;
  }
  if (entry.displayModel && entry.modelGroup) {
    entry.modelGroup.remove(entry.displayModel);
    disposeObject3d(entry.displayModel);
    entry.displayModel = null;
  }
  entry.renderer?.dispose?.();
  entry.renderer = null;
  entry.scene = null;
  entry.camera = null;
  entry.modelGroup = null;
  entry.ready = false;
}

function disposeAllMiniPreviews() {
  state.miniPreviews.forEach((entry) => disposeMiniPreviewEntry(entry));
  state.miniPreviews.clear();
}

function resizeMiniPreviewEntry(entry) {
  if (!entry?.renderer || !entry.camera || !entry.canvas) return;
  const media = entry.canvas.closest('.storefront-product-media');
  const width = Math.max(72, Math.round(media?.clientWidth || MINI_PREVIEW_WIDTH));
  const height = Math.max(72, Math.round(media?.clientHeight || MINI_PREVIEW_HEIGHT));
  entry.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  entry.renderer.setSize(width, height, false);
  entry.camera.aspect = width / height;
  entry.camera.updateProjectionMatrix();
  if (entry.displayModel) fitMiniCameraToModel(entry.camera, entry.displayModel);
}

function resizeAllMiniPreviews() {
  state.miniPreviews.forEach((entry) => resizeMiniPreviewEntry(entry));
}

function updateMiniPreviewMediaClass(productId) {
  const id = String(productId || '');
  const canvas = document.querySelector(`.storefront-mini-canvas[data-mini-product="${CSS.escape(id)}"]`);
  const media = canvas?.closest('.storefront-product-media');
  const entry = state.miniPreviews.get(id);
  const live = !!(entry?.active && entry?.ready);
  if (media) media.classList.toggle('is-mini-3d-live', live);
  if (canvas) canvas.dataset.rendered = live ? 'true' : 'false';
}

async function ensureMiniPreview(product) {
  const productId = String(product.id || '');
  if (!productId || !hasProductModel3d(product)) return null;

  const existing = state.miniPreviews.get(productId);
  if (existing?.ready) return existing;
  if (existing?.loadingPromise) return existing.loadingPromise;

  const canvas = document.querySelector(`.storefront-mini-canvas[data-mini-product="${CSS.escape(productId)}"]`);
  if (!canvas) return null;

  const entry = existing || { productId, ready: false, active: false };
  entry.canvas = canvas;
  state.miniPreviews.set(productId, entry);

  entry.loadingPromise = (async () => {
    try {
      const manifest = modelManifest(product);
      const object = await loadModelScene(manifest, assetUrl);
      const media = canvas.closest('.storefront-product-media');
      const width = Math.max(72, Math.round(media?.clientWidth || MINI_PREVIEW_WIDTH));
      const height = Math.max(72, Math.round(media?.clientHeight || MINI_PREVIEW_HEIGHT));

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      configureRendererQuality(renderer, manifest, 'mini');
      paintRendererClear(renderer);
      renderer.setSize(width, height, false);
      await prepareSceneTextures(renderer, object);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      const modelGroup = new THREE.Group();
      scene.add(modelGroup);

      const miniManifest = manifestForMiniPreview(manifest);
      const displayModel = wrapModelForDisplay(object, miniManifest, {
        edgeHighlight: false,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
      });
      modelGroup.add(displayModel);

      const presentation = applyModel3dPresentation({
        renderer,
        scene,
        manifest,
        displayModel,
        context: 'mini'
      });

      Object.assign(entry, {
        renderer,
        scene,
        camera,
        modelGroup,
        displayModel,
        manifest,
        miniManifest,
        presentation,
        ready: true,
        loadingPromise: null
      });
      resizeMiniPreviewEntry(entry);
      entry.renderer.render(entry.scene, entry.camera);
      return entry;
    } catch (err) {
      console.warn('Mini 3D laden mislukt:', productId, err);
      report3dError(productId, 'mini', err);
      disposeMiniPreviewEntry(entry);
      state.miniPreviews.delete(productId);
      return null;
    }
  })();

  return entry.loadingPromise;
}

async function setMiniPreviewLive(productId, live) {
  const id = String(productId || '');
  if (prefersMobilePosterOnly) {
    const card = document.querySelector(`#storefrontProducts [data-product-id="${CSS.escape(id)}"]`);
    live = live && card?.classList?.contains('active');
  }
  const product = state.products.find((p) => String(p.id) === id);
  if (!product || !hasProductModel3d(product)) {
    const entry = state.miniPreviews.get(id);
    if (entry) entry.active = false;
    updateMiniPreviewMediaClass(id);
    return;
  }

  let entry = state.miniPreviews.get(id) || { productId: id, ready: false, active: false };
  entry.active = !!live;
  state.miniPreviews.set(id, entry);
  updateMiniPreviewMediaClass(id);

  if (!live) return;
  if (prefersMobilePosterOnly) return;

  const loaded = await ensureMiniPreview(product);
  if (!loaded?.ready) return;
  if (!state.miniPreviews.get(id)?.active) {
    updateMiniPreviewMediaClass(id);
    return;
  }
  resizeMiniPreviewEntry(loaded);
  updateMiniPreviewMediaClass(id);
}

function bindMiniPreviewInteractions() {
  const root = $('#storefrontProducts');
  if (!root || root.dataset.miniBound === '1') return;
  root.dataset.miniBound = '1';
  if (!touchLikeDevice) {
    root.addEventListener('mouseover', (event) => {
      const card = event.target.closest('[data-product-id]');
      if (!card || !root.contains(card)) return;
      if (card.contains(event.relatedTarget)) return;
      setMiniPreviewLive(card.dataset.productId, true);
    });
    root.addEventListener('mouseout', (event) => {
      const card = event.target.closest('[data-product-id]');
      if (!card || !root.contains(card)) return;
      if (card.contains(event.relatedTarget)) return;
      setMiniPreviewLive(card.dataset.productId, card.classList.contains('active'));
    });
  }
}

function ensureMiniVisibilityObserver() {
  const root = $('#storefrontProducts');
  if (!root || miniVisibilityObserver || typeof IntersectionObserver === 'undefined') return;
  miniVisibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target.closest?.('[data-product-id]');
      const id = card?.dataset?.productId;
      if (!id) return;
      if (entry.isIntersecting) state.miniVisible.add(id);
      else {
        state.miniVisible.delete(id);
        const miniEntry = state.miniPreviews.get(String(id));
        if (miniEntry && !card?.classList?.contains('active')) miniEntry.active = false;
      }
    });
  }, { root, threshold: 0.12 });
}

function observeMiniProductCards() {
  ensureMiniVisibilityObserver();
  if (!miniVisibilityObserver) return;
  miniVisibilityObserver.disconnect();
  state.miniVisible.clear();
  document.querySelectorAll('#storefrontProducts [data-product-id]').forEach((card) => {
    miniVisibilityObserver.observe(card);
  });
}

function renderMiniPreviews() {
  disposeAllMiniPreviews();
  bindMiniPreviewInteractions();
  document.querySelectorAll('.storefront-product-media.has-3d').forEach((media) => {
    media.classList.remove('is-mini-3d-live');
  });
  observeMiniProductCards();
  const activeId = state.selectedProduct?.id;
  if (activeId) setMiniPreviewLive(activeId, true);
}

function productsWith3d() {
  return state.products.filter((product) => hasProductModel3d(product));
}

function disposeHeroDockEntry(entry) {
  if (!entry) return;
  if (entry.displayModel) {
    disposeObject3d(entry.displayModel);
    entry.displayModel = null;
  }
  entry.renderer?.dispose?.();
  entry.renderer = null;
  entry.scene = null;
  entry.camera = null;
  entry.modelGroup = null;
  entry.ready = false;
}

function disposeAllHeroDockPreviews() {
  state.heroDockPreviews.forEach((entry) => disposeHeroDockEntry(entry));
  state.heroDockPreviews.clear();
}

function resizeHeroDockEntry(entry) {
  if (!entry?.renderer || !entry.camera || !entry.canvas) return;
  const stage = entry.canvas.closest('.storefront-hero-3d-dock-stage');
  const width = Math.max(56, Math.round(stage?.clientWidth || HERO_DOCK_PREVIEW_WIDTH));
  const height = Math.max(56, Math.round(stage?.clientHeight || HERO_DOCK_PREVIEW_HEIGHT));
  entry.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  entry.renderer.setSize(width, height, false);
  entry.camera.aspect = width / height;
  entry.camera.updateProjectionMatrix();
  if (entry.displayModel) fitMiniCameraToModel(entry.camera, entry.displayModel);
}

function resizeAllHeroDockPreviews() {
  state.heroDockPreviews.forEach((entry) => resizeHeroDockEntry(entry));
}

function updateHeroDockMediaClass(productId) {
  const id = String(productId || '');
  const canvas = document.querySelector(`.storefront-hero-dock-canvas[data-dock-product="${CSS.escape(id)}"]`);
  const stage = canvas?.closest('.storefront-hero-3d-dock-stage');
  const entry = state.heroDockPreviews.get(id);
  const live = !!(entry?.active && entry?.ready);
  if (stage) stage.classList.toggle('is-dock-3d-live', live);
}

async function ensureHeroDockPreview(product) {
  const productId = String(product.id || '');
  if (!productId || !hasProductModel3d(product)) return null;

  const existing = state.heroDockPreviews.get(productId);
  if (existing?.ready) return existing;
  if (existing?.loadingPromise) return existing.loadingPromise;

  const canvas = document.querySelector(`.storefront-hero-dock-canvas[data-dock-product="${CSS.escape(productId)}"]`);
  if (!canvas) return null;

  const entry = existing || { productId, ready: false, active: false };
  entry.canvas = canvas;
  state.heroDockPreviews.set(productId, entry);

  entry.loadingPromise = (async () => {
    try {
      const manifest = modelManifest(product);
      const object = await loadModelScene(manifest, assetUrl);
      const stage = canvas.closest('.storefront-hero-3d-dock-stage');
      const width = Math.max(56, Math.round(stage?.clientWidth || HERO_DOCK_PREVIEW_WIDTH));
      const height = Math.max(56, Math.round(stage?.clientHeight || HERO_DOCK_PREVIEW_HEIGHT));

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      configureRendererQuality(renderer, manifest, 'mini');
      paintRendererClear(renderer);
      renderer.setSize(width, height, false);
      await prepareSceneTextures(renderer, object);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      const modelGroup = new THREE.Group();
      scene.add(modelGroup);

      const miniManifest = manifestForMiniPreview(manifest);
      const displayModel = wrapModelForDisplay(object, miniManifest, {
        edgeHighlight: false,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
      });
      modelGroup.add(displayModel);

      const presentation = applyModel3dPresentation({
        renderer,
        scene,
        manifest,
        displayModel,
        context: 'mini'
      });

      Object.assign(entry, {
        renderer,
        scene,
        camera,
        modelGroup,
        displayModel,
        manifest,
        miniManifest,
        presentation,
        ready: true,
        loadingPromise: null
      });
      resizeHeroDockEntry(entry);
      entry.renderer.render(entry.scene, entry.camera);
      return entry;
    } catch (err) {
      console.warn('Hero dock 3D laden mislukt:', productId, err);
      report3dError(productId, 'hero-dock', err);
      disposeHeroDockEntry(entry);
      state.heroDockPreviews.delete(productId);
      return null;
    }
  })();

  return entry.loadingPromise;
}

async function setHeroDockPreviewLive(productId, live) {
  const id = String(productId || '');
  const product = state.products.find((p) => String(p.id) === id);
  if (!product || !hasProductModel3d(product)) {
    const entry = state.heroDockPreviews.get(id);
    if (entry) entry.active = false;
    updateHeroDockMediaClass(id);
    return;
  }

  let entry = state.heroDockPreviews.get(id) || { productId: id, ready: false, active: false };
  entry.active = !!live;
  state.heroDockPreviews.set(id, entry);
  updateHeroDockMediaClass(id);

  if (!live || prefersMobilePosterOnly) return;

  const loaded = await ensureHeroDockPreview(product);
  if (!loaded?.ready) return;
  if (!state.heroDockPreviews.get(id)?.active) {
    updateHeroDockMediaClass(id);
    return;
  }
  resizeHeroDockEntry(loaded);
  updateHeroDockMediaClass(id);
}

function bindHero3dDock() {
  const dock = $('#hero3dDock');
  if (!dock || dock.dataset.bound === '1') return;
  dock.dataset.bound = '1';
  dock.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-dock-product]');
    if (!btn) return;
    const product = state.products.find((p) => String(p.id) === String(btn.dataset.dockProduct));
    if (product) selectProduct(product);
  });
}

function renderHero3dDock() {
  const dock = $('#hero3dDock');
  const track = $('#hero3dDockTrack');
  if (!dock || !track) return;

  bindHero3dDock();
  const items = productsWith3d();
  dock.hidden = items.length === 0;

  const keepIds = new Set(items.map((product) => String(product.id)));
  state.heroDockPreviews.forEach((entry, id) => {
    if (!keepIds.has(id)) {
      disposeHeroDockEntry(entry);
      state.heroDockPreviews.delete(id);
    }
  });

  const selectedId = String(state.selectedProduct?.id || '');
  const itemIds = items.map((product) => String(product.id)).join('|');
  if (track.dataset.itemIds === itemIds) {
    track.querySelectorAll('[data-dock-product]').forEach((btn) => {
      const active = String(btn.dataset.dockProduct) === selectedId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    return;
  }

  track.dataset.itemIds = itemIds;
  track.innerHTML = items.map((product) => {
    const id = escapeHtml(product.id);
    const active = String(product.id) === selectedId;
    const poster = escapeHtml(productPreviewPoster(product));
    const label = escapeHtml(product.name || 'Product');
    return `
      <button type="button" class="storefront-hero-3d-dock-item${active ? ' is-active' : ''}" data-dock-product="${id}" aria-label="${label}" aria-pressed="${active ? 'true' : 'false'}" title="${label}">
        <span class="storefront-hero-3d-dock-stage">
          <canvas class="storefront-hero-dock-canvas" data-dock-product="${id}" aria-hidden="true"></canvas>
          <img class="storefront-hero-dock-poster" src="${poster}" alt="" loading="lazy">
        </span>
      </button>`;
  }).join('');

  items.forEach((product) => setHeroDockPreviewLive(product.id, true));
}

function animateThree(timestamp = performance.now()) {
  state.frameId = requestAnimationFrame(animateThree);
  const delta = Math.min(0.05, Math.max(0.001, (timestamp - (state.lastFrameTime || timestamp)) / 1000));
  state.lastFrameTime = timestamp;

  if (!state.pageVisible) return;

  const heroMode = document.querySelector('.storefront-hero-stage')?.dataset?.mediaMode;
  if (heroMode === '3d' && state.renderer && state.scene && state.camera && state.modelGroup?.children?.length) {
    const manifest = state.activeModel?.manifest || {};
    const autoAllowed = !state.reduceMotion
      && manifest.autoRotate === true
      && !state.heroDrag.active
      && !state.heroDrag.pausedAuto;
    if (autoAllowed) {
      state.modelGroup.rotation.y += heroRotateSpeed(manifest) * delta;
    }
    const heroModel = state.modelGroup.children[0];
    if (state.heroPresentation?.shadow && heroModel) {
      updateContactShadowPlane(state.heroPresentation.shadow, heroModel);
    }
    state.renderer.render(state.scene, state.camera);
  }

  const sp = state.selectionPreview;
  const selectionMode = $('#storefrontSelectionStage')?.dataset?.mediaMode;
  if (selectionMode === '3d' && sp.renderer && sp.scene && sp.camera && sp.modelGroup?.children?.length) {
    const allowAutoRotate = !sp.drag.active && !sp.drag.pausedAuto;
    if (allowAutoRotate && !state.reduceMotion) {
      sp.modelGroup.rotation.y += SELECTION_PREVIEW_ROTATE_SPEED * delta;
    }
    const selModel = sp.modelGroup.children[0];
    if (sp.presentation?.shadow && selModel) {
      updateContactShadowPlane(sp.presentation.shadow, selModel);
    }
    paintRendererClear(sp.renderer);
    sp.renderer.render(sp.scene, sp.camera);
  }

  state.miniPreviews.forEach((entry) => {
    if (!entry.active || !entry.ready || !entry.renderer || !entry.modelGroup) return;
    if (!state.miniVisible.has(entry.productId)) return;
    if (!state.reduceMotion) {
      entry.modelGroup.rotation.y += MINI_PREVIEW_ROTATE_SPEED * delta;
    }
    paintRendererClear(entry.renderer);
    entry.renderer.render(entry.scene, entry.camera);
  });

  state.heroDockPreviews.forEach((entry) => {
    if (!entry.active || !entry.ready || !entry.renderer || !entry.modelGroup) return;
    if (!state.reduceMotion) {
      entry.modelGroup.rotation.y += HERO_DOCK_ROTATE_SPEED * delta;
    }
    paintRendererClear(entry.renderer);
    entry.renderer.render(entry.scene, entry.camera);
  });
}

function clearStorefrontFieldErrors() {
  $('#storefrontSize')?.removeAttribute('aria-invalid');
  $('#storefrontColors')?.removeAttribute('aria-invalid');
  document.querySelector('.storefront-field-error')?.remove();
}

function showStorefrontFieldError(message) {
  clearStorefrontFieldErrors();
  const panel = document.querySelector('.storefront-order-panel');
  if (!panel) return;
  const el = document.createElement('p');
  el.className = 'storefront-field-error';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  panel.querySelector('.storefront-order-fields')?.after(el);
}

function validateStorefrontSelection() {
  const product = state.selectedProduct;
  if (!product) return false;
  const sizes = productSizes(product);
  const colors = productColors(product);
  if (sizes.length && !state.selectedSize) {
    $('#storefrontSize')?.setAttribute('aria-invalid', 'true');
    showStorefrontFieldError('Kies een maat om verder te gaan.');
    return false;
  }
  if (colors.length && !state.selectedColorHex) {
    $('#storefrontColors')?.setAttribute('aria-invalid', 'true');
    showStorefrontFieldError('Kies een kleur om verder te gaan.');
    return false;
  }
  clearStorefrontFieldErrors();
  return true;
}

async function addSelectedToCart() {
  const product = state.selectedProduct;
  if (!product) return;
  if (!validateStorefrontSelection()) return;

  const user = await NEB.me().catch(() => null);
  if (!user) {
    NEB.toast('Log in om producten toe te voegen aan je winkelmand.', 'error');
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    setTimeout(() => { window.location.href = `/login?next=${next}`; }, 700);
    return;
  }

  const qty = Math.max(1, Math.min(99, Number($('#storefrontQty')?.value || 1) || 1));
  const button = document.activeElement?.matches?.('button') ? document.activeElement : $('#storefrontAddToCart');
  const oldText = button?.textContent || '';
  try {
    if (button) { button.disabled = true; button.textContent = 'Toevoegen...'; }
    await NEB.post('/api/cart/product', {
      productId: product.id,
      size: state.selectedSize,
      colorHex: state.selectedColorHex,
      colorName: state.selectedColorName,
      qty
    });
    const afterAdd = String(state.config?.conversion?.storefrontAfterAdd || 'cart').toLowerCase();
    if (afterAdd === 'stay') {
      if (typeof NEB.paintCart === 'function') await NEB.paintCart();
      else if (typeof NEB.refreshCartBadge === 'function') await NEB.refreshCartBadge();
      NEB.bumpCart?.();
      NEB.toast('Product toegevoegd. Ga verder winkelen of open je winkelmand.', 'success');
    } else {
      NEB.toast('Product toegevoegd aan winkelmand', 'success');
      window.location.href = '/cart';
    }
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/login';
      return;
    }
    NEB.toast(err.message || 'Toevoegen mislukt', 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = oldText; }
  }
}

async function init() {
  const config = (window.NEB_CONFIG && Array.isArray(window.NEB_CONFIG.products))
    ? window.NEB_CONFIG
    : await NEB.config();
  state.config = config;
  window.NEB_CONFIG = config;
  if (window.NEB?.applyBranding) NEB.applyBranding(config);
  resolveAssetUrl = createAssetUrlResolver(config);
  state.products = (window.NEB?.sortCatalogProducts
    ? NEB.sortCatalogProducts(Array.isArray(config.products) ? config.products : [])
    : (Array.isArray(config.products) ? config.products : [])
  ).filter((p) => p && p.enabled !== false);
  renderCategoryFilters();
  const fromUrl = productFromUrlParam();
  const featured = fromUrl
    || state.products.find((p) => p.isFeatured)
    || state.products.find((p) => p.isDefault)
    || state.products[0];
  if (!featured) return;
  selectProduct(featured);
  updateReduceMotionNotice();

  $('#storefrontCategoryFilters')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-category-filter]');
    if (!tab) return;
    state.categoryFilter = String(tab.dataset.categoryFilter || 'all');
    renderCategoryFilters();
    renderOptions();
  });

  $('#storefrontProducts')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    const product = state.products.find((p) => String(p.id) === String(card.dataset.productId));
    selectProduct(product);
    if (touchLikeDevice && product?.id) setMiniPreviewLive(product.id, true);
  });
  $('#storefrontSize')?.addEventListener('change', (event) => {
    state.selectedSize = String(event.target.value || '').toUpperCase();
  });
  $('#storefrontColors')?.addEventListener('click', (event) => {
    const swatch = event.target.closest('[data-color]');
    if (!swatch) return;
    state.selectedColorHex = normalizeHex(swatch.dataset.color);
    state.selectedColorName = String(swatch.dataset.name || '').trim();
    renderOptions();
  });
  $('#storefrontAddToCart')?.addEventListener('click', addSelectedToCart);
  $('#heroAddToCart')?.addEventListener('click', addSelectedToCart);

  document.documentElement.classList.add('digitify-storefront-ready');
  document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
}

init().catch((err) => {
  console.error(err);
  NEB.toast('Producten laden mislukt', 'error');
  document.documentElement.classList.add('digitify-storefront-ready');
  document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
});
