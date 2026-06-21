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
  estimateModelScreenFill,
  estimateModelScreenExtents,
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
// Extra WebGL contexts (mini cards + dock) exhaust GPU memory and crash mobile browsers.
const ENABLE_MINI_3D_PREVIEWS = false;
const ENABLE_DOCK_3D_PREVIEWS = false;

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
  selectionPreview3dEnabled: false,
  selectionPreview3dLoading: false,
  cartAddInFlight: false
};

const touchLikeDevice = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches || false;
const prefersMobilePosterOnly = window.matchMedia?.('(max-width: 768px) and (hover: none)')?.matches || false;
const STOREFRONT_CONFIG_CACHE_KEY = 'neb_public_config_v1';
const STOREFRONT_CONFIG_FRESH_MS = 30 * 60 * 1000;
const STOREFRONT_CONFIG_STALE_MS = 24 * 60 * 60 * 1000;
let miniVisibilityObserver = null;

function readStorefrontConfigCache(allowStale = false) {
  try {
    const raw = sessionStorage.getItem(STOREFRONT_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !Array.isArray(parsed.data.products) || !parsed.data.products.length) return null;
    const age = Date.now() - Number(parsed.ts || 0);
    if (age <= STOREFRONT_CONFIG_FRESH_MS) return parsed.data;
    if (allowStale && age <= STOREFRONT_CONFIG_STALE_MS) return parsed.data;
  } catch (_) {}
  return null;
}

function writeStorefrontConfigCache(cfg) {
  if (!cfg || !Array.isArray(cfg.products) || !cfg.products.length) return;
  try {
    sessionStorage.setItem(STOREFRONT_CONFIG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: cfg }));
  } catch (_) {}
}

function showStorefrontCatalogError(message, canRetry = true) {
  const host = $('#storefrontProducts');
  if (!host) return;
  host.innerHTML = `
    <div class="storefront-catalog-error" role="alert">
      <p>${escapeHtml(message)}</p>
      ${canRetry ? '<button type="button" class="btn-primary storefront-catalog-retry" id="storefrontRetryLoad">Opnieuw proberen</button>' : ''}
    </div>`;
  $('#storefrontRetryLoad')?.addEventListener('click', () => window.location.reload());
}

async function resolveStorefrontConfig() {
  if (window.NEB_CONFIG && Array.isArray(window.NEB_CONFIG.products) && window.NEB_CONFIG.products.length) {
    writeStorefrontConfigCache(window.NEB_CONFIG);
    return window.NEB_CONFIG;
  }
  const cached = readStorefrontConfigCache(false);
  if (cached) return cached;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cfg = await NEB.config();
      if (cfg && Array.isArray(cfg.products) && cfg.products.length) {
        writeStorefrontConfigCache(cfg);
        return cfg;
      }
      lastErr = new Error('Lege catalogus');
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
  }

  const stale = readStorefrontConfigCache(true);
  if (stale) {
    NEB.toast?.('Offline catalogus geladen. Ververs de pagina zodra je verbinding stabiel is.', 'error');
    return stale;
  }
  throw lastErr || new Error('Catalogus laden mislukt');
}

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
  if (state.pageVisible) {
    if (!state.frameId) animateThree();
  } else if (state.frameId) {
    cancelAnimationFrame(state.frameId);
    state.frameId = 0;
  }
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
  const mockup = String(product?.mockupPath || '').trim().replace(/^\/+/, '');
  const manifest = modelManifest(product);
  const useStoreMockup = mockup && mockup !== 'assets/tshirt_mockup.png';
  const path = String(useStoreMockup ? mockup : (manifest.posterPath || mockup || '')).trim();
  return path ? assetUrl(path) : '';
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

