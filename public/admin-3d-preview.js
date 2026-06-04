import * as THREE from 'https://esm.sh/three@0.170.0';
import {
  applyManifestToDisplayPivot,
  coalesceModel3dManifest,
  fitPerspectiveCameraToHeroDisplay,
  fitPerspectiveCameraToModel,
  inferModelFormat,
  loadModelScene,
  prepareSceneTextures,
  wrapModelForDisplay
} from './model3d-runtime.js';
import {
  applyMaterialPresentationTweaks,
  applyModel3dPresentation,
  configureRendererPresentation,
  disposePresentationState,
  refreshPresentationForModel,
  resolvePresentation,
  updateContactShadowPlane
} from './model3d-presentation.js';
import { modelQuality } from './model3d-shared.js';

function modelDisplayScale(manifest) {
  const raw = Number(manifest?.scale);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(20, Math.max(0.01, raw));
}

function manifestForAdminPreview(manifest, mode) {
  if (mode === 'catalog') return manifestForCatalogPreview(manifest);
  return { ...manifest };
}

function manifestForCatalogPreview(manifest) {
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

function readModalNum(modal, sel) {
  const el = modal.querySelector(sel);
  if (!el || el.disabled) return undefined;
  const v = Number(el.value);
  return Number.isFinite(v) ? v : undefined;
}

function readManifestFromModal(modal) {
  const posterFallback = (modal.querySelector('#pmMockupPath')?.value || 'assets/tshirt_mockup.png').trim();
  return coalesceModel3dManifest({
    enabled: !!modal.querySelector('#pmModel3dEnabled')?.checked,
    format: modal.querySelector('#pmModel3dFormat')?.value || 'glb',
    quality: modal.querySelector('#pmModel3dQuality')?.value || 'high',
    modelPath: (modal.querySelector('#pmModel3dPath')?.value || '').trim(),
    materialPath: (modal.querySelector('#pmModel3dMaterial')?.value || '').trim(),
    posterPath: (modal.querySelector('#pmModel3dPoster')?.value || '').trim(),
    resourceDir: (modal.querySelector('#pmModel3dResourceDir')?.value || '').trim(),
    scale: Number(modal.querySelector('#pmModel3dScale')?.value || 1) || 1,
    rotationY: Number(modal.querySelector('#pmModel3dRotY')?.value || 0) || 0,
    autoRotate: !!modal.querySelector('#pmModel3dAutoRotate')?.checked,
    rotateSpeed: Number(modal.querySelector('#pmModel3dRotateSpeed')?.value ?? 0.42) || 0,
    lightingPreset: modal.querySelector('#pmModel3dLighting')?.value,
    envPreset: modal.querySelector('#pmModel3dEnv')?.value,
    shadowPreset: modal.querySelector('#pmModel3dShadowPreset')?.value,
    groundShadows: modal.querySelector('#pmModel3dGroundShadows')?.checked !== false,
    keyLightColor: modal.querySelector('#pmModel3dKeyLightColor')?.value,
    fillLightIntensity: readModalNum(modal, '#pmModel3dFillLightIntensity'),
    rimLightIntensity: readModalNum(modal, '#pmModel3dRimLightIntensity'),
    fillLightColor: modal.querySelector('#pmModel3dFillLightColor')?.value,
    rimLightColor: modal.querySelector('#pmModel3dRimLightColor')?.value,
    detailLevel: modal.querySelector('#pmModel3dDetailLevel')?.value,
    exposure: readModalNum(modal, '#pmModel3dExposure'),
    envIntensity: readModalNum(modal, '#pmModel3dEnvIntensity'),
    shadowOpacity: readModalNum(modal, '#pmModel3dGroundShadowOpacity'),
    groundShadowOpacity: readModalNum(modal, '#pmModel3dGroundShadowOpacity'),
    productShadowOpacity: readModalNum(modal, '#pmModel3dProductShadowOpacity'),
    saturation: readModalNum(modal, '#pmModel3dSaturation')
  }, { posterFallback: posterFallback.replace(/^\/+/, '') });
}

const assetUrl = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return '/' + value.replace(/^\/+/, '');
};

const ADMIN_DRAG_YAW = 0.0085;
const ADMIN_DRAG_PITCH = 0.0065;
const ADMIN_DRAG_PITCH_LIMIT = 0.55;
const ADMIN_ZOOM_STEP = 1.14;
const ADMIN_ZOOM_MIN = 0.4;
const ADMIN_ZOOM_MAX = 3.2;