function syncHeroChrome(mode) {
  const chrome = $('#heroShowcaseChrome');
  const label = $('#heroShowcaseLabel');
  if (!chrome) return;
  const is3dProduct = hasProductModel3d(state.selectedProduct);
  if (!is3dProduct || mode === '2d') {
    chrome.hidden = true;
    return;
  }
  chrome.hidden = false;
  if (mode === 'loading') {
    chrome.hidden = false;
    chrome.dataset.state = 'loading';
    if (label) {
      label.hidden = false;
      label.textContent = '3D laden…';
    }
    return;
  }
  if (mode === '3d') {
    chrome.hidden = true;
  }
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
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  if (isCompactHeroViewport()) {
    center.y -= Math.max(size.y, size.z) * 0.08;
  }
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

function isCompactHeroViewport() {
  return window.innerWidth <= 900;
}

function isTabletHeroViewport() {
  return window.innerWidth > 900 && window.innerWidth <= 1099;
}

function resolveHeroFitBase(manifest) {
  const userScale = modelDisplayScale(manifest);
  let margin = 1.22;
  if (isCompactHeroViewport()) margin = 0.98;
  else if (isTabletHeroViewport()) margin = 1.1;
  return { userScale, margin, yLift: isCompactHeroViewport() ? 0.01 : 0.02 };
}

function resolveHeroFitLimits() {
  if (isCompactHeroViewport()) {
    return { minAxis: 0.54, maxAxis: 0.82, maxBoost: 1.45 };
  }
  if (isTabletHeroViewport()) {
    return { minAxis: 0.48, maxAxis: 0.74, maxBoost: 1.32 };
  }
  return { minAxis: 0.46, maxAxis: 0.7, maxBoost: 1.15 };
}

function fitHeroCameraToModel(displayModel, manifest) {
  const base = resolveHeroFitBase(manifest);
  fitPerspectiveCameraToHeroDisplay(state.camera, displayModel, base);

  const limits = resolveHeroFitLimits();
  let boost = 1;
  let extents = estimateModelScreenExtents(state.camera, displayModel);
  while (extents.maxAxis < limits.minAxis && boost < limits.maxBoost) {
    boost *= 1.05;
    fitPerspectiveCameraToHeroDisplay(state.camera, displayModel, {
      ...base,
      userScale: base.userScale * boost
    });
    extents = estimateModelScreenExtents(state.camera, displayModel);
    if (extents.maxAxis > limits.maxAxis) {
      boost /= 1.05;
      fitPerspectiveCameraToHeroDisplay(state.camera, displayModel, {
        ...base,
        userScale: base.userScale * boost
      });
      break;
    }
  }

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
    margin: 1.1,
    yLift: 0.018
  });
  syncSelectionViewFromCamera();
  applySelectionViewZoom();
}