function setPreviewStageState(canvas, state, message = '') {
  const wrap = canvas?.closest('.prod-3d-preview-stage');
  if (!wrap) return;
  wrap.dataset.previewState = state || '';
  wrap.title = message || '';
}

export class Admin3dPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'hero';
    this.loadToken = null;
    this.frameId = 0;
    this.lastFrameTime = 0;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0xe8f0f4, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8f0f4);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.presentationState = null;
    this.displayModel = null;
    this.manifest = null;
    this._loadedKey = '';
    this._boundModal = null;
    this._lastTransformKey = '';
    this._shadowFitDirty = true;
    this._lastShadowFitRotY = null;
    this.view = {
      target: new THREE.Vector3(),
      baseDistance: 5,
      zoom: 1
    };
    this.drag = {
      active: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      pausedAuto: false
    };
    this._resizeObs = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this.resize())
      : null;
    if (this._resizeObs && canvas?.parentElement) this._resizeObs.observe(canvas.parentElement);
    this._animate = this._animate.bind(this);
    this._setupInteraction();
    this.frameId = requestAnimationFrame(this._animate);
  }

  _setupInteraction() {
    const stage = this.canvas?.closest('.prod-3d-preview-stage');
    if (!this.canvas) return;
    this._interactionAbort?.abort();
    this._interactionAbort = new AbortController();
    const { signal } = this._interactionAbort;
    this.canvas.style.touchAction = 'none';

    const endDrag = () => {
      if (!this.drag.active) return;
      this.drag.active = false;
      this.drag.pointerId = null;
      this.canvas.classList.remove('is-dragging');
      if (this.drag.pausedAuto) {
        window.setTimeout(() => { this.drag.pausedAuto = false; }, 1600);
      }
    };

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.displayModel) return;
      this.drag.active = true;
      this.drag.pointerId = event.pointerId;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.drag.pausedAuto = true;
      this.canvas.classList.add('is-dragging');
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }, { signal });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag.active || event.pointerId !== this.drag.pointerId || !this.modelGroup) return;
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.modelGroup.rotation.y += dx * ADMIN_DRAG_YAW;
      this.modelGroup.rotation.x = THREE.MathUtils.clamp(
        this.modelGroup.rotation.x + dy * ADMIN_DRAG_PITCH,
        -ADMIN_DRAG_PITCH_LIMIT,
        ADMIN_DRAG_PITCH_LIMIT
      );
      event.preventDefault();
    }, { signal });

    this.canvas.addEventListener('pointerup', endDrag, { signal });
    this.canvas.addEventListener('pointercancel', endDrag, { signal });
    this.canvas.addEventListener('lostpointercapture', endDrag, { signal });

    this.canvas.addEventListener('dblclick', (event) => {
      this.resetView();
      event.preventDefault();
    }, { signal });

    const zoomIn = stage?.querySelector('#pmModel3dPreviewZoomIn');
    const zoomOut = stage?.querySelector('#pmModel3dPreviewZoomOut');
    const zoomReset = stage?.querySelector('#pmModel3dPreviewZoomReset');
    zoomIn?.addEventListener('click', () => this.adjustZoom(ADMIN_ZOOM_STEP), { signal });
    zoomOut?.addEventListener('click', () => this.adjustZoom(1 / ADMIN_ZOOM_STEP), { signal });
    zoomReset?.addEventListener('click', () => this.resetView(), { signal });
  }

  adjustZoom(factor) {
    if (!this.displayModel) return;
    this.view.zoom = THREE.MathUtils.clamp(this.view.zoom * factor, ADMIN_ZOOM_MIN, ADMIN_ZOOM_MAX);
    this._applyViewZoom();
    this.renderOnce();
  }

  resetView() {
    this.view.zoom = 1;
    this.modelGroup.rotation.set(0, 0, 0);
    this._lastShadowFitRotY = 0;
    this.drag.pausedAuto = false;
    if (this.displayModel) this._fitCamera();
    this.renderOnce();
  }

  _syncViewFromCamera() {
    if (!this.displayModel) return;
    this.displayModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.displayModel);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const distance = Math.max(0.08, this.camera.position.distanceTo(center));
    this.view.target.copy(center);
    this.view.baseDistance = distance;
  }

  _applyViewZoom() {
    if (!this.displayModel || !this.view.baseDistance) return;
    const offset = this.camera.position.clone().sub(this.view.target);
    if (offset.lengthSq() < 1e-8) offset.set(0, 0, 1);
    offset.normalize().multiplyScalar(this.view.baseDistance / this.view.zoom);
    this.camera.position.copy(this.view.target).add(offset);
    this.camera.lookAt(this.view.target);
    this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    this.mode = mode === 'catalog' ? 'catalog' : 'hero';
    if (this.displayModel && this._boundModal) {
      this.applySettingsFromModal(this._boundModal);
      return;
    }
    if (this.displayModel) this._fitCamera();
    this.renderOnce();
  }

  _manifestReloadKey(manifest) {
    return [
      manifest?.modelPath || '',
      inferModelFormat(manifest),
      modelQuality(manifest),
      manifest?.materialPath || ''
    ].join('|');
  }

  applySettingsFromModal(modal = this._boundModal, opts = {}) {
    if (!modal) return;
    const manifest = readManifestFromModal(modal);
    this.manifest = manifest;
    if (!manifest.enabled || !manifest.modelPath) {
      setPreviewStageState(this.canvas, 'empty', 'Upload een 3D-model');
      this.renderOnce();
      return;
    }
    const reloadKey = this._manifestReloadKey(manifest);
    if (!this.displayModel || this._loadedKey !== reloadKey) {
      return this.reloadFromModal(modal);
    }
    const previewManifest = manifestForAdminPreview(manifest, this.mode);
    const transformKey = [
      previewManifest.rotationY,
      previewManifest.rotationX,
      previewManifest.rotationZ,
      previewManifest.scale,
      this.mode
    ].join('|');
    const transformChanged = transformKey !== this._lastTransformKey;
    if (transformChanged || opts.forceTransform) {
      applyManifestToDisplayPivot(this.displayModel, previewManifest);
      this._lastTransformKey = transformKey;
      if (opts.resetOrbit) {
        this.modelGroup.rotation.set(0, 0, 0);
      }
      if (this.mode === 'hero') this._fitCamera();
    }
    this.presentationState = refreshPresentationForModel(
      this.renderer,
      this.scene,
      this.presentationState,
      this.displayModel,
      manifest
    );
    const pres = this.presentationState?.presentation || resolvePresentation(manifest, 'hero');
    applyMaterialPresentationTweaks(this.displayModel, pres);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pres.pixelRatioCap));
    this._shadowFitDirty = true;
    setPreviewStageState(this.canvas, 'ready', '');
    this.renderOnce();
  }

  bindModal(modal) {
    this._boundModal = modal;
    if (modal && !this.frameId) {
      this._animate = this._animate.bind(this);
      this.frameId = requestAnimationFrame(this._animate);
    }
  }

  async reloadFromModal(modal = this._boundModal) {
    if (!modal) return;
    const manifest = readManifestFromModal(modal);
    const token = Symbol('admin3d');
    this.loadToken = token;
    this.manifest = manifest;
    setPreviewStageState(this.canvas, 'loading', '3D-model laden…');
    this.renderOnce();

    while (this.modelGroup.children.length) {
      const child = this.modelGroup.children[0];
      this.modelGroup.remove(child);
      child.traverse?.((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.filter(Boolean).forEach((m) => m.dispose?.());
      });
    }
    this.displayModel = null;
    this.modelGroup.rotation.y = 0;

    if (!manifest.enabled || !manifest.modelPath) {
      setPreviewStageState(this.canvas, 'empty', '3D uitgeschakeld of geen modelpad');
      this.renderOnce();
      return;
    }

    try {
      const object = await loadModelScene(manifest, assetUrl);
      if (this.loadToken !== token) return;

      this.resize();
      this.renderOnce();

      try {
        await prepareSceneTextures(this.renderer, object);
      } catch (texErr) {
        console.warn('Admin 3D texture preload:', texErr);
      }

      const previewManifest = manifestForAdminPreview(manifest, this.mode);
      const pres = resolvePresentation(manifest, 'hero');
      configureRendererPresentation(this.renderer, pres);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pres.pixelRatioCap));

      const displayModel = wrapModelForDisplay(object, previewManifest, {
        edgeHighlight: inferModelFormat(manifest) === 'obj',
        maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy?.() || 4
      });
      this.modelGroup.add(displayModel);
      this.displayModel = displayModel;
      this._loadedKey = this._manifestReloadKey(manifest);

      this.presentationState = applyModel3dPresentation({
        renderer: this.renderer,
        scene: this.scene,
        manifest,
        displayModel,
        context: 'hero'
      });
      applyMaterialPresentationTweaks(this.displayModel, this.presentationState?.presentation);
      this._lastTransformKey = [
        previewManifest.rotationY,
        previewManifest.rotationX,
        previewManifest.rotationZ,
        previewManifest.scale,
        this.mode
      ].join('|');
      this._shadowFitDirty = true;
      this.modelGroup.rotation.set(0, 0, 0);
      this._lastShadowFitRotY = 0;

      this._fitCamera();
      setPreviewStageState(this.canvas, 'ready', '');
      this.renderOnce();
    } catch (err) {
      if (this.loadToken !== token) return;
      console.warn('Admin 3D preview:', err);
      window.report3dError?.(getPm3dProductIdFromModal(modal), 'admin-preview', err);
      setPreviewStageState(this.canvas, 'error', err?.message || '3D-preview mislukt');
      if (typeof NEB !== 'undefined' && NEB.toast) {
        NEB.toast(err?.message || '3D-preview kon niet laden — controleer modelpad en formaat', 'error');
      }
      this.renderOnce();
    }
  }

  resize() {
    const wrap = this.canvas?.parentElement;
    const w = Math.max(120, wrap?.clientWidth || 280);
    const h = Math.max(120, wrap?.clientHeight || 200);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.displayModel) this._fitCamera();
  }

  _fitCamera() {
    if (!this.displayModel || !this.manifest) return;
    const userScale = modelDisplayScale(this.manifest);
    if (this.mode === 'catalog') {
      fitPerspectiveCameraToModel(this.camera, this.displayModel, { margin: 1.22, yLift: 0.02 });
    } else {
      fitPerspectiveCameraToHeroDisplay(this.camera, this.displayModel, {
        userScale,
        margin: 1.2,
        yLift: 0.02
      });
    }
    this._syncViewFromCamera();
    this._applyViewZoom();
  }

  renderOnce() {
    if (this.presentationState?.shadow && this.displayModel) {
      const rotY = this.modelGroup.rotation.y;
      const rotDelta = this._lastShadowFitRotY == null
        ? true
        : Math.abs(rotY - this._lastShadowFitRotY) > 0.008;
      if (this._shadowFitDirty || rotDelta) {
        updateContactShadowPlane(this.presentationState.shadow, this.displayModel);
        this._lastShadowFitRotY = rotY;
        this._shadowFitDirty = false;
      }
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _animate(ts = performance.now()) {
    this.frameId = requestAnimationFrame(this._animate);
    const delta = Math.min(0.05, Math.max(0.001, (ts - (this.lastFrameTime || ts)) / 1000));
    this.lastFrameTime = ts;
    const allowAutoRotate = !this.drag.active && !this.drag.pausedAuto;
    if (this.displayModel && allowAutoRotate && !this.reduceMotion && this.manifest?.autoRotate === true) {
      const speed = Math.min(3, Math.max(0, Number(this.manifest.rotateSpeed) || 0.42));
      this.modelGroup.rotation.y += speed * delta;
    }
    this.renderOnce();
  }

  async capturePosterBlob() {
    if (this.displayModel && this.manifest) {
      if (this.mode === 'catalog') {
        fitPerspectiveCameraToModel(this.camera, this.displayModel, { margin: 1.38, yLift: 0.02 });
      } else {
        fitPerspectiveCameraToHeroDisplay(this.camera, this.displayModel, {
          userScale: modelDisplayScale(this.manifest),
          margin: 1.35,
          yLift: 0.02
        });
      }
      this._syncViewFromCamera();
      this._applyViewZoom();
    } else {
      this._fitCamera();
    }
    this.renderOnce();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Snapshot mislukt'));
      }, 'image/png', 0.92);
    });
  }

  dispose() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this._interactionAbort?.abort();
    this._resizeObs?.disconnect();
    disposePresentationState(this.scene, this.presentationState || {});
    this.presentationState = null;
    this.renderer?.dispose();
    this.displayModel = null;
    this.loadToken = null;
  }
}

function getPm3dProductIdFromModal(modal) {
  const raw = (modal.querySelector('#pmId')?.value || modal.querySelector('#pmName')?.value || 'product').trim();
  return raw.toLowerCase().replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'product';
}

let singleton = null;

export function getAdmin3dPreview(canvas) {
  if (!canvas) return null;
  if (!singleton || singleton.canvas !== canvas) {
    singleton?.dispose();
    singleton = new Admin3dPreview(canvas);
  }
  return singleton;
}

export function disposeAdmin3dPreview() {
  singleton?.dispose();
  singleton = null;
}

window.Admin3dPreview = { getAdmin3dPreview, disposeAdmin3dPreview, Admin3dPreview };