function revealSelectionPreview3d() {
  return new Promise((resolve) => {
    resizeSelectionPreview();
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
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

function setSelection3dLoader(visible) {
  const el = $('#selection3dLoader');
  if (el) el.hidden = !visible;
  state.selectionPreview3dLoading = !!visible;
  $('#storefrontSelectionStage')?.classList.toggle('is-selection-3d-loading', !!visible);
  syncSelection3dToggleUi();
}

function syncSelection3dToggleUi() {
  const btn = $('#selection3dToggle');
  const label = $('#selection3dToggleLabel');
  const stage = $('#storefrontSelectionStage');
  const wrap = $('#storefrontSelectionPreview');
  const product = state.selectedProduct;
  const has3d = hasProductModel3d(product);
  if (btn) {
    btn.hidden = !has3d;
    btn.disabled = state.selectionPreview3dLoading;
    btn.setAttribute('aria-pressed', state.selectionPreview3dEnabled ? 'true' : 'false');
  }
  if (label) {
    if (state.selectionPreview3dLoading) label.textContent = '3D laden…';
    else if (state.selectionPreview3dEnabled) label.textContent = 'Terug naar foto';
    else label.textContent = '3D bekijken';
  }
  stage?.classList.toggle('is-selection-3d-active', !!state.selectionPreview3dEnabled);
  if (wrap && has3d) {
    wrap.dataset.previewMode = state.selectionPreview3dEnabled ? '3d' : '2d';
  }
}

function disableSelectionPreview3d() {
  state.selectionPreview3dEnabled = false;
  setSelectionStageMediaMode('2d');
  const eyebrow = $('#selectionPreviewEyebrow');
  if (eyebrow) eyebrow.textContent = 'Productafbeelding';
  setSelection3dLoader(false);
  syncSelection3dToggleUi();
}

async function enableSelectionPreview3d(product) {
  if (!product || !hasProductModel3d(product)) return;
  const wrap = $('#storefrontSelectionPreview');
  const eyebrow = $('#selectionPreviewEyebrow');
  const sp = state.selectionPreview;
  const manifest = modelManifest(product);
  const cached = sp.manifest
    && String(sp.manifest.modelPath || '') === String(manifest.modelPath || '')
    && sp.modelGroup?.children?.length;

  state.selectionPreview3dEnabled = true;
  if (cached) {
    setSelectionStageMediaMode('loading');
    await revealSelectionPreview3d();
    setSelectionStageMediaMode('3d');
    if (wrap) wrap.dataset.previewMode = '3d';
    if (eyebrow) eyebrow.textContent = '3D voorbeeld';
    sp.renderer?.render(sp.scene, sp.camera);
    syncSelection3dToggleUi();
    ensureAnimateLoop();
    return;
  }

  setSelection3dLoader(true);
  setSelectionStageMediaMode('loading');
  const token = Symbol('selection-preview');
  sp.loadToken = token;
  clearSelectionPreviewModel();
  paintRendererClear(sp.renderer);
  sp.manifest = null;

  try {
    const object = await loadModelScene(manifest, assetUrl);
    if (sp.loadToken !== token) return;
    ensureSelectionPreviewRenderer();
    await prepareSceneTextures(sp.renderer, object);
    configureRendererQuality(sp.renderer, manifest, 'hero');
    const maxAnisotropy = modelQuality(manifest) === 'high'
      ? (sp.renderer?.capabilities?.getMaxAnisotropy?.() || 4)
      : Math.min(4, sp.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    const previewManifest = manifestForSelectionPreview(manifest);
    const displayModel = wrapModelForDisplay(object, previewManifest, {
      edgeHighlight: inferModelFormat(manifest) === 'obj',
      maxAnisotropy
    });
    sp.view.zoom = 1;
    sp.drag.pausedAuto = false;
    sp.modelGroup.rotation.set(0, 0, 0);
    sp.modelGroup.add(displayModel);
    sp.manifest = previewManifest;
    sp.presentation = refreshPresentationForModel(
      sp.renderer,
      sp.scene,
      sp.presentation,
      displayModel,
      manifest
    );
    await revealSelectionPreview3d();
    sp.renderer.render(sp.scene, sp.camera);
    setSelectionStageMediaMode('3d');
    if (wrap) wrap.dataset.previewMode = '3d';
    if (eyebrow) eyebrow.textContent = '3D voorbeeld';
    ensureAnimateLoop();
  } catch (err) {
    console.warn('Selectie-3D laden mislukt:', err);
    report3dError(product?.id, 'selection', err);
    if (sp.loadToken !== token) return;
    state.selectionPreview3dEnabled = false;
    setSelectionStageMediaMode('2d');
    if (wrap) wrap.dataset.previewMode = '2d';
    if (eyebrow) eyebrow.textContent = 'Productafbeelding';
    NEB.toast?.('3D preview kon niet geladen worden', 'error');
  } finally {
    setSelection3dLoader(false);
    syncSelection3dToggleUi();
  }
}

async function toggleSelectionPreview3d() {
  if (state.selectionPreview3dLoading) return;
  if (state.selectionPreview3dEnabled) {
    disableSelectionPreview3d();
    return;
  }
  await enableSelectionPreview3d(state.selectedProduct);
}

function prepareSelectionPreview(product) {
  const wrap = $('#storefrontSelectionPreview');
  const poster = $('#selection3dPoster');
  const label = $('#selectionPreviewLabel');
  const eyebrow = $('#selectionPreviewEyebrow');
  if (!wrap || !poster || !product) return;

  state.selectionPreview3dEnabled = false;
  state.selectionPreview3dLoading = false;
  const token = Symbol('selection-preview');
  state.selectionPreview.loadToken = token;
  clearSelectionPreviewModel();
  paintRendererClear(state.selectionPreview.renderer);
  state.selectionPreview.manifest = null;

  const has3d = hasProductModel3d(product);
  const posterUrl = productPreviewPoster(product);
  poster.alt = product.name || 'Product';
  poster.hidden = !posterUrl;
  const posterLayer = poster.closest('.storefront-media-layer--2d');
  posterLayer?.classList.add('digitify-media-stage');
  posterLayer?.classList.remove('is-media-loading');
  if (posterUrl) {
    poster.src = posterUrl;
    NEB.wireMediaImage(poster);
  } else {
    poster.removeAttribute('src');
    posterLayer?.classList.add('is-media-loading');
  }
  if (label) label.textContent = product.name || 'Product';
  if (eyebrow) eyebrow.textContent = has3d ? 'Productafbeelding' : 'Productafbeelding';
  wrap.dataset.previewMode = '2d';
  setSelectionStageMediaMode('2d');
  setSelection3dLoader(false);
  syncSelection3dToggleUi();
}

async function loadSelectionPreview(product) {
  prepareSelectionPreview(product);
}

function filteredProducts() {
  return state.products;
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
    <span class="storefront-product-media digitify-media-stage is-media-loading${hasMini3d ? ' has-3d' : ''}" data-has-3d="${hasMini3d ? 'true' : 'false'}">
      ${mini3d}
      <img id="storefront-poster-${escapeHtml(product.id)}" class="storefront-product-thumb${hasMini3d ? ' storefront-mini-poster' : ''}" src="${escapeHtml(poster)}" alt="${escapeHtml(product.name || 'Product')}" loading="lazy" decoding="async" data-digitify-media>
      ${NEB.mediaLoaderHtml('sm')}
    </span>`;
}

function selectProduct(product) {
  if (!product) return;
  try {
    state.selectedProduct = product;
    const colors = productColors(product);
    const sizes = productSizes(product);
    state.selectedColorHex = colors[0]?.hex || '';
    state.selectedColorName = colors[0]?.name || '';
    state.selectedSize = sizes[0]?.code || 'M';
    renderHero();
    renderOptions();
    loadHeroModel(product).catch((err) => {
      console.warn('Hero model laden mislukt:', err);
      report3dError(product?.id, 'hero', err);
    });
    scheduleSelectionPreview(product);
  } catch (err) {
    console.error('Product selectie mislukt:', err);
    NEB.toast?.('Product kon niet geladen worden', 'error');
  }
}

function renderHero() {
  const product = state.selectedProduct;
  if (!product) return;
  const config = state.config || {};
  const price = productPrice(product);
  const heroTitle = $('#heroProductTitle');
  const heroDescription = $('#heroProductDescription');
  const navBasePrice = $('#navBasePrice');
  const storefrontPrice = $('#storefrontPrice');
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
    if (heroHas3d) {
      posterEl.hidden = true;
      posterEl.removeAttribute('src');
      posterEl.alt = '';
    } else {
      posterEl.hidden = false;
      posterEl.src = poster;
      posterEl.alt = product.name || 'Product';
    }
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
  const host = $('#storefrontProducts');
  if (!host) return;
  const selectedId = String(state.selectedProduct?.id || '');
  const visible = filteredProducts();
  host.innerHTML = visible.map((product) => {
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
  const sizeEl = $('#storefrontSize');
  if (sizeEl) {
    sizeEl.innerHTML = sizes.map((size) =>
      `<option value="${escapeHtml(size.code)}" ${size.code === state.selectedSize ? 'selected' : ''}>${escapeHtml(size.label)}</option>`
    ).join('');
  }

  const colors = productColors(state.selectedProduct);
  const colorsEl = $('#storefrontColors');
  if (!colorsEl) return;
  colorsEl.innerHTML = colors.map((color) => `
    <button class="storefront-swatch${color.hex === state.selectedColorHex ? ' active' : ''}" type="button" data-color="${escapeHtml(color.hex)}" data-name="${escapeHtml(color.name)}" title="${escapeHtml(color.name)}">
      <span style="background:${escapeHtml(color.hex)}"></span>
    </button>
  `).join('');
  NEB.wireMediaImages($('#storefrontProducts'));
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
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    report3dError(state.activeModel?.productId, 'hero-context-lost', new Error('WebGL context lost'));
    clearHeroModelGroup();
    state.activeModel = null;
    setHeroMediaMode('2d');
    cancelAnimationFrame(state.frameId);
    state.frameId = 0;
  }, false);
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
  ensureAnimateLoop();
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
  try {
    if (!state.renderer) setupThree();
  } catch (err) {
    console.warn('Hero 3D renderer kon niet starten:', err);
    report3dError(product?.id, 'hero-setup', err);
    const poster = productPreviewPoster(product);
    const posterEl = $('#hero3dPoster');
    if (posterEl && poster) {
      posterEl.hidden = false;
      posterEl.src = poster;
      posterEl.alt = product?.name || 'Product';
    }
    setHeroMediaMode('2d');
    return;
  }
  const token = Symbol('model-load');
  state.loadingToken = token;
  const manifest = modelManifest(product);
  const has3d = hasProductModel3d(product) && manifest.enabled && !!manifest.modelPath;

  if (state.modelGroup) clearHeroModelGroup();
  state.activeModel = null;
  paintRendererClear(state.renderer);

  if (!has3d) {
    setHeroMediaMode('2d');
    return;
  }

  setHeroMediaMode('loading');
  try {
    configureRendererQuality(state.renderer, manifest, 'hero');
    configureHeroRendererSurface(state.renderer, state.scene);
    const object = await loadModelScene(manifest, assetUrl);
    if (state.loadingToken !== token) {
      disposeObject3d(object);
      return;
    }
    await prepareSceneTextures(state.renderer, object);
    if (state.loadingToken !== token) {
      disposeObject3d(object);
      return;
    }
    clearHeroModelGroup();
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
    ensureAnimateLoop();
  } catch (err) {
    console.warn('3D model laden mislukt:', err);
    report3dError(product?.id, 'hero', err);
    if (state.loadingToken !== token) return;
    clearHeroModelGroup();
    state.activeModel = null;
    setHeroMediaMode('2d');
    const posterEl = $('#hero3dPoster');
    const poster = productPreviewPoster(product);
    if (posterEl) {
      posterEl.hidden = false;
      if (poster) {
        posterEl.src = poster;
        posterEl.alt = product?.name || 'Product';
        NEB.wireMediaImage(posterEl);
      }
    }
  }
}

function clearHeroModelGroup() {
  if (!state.modelGroup) return;
  while (state.modelGroup.children.length) {
    const child = state.modelGroup.children[0];
    state.modelGroup.remove(child);
    disposeObject3d(child);
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

function disposeMiniPreviewEntry(entry) {
  if (!entry) return;
  entry.loadGen = Symbol('disposed');
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
  if (!ENABLE_MINI_3D_PREVIEWS) return null;
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
    const loadGen = Symbol('mini-load');
    entry.loadGen = loadGen;
    try {
      const manifest = modelManifest(product);
      const object = await loadModelScene(manifest, assetUrl);
      if (entry.loadGen !== loadGen || state.miniPreviews.get(productId) !== entry) {
        disposeObject3d(object);
        return null;
      }
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
  if (!ENABLE_MINI_3D_PREVIEWS) {
    updateMiniPreviewMediaClass(productId);
    return;
  }
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
  entry.loadGen = Symbol('disposed');
  if (entry.scene && entry.presentation) {
    disposePresentationState(entry.scene, entry.presentation);
    entry.presentation = null;
  }
  if (entry.displayModel && entry.modelGroup) {
    entry.modelGroup.remove(entry.displayModel);
    disposeObject3d(entry.displayModel);
    entry.displayModel = null;
  } else if (entry.displayModel) {
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
  const loading = !!(entry?.active && !entry?.ready && !entry?.failed && (entry?.loadingPromise || entry?.loading));
  if (stage) {
    stage.classList.toggle('is-dock-3d-live', live);
    stage.classList.toggle('is-dock-3d-loading', loading);
    stage.classList.toggle('is-dock-3d-error', !!entry?.failed);
  }
}

async function ensureHeroDockPreview(product) {
  if (!ENABLE_DOCK_3D_PREVIEWS) return null;
  const productId = String(product.id || '');
  if (!productId || !hasProductModel3d(product)) return null;

  const existing = state.heroDockPreviews.get(productId);
  if (existing?.ready) return existing;
  if (existing?.loadingPromise) return existing.loadingPromise;

  const canvas = document.querySelector(`.storefront-hero-dock-canvas[data-dock-product="${CSS.escape(productId)}"]`);
  if (!canvas) return null;

  const entry = existing || { productId, ready: false, active: false, failed: false };
  entry.canvas = canvas;
  entry.loading = true;
  entry.failed = false;
  state.heroDockPreviews.set(productId, entry);
  updateHeroDockMediaClass(productId);

  entry.loadingPromise = (async () => {
    const loadGen = Symbol('dock-load');
    entry.loadGen = loadGen;
    try {
      const manifest = modelManifest(product);
      const object = await loadModelScene(manifest, assetUrl);
      if (entry.loadGen !== loadGen || state.heroDockPreviews.get(productId) !== entry) {
        disposeObject3d(object);
        return null;
      }
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
        loading: false,
        failed: false,
        loadingPromise: null
      });
      updateHeroDockMediaClass(productId);
      resizeHeroDockEntry(entry);
      entry.renderer.render(entry.scene, entry.camera);
      return entry;
    } catch (err) {
      console.warn('Hero dock 3D laden mislukt:', productId, err);
      report3dError(productId, 'hero-dock', err);
      entry.loading = false;
      entry.failed = true;
      entry.loadingPromise = null;
      disposeHeroDockEntry(entry);
      updateHeroDockMediaClass(productId);
      return null;
    }
  })();

  return entry.loadingPromise;
}

async function setHeroDockPreviewLive(productId, live) {
  if (!ENABLE_DOCK_3D_PREVIEWS) {
    updateHeroDockMediaClass(productId);
    return;
  }
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

  if (!live) return;

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

function heroDockItemMarkup(product, selectedId) {
  const id = escapeHtml(product.id);
  const active = String(product.id) === selectedId;
  const label = escapeHtml(product.name || 'Product');
  const poster = escapeHtml(productPreviewPoster(product));
  return `
      <button type="button" class="storefront-hero-3d-dock-item${active ? ' is-active' : ''}" data-dock-product="${id}" aria-label="${label}" aria-pressed="${active ? 'true' : 'false'}" title="${label}">
        <span class="storefront-hero-3d-dock-stage digitify-media-stage is-media-loading">
          <canvas class="storefront-hero-dock-canvas" data-dock-product="${id}" aria-hidden="true"></canvas>
          <img class="storefront-hero-dock-poster" src="${poster}" alt="" loading="lazy" decoding="async" data-digitify-media>
          ${NEB.mediaLoaderHtml('sm')}
          <span class="storefront-hero-dock-loader" aria-hidden="true">
            <span class="storefront-hero-dock-loader-cube"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          </span>
          <span class="storefront-hero-dock-error" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>
          </span>
        </span>
      </button>`;
}

function releaseInactiveHeroDockPreviews(selectedId) {
  const keepId = String(selectedId || '');
  state.heroDockPreviews.forEach((entry, id) => {
    if (String(id) === keepId) return;
    entry.active = false;
    updateHeroDockMediaClass(id);
    if (entry.loadingPromise) entry.loadingPromise = null;
    entry.loading = false;
    disposeHeroDockEntry(entry);
    state.heroDockPreviews.delete(id);
  });
}

function syncHeroDockPreviews(items) {
  const list = items || productsWith3d();
  const selectedId = String(state.selectedProduct?.id || '');
  if (!ENABLE_DOCK_3D_PREVIEWS) {
    releaseInactiveHeroDockPreviews('');
    return;
  }
  releaseInactiveHeroDockPreviews(selectedId);
  list.forEach((product) => {
    const id = String(product.id || '');
    const shouldLive = id === selectedId && !prefersMobilePosterOnly;
    setHeroDockPreviewLive(id, shouldLive);
  });
}

function renderHero3dDock() {
  try {
    renderHero3dDockInner();
  } catch (err) {
    console.warn('Hero dock render mislukt:', err);
  }
}

function renderHero3dDockInner() {
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
    syncHeroDockPreviews(items);
    return;
  }

  disposeAllHeroDockPreviews();
  track.dataset.itemIds = itemIds;
  track.innerHTML = items.map((product) => heroDockItemMarkup(product, selectedId)).join('');

  syncHeroDockPreviews(items);
  NEB.wireMediaImages(track);
}

function needsRenderLoop() {
  if (!state.pageVisible) return false;
  const heroMode = document.querySelector('.storefront-hero-stage')?.dataset?.mediaMode;
  if (heroMode === '3d' && state.renderer && state.modelGroup?.children?.length) return true;
  const selectionMode = $('#storefrontSelectionStage')?.dataset?.mediaMode;
  const sp = state.selectionPreview;
  if (selectionMode === '3d' && sp.renderer && sp.modelGroup?.children?.length) return true;
  if (ENABLE_MINI_3D_PREVIEWS) {
    for (const entry of state.miniPreviews.values()) {
      if (entry.active && entry.ready && state.miniVisible.has(entry.productId)) return true;
    }
  }
  if (ENABLE_DOCK_3D_PREVIEWS) {
    for (const entry of state.heroDockPreviews.values()) {
      if (entry.active && entry.ready) return true;
    }
  }
  return false;
}

function ensureAnimateLoop() {
  if (!state.frameId && needsRenderLoop()) animateThree();
}

function animateThree(timestamp = performance.now()) {
  state.frameId = 0;
  if (!needsRenderLoop()) return;
  state.frameId = requestAnimationFrame(animateThree);
  const delta = Math.min(0.05, Math.max(0.001, (timestamp - (state.lastFrameTime || timestamp)) / 1000));
  state.lastFrameTime = timestamp;

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
    sp.renderer.render(sp.scene, sp.camera);
  }

  if (ENABLE_MINI_3D_PREVIEWS) {
    state.miniPreviews.forEach((entry) => {
      if (!entry.active || !entry.ready || !entry.renderer || !entry.modelGroup) return;
      if (!state.miniVisible.has(entry.productId)) return;
      if (!state.reduceMotion) {
        entry.modelGroup.rotation.y += MINI_PREVIEW_ROTATE_SPEED * delta;
      }
      entry.renderer.render(entry.scene, entry.camera);
    });
  }

  if (ENABLE_DOCK_3D_PREVIEWS) {
    state.heroDockPreviews.forEach((entry) => {
      if (!entry.active || !entry.ready || !entry.renderer || !entry.modelGroup) return;
      if (!state.reduceMotion) {
        entry.modelGroup.rotation.y += HERO_DOCK_ROTATE_SPEED * delta;
      }
      entry.renderer.render(entry.scene, entry.camera);
    });
  }
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
  if (state.cartAddInFlight) return;
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
  let redirecting = false;
  state.cartAddInFlight = true;
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
      redirecting = true;
      window.location.href = '/cart';
      return;
    }
  } catch (err) {
    if (err.status === 401) {
      redirecting = true;
      window.location.href = '/login';
      return;
    }
    NEB.toast(err.message || 'Toevoegen mislukt', 'error');
  } finally {
    if (!redirecting) {
      state.cartAddInFlight = false;
      if (button) { button.disabled = false; button.textContent = oldText; }
    }
  }
}

async function init() {
  let config;
  try {
    config = await resolveStorefrontConfig();
  } catch (err) {
    console.error(err);
    showStorefrontCatalogError('Productcatalogus kon niet geladen worden. Controleer je internetverbinding en probeer opnieuw.');
    updateReduceMotionNotice();
    bindStorefrontEvents();
    document.documentElement.classList.add('digitify-storefront-ready');
    document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
    NEB.toast('Producten laden mislukt', 'error');
    return;
  }
  state.config = config;
  window.NEB_CONFIG = config;
  if (window.NEB?.applyBranding) NEB.applyBranding(config);
  resolveAssetUrl = createAssetUrlResolver(config);
  state.products = (window.NEB?.sortCatalogProducts
    ? NEB.sortCatalogProducts(Array.isArray(config.products) ? config.products : [])
    : (Array.isArray(config.products) ? config.products : [])
  ).filter((p) => p && p.enabled !== false);
  const fromUrl = productFromUrlParam();
  const featured = fromUrl
    || state.products.find((p) => p.isFeatured)
    || state.products.find((p) => p.isDefault)
    || state.products[0];
  if (!featured) {
    updateReduceMotionNotice();
    bindStorefrontEvents();
    document.documentElement.classList.add('digitify-storefront-ready');
    document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
    return;
  }
  selectProduct(featured);
  updateReduceMotionNotice();
  bindStorefrontEvents();
  document.documentElement.classList.add('digitify-storefront-ready');
  document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
}

function bindStorefrontEvents() {
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
    $('#storefrontColors')?.querySelectorAll('[data-color]').forEach((el) => {
      el.classList.toggle('active', normalizeHex(el.dataset.color) === state.selectedColorHex);
    });
  });
  $('#storefrontAddToCart')?.addEventListener('click', addSelectedToCart);
  $('#heroAddToCart')?.addEventListener('click', addSelectedToCart);
  $('#selection3dToggle')?.addEventListener('click', () => {
    toggleSelectionPreview3d().catch((err) => console.error(err));
  });
}

init().catch((err) => {
  console.error(err);
  NEB.toast('Producten laden mislukt', 'error');
  document.documentElement.classList.add('digitify-storefront-ready');
  document.dispatchEvent(new CustomEvent('digitify:storefront-ready'));
});
