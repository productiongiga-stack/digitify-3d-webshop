import * as THREE from 'https://esm.sh/three@0.170.0';
import { GLTFLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/FBXLoader.js';
import { modelQuality } from './model3d-shared.js';
import { applyEnvironment, formatKeyLightColorHex, resolvePresentation } from './model3d-presentation.js';

export { modelQuality };

const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const SUPPORTED_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'fbx'];
let dracoLoader = null;
let gltfLoader = null;

/** Prefer file extension over stored format (admin dropdown can be stale after upload). */
export function inferModelFormat(manifest) {
  const path = String(manifest?.modelPath || manifest?.path || '').trim().toLowerCase();
  if (path.endsWith('.obj')) return 'obj';
  if (path.endsWith('.glb')) return 'glb';
  if (path.endsWith('.gltf')) return 'gltf';
  if (path.endsWith('.stl')) return 'stl';
  if (path.endsWith('.fbx')) return 'fbx';
  const fmt = String(manifest?.format || '').trim().toLowerCase();
  if (SUPPORTED_FORMATS.includes(fmt)) return fmt;
  return 'glb';
}

function inferResourceDirFromPath(modelPath) {
  const path = String(modelPath || '').trim().replace(/^\/+/, '');
  if (!path.includes('/')) return '';
  return path.slice(0, path.lastIndexOf('/') + 1);
}

/** Normalize product.model3d for loaders (matches server sanitizeModel3d). */
export function coalesceModel3dManifest(raw, options = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const posterFallback = String(options.posterFallback || 'assets/tshirt_mockup.png').trim().replace(/^\/+/, '');
  const modelPath = String(src.modelPath || src.path || '').trim().replace(/^\/+/, '');
  if (!modelPath || modelPath.includes('..')) {
    return {
      enabled: false,
      format: '',
      modelPath: '',
      materialPath: '',
      posterPath: posterFallback,
      resourceDir: '',
      quality: 'high',
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      autoRotate: false,
      rotateSpeed: options.defaultRotateSpeed ?? 0.42,
      lightingPreset: 'studio',
      envPreset: 'room',
      shadows: true,
      exposure: 1.08,
      envIntensity: 1.35,
      shadowOpacity: 0.42,
      groundShadowOpacity: 0.42,
      productShadowOpacity: 0.42,
      shadowPreset: 'natural',
      groundShadows: true,
      keyLightColor: '',
      fillLightIntensity: 1,
      rimLightIntensity: 1,
      fillLightColor: '',
      rimLightColor: '',
      detailLevel: 'auto',
      saturation: 1
    };
  }
  const materialPath = String(src.materialPath || '').trim().replace(/^\/+/, '');
  const posterPath = String(src.posterPath || src.poster || posterFallback).trim().replace(/^\/+/, '');
  let resourceDir = String(src.resourceDir || '').trim().replace(/^\/+/, '');
  if (!resourceDir) resourceDir = inferResourceDirFromPath(modelPath);
  const scaleRaw = Number(src.scale);
  const rotationXRaw = Number(src.rotationX);
  const rotationYRaw = Number(src.rotationY);
  const rotationZRaw = Number(src.rotationZ);
  const rotateSpeedRaw = Number(src.rotateSpeed);
  const draft = {
    enabled: src.enabled !== false,
    format: src.format,
    modelPath,
    materialPath,
    posterPath,
    resourceDir,
    quality: src.quality,
    scale: scaleRaw,
    rotationX: rotationXRaw,
    rotationY: rotationYRaw,
    rotationZ: rotationZRaw,
    autoRotate: src.autoRotate,
    rotateSpeed: rotateSpeedRaw,
    lightingPreset: src.lightingPreset,
    envPreset: src.envPreset,
    shadows: src.shadows,
    exposure: src.exposure,
    envIntensity: src.envIntensity,
    shadowOpacity: src.shadowOpacity,
    groundShadowOpacity: src.groundShadowOpacity,
    productShadowOpacity: src.productShadowOpacity,
    shadowPreset: src.shadowPreset,
    groundShadows: src.groundShadows,
    keyLightColor: src.keyLightColor,
    fillLightIntensity: src.fillLightIntensity,
    rimLightIntensity: src.rimLightIntensity,
    fillLightColor: src.fillLightColor,
    rimLightColor: src.rimLightColor,
    detailLevel: src.detailLevel,
    saturation: src.saturation
  };
  const format = inferModelFormat({ ...draft, modelPath });
  const materialOut = format === 'obj' ? materialPath : '';
  const base = {
    enabled: draft.enabled,
    format,
    modelPath,
    materialPath: materialOut,
    posterPath,
    resourceDir,
    quality: modelQuality(draft),
    scale: Number.isFinite(scaleRaw) ? Math.min(20, Math.max(0.01, scaleRaw)) : 1,
    rotationX: Number.isFinite(rotationXRaw) ? Math.max(-360, Math.min(360, rotationXRaw)) : 0,
    rotationY: Number.isFinite(rotationYRaw) ? Math.max(-360, Math.min(360, rotationYRaw)) : 0,
    rotationZ: Number.isFinite(rotationZRaw) ? Math.max(-360, Math.min(360, rotationZRaw)) : 0,
    autoRotate: draft.autoRotate === true,
    rotateSpeed: Number.isFinite(rotateSpeedRaw)
      ? Math.min(3, Math.max(0, rotateSpeedRaw))
      : (options.defaultRotateSpeed ?? 0.42),
    lightingPreset: draft.lightingPreset,
    envPreset: draft.envPreset,
    shadows: draft.shadows,
    exposure: draft.exposure,
    envIntensity: draft.envIntensity,
    shadowOpacity: draft.shadowOpacity,
    groundShadowOpacity: draft.groundShadowOpacity,
    productShadowOpacity: draft.productShadowOpacity,
    shadowPreset: draft.shadowPreset,
    groundShadows: draft.groundShadows !== false,
    keyLightColor: String(draft.keyLightColor || '').trim(),
    fillLightIntensity: draft.fillLightIntensity,
    rimLightIntensity: draft.rimLightIntensity,
    fillLightColor: String(draft.fillLightColor || '').trim(),
    rimLightColor: String(draft.rimLightColor || '').trim(),
    detailLevel: String(draft.detailLevel || 'auto').trim().toLowerCase(),
    saturation: draft.saturation
  };
  const pres = resolvePresentation(base);
  const detailLevels = new Set(['auto', 'low', 'medium', 'high']);
  const fillMulRaw = Number(base.fillLightIntensity);
  const rimMulRaw = Number(base.rimLightIntensity);
  return {
    ...base,
    lightingPreset: pres.lightingPreset,
    envPreset: pres.envPreset,
    shadows: pres.shadows,
    shadowPreset: pres.shadowPreset,
    groundShadows: pres.groundShadows,
    keyLightColor: formatKeyLightColorHex(pres.keyLightColor) || (base.keyLightColor || ''),
    fillLightIntensity: Number.isFinite(fillMulRaw) ? Math.min(2, Math.max(0.5, fillMulRaw)) : 1,
    rimLightIntensity: Number.isFinite(rimMulRaw) ? Math.min(2, Math.max(0.5, rimMulRaw)) : 1,
    fillLightColor: formatKeyLightColorHex(pres.fillLightColor) || (base.fillLightColor || ''),
    rimLightColor: formatKeyLightColorHex(pres.rimLightColor) || (base.rimLightColor || ''),
    detailLevel: detailLevels.has(base.detailLevel) ? base.detailLevel : 'auto',
    exposure: pres.exposure,
    envIntensity: pres.envIntensity,
    shadowOpacity: pres.groundShadowOpacity,
    groundShadowOpacity: pres.groundShadowOpacity,
    productShadowOpacity: pres.productShadowOpacity,
    saturation: pres.saturation
  };
}

/** Default presentation fields for admin reset (excludes model paths). */
export function getModel3dPresentationDefaults() {
  const m = coalesceModel3dManifest({ modelPath: 'assets/dummy.glb', enabled: true });
  return {
    quality: m.quality,
    lightingPreset: m.lightingPreset,
    envPreset: m.envPreset,
    shadowPreset: m.shadowPreset,
    shadows: m.shadows,
    groundShadows: m.groundShadows,
    keyLightColor: m.keyLightColor,
    fillLightIntensity: m.fillLightIntensity,
    rimLightIntensity: m.rimLightIntensity,
    fillLightColor: m.fillLightColor,
    rimLightColor: m.rimLightColor,
    detailLevel: m.detailLevel,
    exposure: m.exposure,
    envIntensity: m.envIntensity,
    shadowOpacity: m.groundShadowOpacity,
    groundShadowOpacity: m.groundShadowOpacity,
    productShadowOpacity: m.productShadowOpacity,
    saturation: m.saturation,
    autoRotate: m.autoRotate,
    rotateSpeed: m.rotateSpeed,
    scale: m.scale,
    rotationY: m.rotationY
  };
}

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER);
    dracoLoader.setDecoderConfig({ type: 'js' });
  }
  return dracoLoader;
}

function getGltfLoader() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(getDracoLoader());
  }
  return gltfLoader;
}

export function applyStudioEnvironment(renderer, scene, manifest = null) {
  if (!renderer || !scene) return;
  const presentation = manifest ? resolvePresentation(manifest) : resolvePresentation({ quality: 'high', envPreset: 'room' });
  applyEnvironment(renderer, scene, presentation);
}

export function applyTextureQuality(material, maxAnisotropy) {
  const linearSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;
  const colorKeys = ['map', 'emissiveMap'];
  const linearKeys = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'displacementMap'];
  [...colorKeys, ...linearKeys].forEach((key) => {
    const tex = material[key];
    if (!tex || typeof tex !== 'object') return;
    tex.anisotropy = maxAnisotropy;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if ('colorSpace' in tex) {
      tex.colorSpace = colorKeys.includes(key) ? THREE.SRGBColorSpace : linearSpace;
    }
    tex.needsUpdate = true;
  });
}

export function enhanceSceneMaterials(object, options = {}) {
  const {
    maxAnisotropy = 8,
    format = 'glb',
    quality = 'high',
    edgeHighlight = false,
    envIntensity = null,
    productShadows = true
  } = options;
  const isLegacyObj = format === 'obj';
  const isHigh = quality === 'high';
  const envMul = Number.isFinite(envIntensity) ? envIntensity : (isHigh ? 1.35 : 1.05);
  const shadowOnMesh = !!productShadows;

  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = shadowOnMesh;
    child.receiveShadow = shadowOnMesh;
    if (child.geometry && isHigh) {
      child.geometry.computeVertexNormals();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      const materialName = String(material.name || '').toLowerCase();
      const hasMaps = !!(material.map || material.normalMap || material.roughnessMap || material.metalnessMap);
      material.side = THREE.FrontSide;
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        material.envMapIntensity = envMul;
        if (isHigh) {
          material.precision = 'highp';
          if ('clearcoat' in material && material.clearcoat > 0) material.clearcoatRoughness = Math.min(material.clearcoatRoughness || 0.2, 0.35);
        }
      }
      if (isLegacyObj && format === 'obj' && !hasMaps && material.color) {
        if (materialName.includes('metallic')) material.color.set('#c9d1cd');
        else if (materialName.includes('schwarz') || materialName.includes('glass')) material.color.set('#111827');
        else if (materialName === 'mat.2') material.color.set('#f8fafc');
        else if (materialName === 'mat.6') material.color.set('#202826');
        else if (material.color.r < 0.08 && material.color.g < 0.08 && material.color.b < 0.08) material.color.set('#27312f');
      }
      if ('emissive' in material && materialName.includes('glass')) material.emissive.set('#030712');
      if ('metalness' in material && isLegacyObj && !hasMaps) {
        material.metalness = materialName.includes('metallic') ? 0.78 : Math.max(Number(material.metalness || 0), 0.18);
      }
      if ('roughness' in material && isLegacyObj && !hasMaps) {
        material.roughness = materialName.includes('metallic') ? 0.24 : Math.min(Number(material.roughness || 0.55), 0.55);
      }
      applyTextureQuality(material, maxAnisotropy);
      material.needsUpdate = true;
    });
    if (!edgeHighlight || !child.geometry || child.userData.edgeHighlight) return;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(child.geometry, 40),
      new THREE.LineBasicMaterial({ color: 0xe7fff7, transparent: true, opacity: 0.12 })
    );
    edges.userData.edgeHighlight = true;
    child.add(edges);
  });
}

function resolveModelResourcePath(manifest, modelUrl) {
  const url = String(modelUrl || '');
  if (url.includes('/')) return url.slice(0, url.lastIndexOf('/') + 1);
  const modelPath = String(manifest?.modelPath || '').trim().replace(/^\/+/, '');
  if (modelPath.includes('/')) {
    const dir = modelPath.slice(0, modelPath.lastIndexOf('/') + 1);
    return `/${dir}`;
  }
  let resourceDir = String(manifest?.resourceDir || '').trim().replace(/^\/+/, '');
  if (resourceDir) return resourceDir.endsWith('/') ? `/${resourceDir}` : `/${resourceDir}/`;
  return '/';
}

function isAbsoluteAssetUrl(url) {
  const raw = String(url || '').trim();
  return /^(https?:|data:|blob:)/i.test(raw);
}

function shouldResolveRelativeAssetUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (isAbsoluteAssetUrl(raw)) return false;
  if (raw.startsWith('/')) return false;
  return true;
}

function createResourceUrlModifier(resourcePath) {
  return (url) => {
    if (isAbsoluteAssetUrl(url)) return url;
    return resolveTextureUrl(resourcePath, url);
  };
}

function normalizeMtlTextureReference(textureUrl) {
  let raw = decodeURIComponent(String(textureUrl || '').trim());
  if (!raw) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.includes('\\')) {
    raw = raw.split(/[/\\]/).pop() || raw;
  }
  return raw;
}

function resolveTextureUrl(resourcePath, textureUrl) {
  let raw = normalizeMtlTextureReference(textureUrl);
  if (!shouldResolveRelativeAssetUrl(raw)) return raw;
  const base = resourcePath.endsWith('/') ? resourcePath : `${resourcePath}/`;
  const joined = `${base}${raw.replace(/^\.?\//, '')}`;
  return joined.replace(/([^:]\/)\/+/g, '$1');
}

const MATERIAL_TEXTURE_KEYS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
  'alphaMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularMap',
  'specularColorMap', 'thicknessMap', 'transmissionMap'
];

export async function prepareSceneTextures(renderer, object) {
  if (!renderer || !object) return;
  const textures = new Set();
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = material[key];
        if (tex?.isTexture) textures.add(tex);
      });
    });
  });
  if (!textures.size) return;
  await Promise.all([...textures].map((tex) => whenTextureImageReady(tex)));
  if (typeof renderer.initTextureAsync === 'function') {
    await Promise.all([...textures].map((tex) => renderer.initTextureAsync(tex).catch(() => {})));
  } else if (typeof renderer.initTexture === 'function') {
    textures.forEach((tex) => {
      try { renderer.initTexture(tex); } catch { /* ignore */ }
    });
  }
}

async function discoverObjMaterialUrl(manifest, assetUrl) {
  const explicit = String(manifest?.materialPath || '').trim().replace(/^\/+/, '');
  if (explicit) return assetUrl(explicit);
  const modelPath = String(manifest?.modelPath || '').trim().replace(/^\/+/, '');
  if (!modelPath.toLowerCase().endsWith('.obj')) return '';
  const modelUrl = assetUrl(modelPath);
  try {
    const res = await fetch(modelUrl, { headers: { Range: 'bytes=0-131071' } });
    const head = await (res.ok ? res.text() : '');
    const match = head.match(/^\s*mtllib\s+(\S+)/im);
    if (!match) return '';
    const mtlFile = match[1].replace(/^\.\//, '');
    const base = modelUrl.includes('/') ? modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1) : '/';
    return `${base}${mtlFile}`;
  } catch {
    return '';
  }
}

function finalizeLoadedMaterials(object) {
  const linearSpace = THREE.LinearSRGBColorSpace ?? THREE.NoColorSpace;
  object.traverse((child) => {
    if (!child.isMesh) return;
    let materials = Array.isArray(child.material) ? child.material : [child.material];
    materials = materials.filter(Boolean).map((material) => {
      const hasMaps = !!(material.map || material.normalMap || material.alphaMap || material.bumpMap);
      const isLegacy = material.isMeshBasicMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial;
      if (isLegacy && hasMaps) {
        return new THREE.MeshStandardMaterial({
          map: material.map || null,
          normalMap: material.normalMap || null,
          alphaMap: material.alphaMap || null,
          bumpMap: material.bumpMap || null,
          color: material.color?.clone?.() || new THREE.Color(0xffffff),
          transparent: material.transparent,
          opacity: material.opacity,
          side: material.side,
          metalness: material.isMeshPhongMaterial ? 0.25 : 0.12,
          roughness: material.isMeshPhongMaterial ? 0.45 : 0.62
        });
      }
      if (material.isMeshBasicMaterial && !hasMaps) {
        return new THREE.MeshStandardMaterial({
          color: material.color?.clone?.() || new THREE.Color(0xffffff),
          transparent: material.transparent,
          opacity: material.opacity,
          side: material.side,
          metalness: 0.15,
          roughness: 0.65
        });
      }
      return material;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
    materials.forEach((material) => {
      const colorMaps = ['map', 'emissiveMap'];
      const linearMaps = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'displacementMap'];
      colorMaps.forEach((key) => {
        const tex = material[key];
        if (!tex) return;
        if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      });
      linearMaps.forEach((key) => {
        const tex = material[key];
        if (!tex || !('colorSpace' in tex)) return;
        tex.colorSpace = linearSpace;
        tex.needsUpdate = true;
      });
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        if (!Number.isFinite(material.envMapIntensity)) material.envMapIntensity = 1;
      }
      material.needsUpdate = true;
    });
  });
}

function createGltfLoader(resourcePath, manager, options = {}) {
  const loadingManager = manager || new THREE.LoadingManager();
  const useExternalResources = options.useExternalResources !== false;
  const loader = new GLTFLoader(loadingManager);
  loader.setDRACOLoader(getDracoLoader());
  loader.setCrossOrigin('anonymous');
  if (useExternalResources && resourcePath) {
    loadingManager.setURLModifier(createResourceUrlModifier(resourcePath));
    loader.setResourcePath(resourcePath);
  }
  return loader;
}

function whenTextureImageReady(texture) {
  const image = texture?.image;
  if (!image) return Promise.resolve();
  if (image.complete && (image.naturalWidth || image.width || image.byteLength)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => resolve();
    if (image.addEventListener) {
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    } else {
      resolve();
    }
  });
}

function warnResourceLoadIssue(url) {
  console.warn('3D-nevenbestand niet geladen (model blijft zichtbaar):', url);
}

function settleLoadedRoot(loaderFn, finalize, { deferFinish = false } = {}) {
  return new Promise((resolve, reject) => {
    let root = null;
    let settled = false;
    const finish = () => {
      if (settled || !root) return;
      settled = true;
      try {
        finalize(root);
        resolve(root);
      } catch (err) {
        reject(err);
      }
    };
    const manager = new THREE.LoadingManager(finish, undefined, warnResourceLoadIssue);
    loaderFn(manager, (loaded) => {
      root = loaded;
      if (!deferFinish) finish();
    }, reject);
  });
}

const loadedGltfSceneCache = new Map();
const loadingGltfScenePromises = new Map();

function cloneLoadedScene(root) {
  return root?.clone ? root.clone(true) : root;
}

async function fetchGltfScene(manifest, assetUrl) {
  const modelUrl = assetUrl(manifest.modelPath);
  const cached = loadedGltfSceneCache.get(modelUrl);
  if (cached) return cloneLoadedScene(cached);
  if (loadingGltfScenePromises.has(modelUrl)) {
    const shared = await loadingGltfScenePromises.get(modelUrl);
    return cloneLoadedScene(shared);
  }

  const modelPathLower = String(manifest.modelPath || '').trim().toLowerCase();
  const isBinaryGlb = modelPathLower.endsWith('.glb');
  const resourcePath = isBinaryGlb ? '' : resolveModelResourcePath(manifest, modelUrl);
  const label = manifest.modelPath.split('/').pop() || 'model';

  const loadPromise = new Promise((resolve, reject) => {
    let gltfScene = null;
    const manager = new THREE.LoadingManager(
      () => {
        if (!gltfScene) return;
        try {
          finalizeLoadedMaterials(gltfScene);
          loadedGltfSceneCache.set(modelUrl, gltfScene);
          resolve(gltfScene);
        } catch (err) {
          reject(err);
        }
      },
      undefined,
      warnResourceLoadIssue
    );
    const loader = createGltfLoader(resourcePath, manager, {
      useExternalResources: !isBinaryGlb || !!resourcePath
    });
    loader.load(
      modelUrl,
      (gltf) => { gltfScene = gltf.scene; },
      undefined,
      (err) => reject(new Error(err?.message || `Kon GLB/GLTF niet laden (${label})`))
    );
  }).finally(() => {
    loadingGltfScenePromises.delete(modelUrl);
  });

  loadingGltfScenePromises.set(modelUrl, loadPromise);
  const shared = await loadPromise;
  return cloneLoadedScene(shared);
}

async function loadGltf(manifest, assetUrl) {
  return fetchGltfScene(manifest, assetUrl);
}

async function loadObj(manifest, assetUrl) {
  const modelUrl = assetUrl(manifest.modelPath);
  const materialUrl = await discoverObjMaterialUrl(manifest, assetUrl);
  const mtlBase = materialUrl
    ? materialUrl.slice(0, materialUrl.lastIndexOf('/') + 1)
    : resolveModelResourcePath(manifest, modelUrl);

  return settleLoadedRoot(
    (manager, onLoaded, onError) => {
      manager.setURLModifier(createResourceUrlModifier(mtlBase));
      const objLoader = new OBJLoader(manager);
      const loadObjMesh = () => {
        objLoader.load(modelUrl, onLoaded, undefined, onError);
      };
      if (materialUrl) {
        const materialName = materialUrl.slice(materialUrl.lastIndexOf('/') + 1);
        const mtlLoader = new MTLLoader(manager);
        mtlLoader.setResourcePath(mtlBase);
        mtlLoader.setPath(mtlBase);
        mtlLoader.setCrossOrigin('anonymous');
        mtlLoader.load(
          materialName,
          (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            loadObjMesh();
          },
          undefined,
          (err) => onError(err || new Error(`MTL niet gevonden: ${materialName}`))
        );
      } else {
        loadObjMesh();
      }
    },
    (object) => finalizeLoadedMaterials(object),
    { deferFinish: !!materialUrl }
  );
}

async function loadStl(manifest, assetUrl) {
  const geometry = await new Promise((resolve, reject) => {
    new STLLoader().load(assetUrl(manifest.modelPath), resolve, undefined, reject);
  });
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb8c5c0,
    metalness: 0.42,
    roughness: 0.38
  });
  return new THREE.Mesh(geometry, material);
}

async function loadFbx(manifest, assetUrl) {
  const modelUrl = assetUrl(manifest.modelPath);
  const resourcePath = resolveModelResourcePath(manifest, modelUrl);
  return settleLoadedRoot(
    (manager, onLoaded, onError) => {
      manager.setURLModifier(createResourceUrlModifier(resourcePath));
      const loader = new FBXLoader(manager);
      loader.setResourcePath(resourcePath);
      loader.setCrossOrigin('anonymous');
      loader.load(modelUrl, onLoaded, undefined, onError);
    },
    (object) => finalizeLoadedMaterials(object),
    { deferFinish: true }
  );
}

export async function loadModelScene(manifest, assetUrl) {
  const format = inferModelFormat(manifest);
  if (format === 'obj') return loadObj(manifest, assetUrl);
  if (format === 'stl') return loadStl(manifest, assetUrl);
  if (format === 'fbx') return loadFbx(manifest, assetUrl);
  return loadGltf(manifest, assetUrl);
}

export function normalizeModelObject(object, manifest, options = {}) {
  const format = inferModelFormat(manifest);
  const quality = modelQuality(manifest);
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxAxis) || maxAxis < 1e-6) {
    throw new Error('3D-model bevat geen zichtbare geometrie');
  }
  object.position.sub(center);
  const pres = resolvePresentation(manifest);
  enhanceSceneMaterials(object, {
    maxAnisotropy: options.maxAnisotropy ?? 8,
    format,
    quality,
    envIntensity: pres.envIntensity,
    productShadows: pres.productShadows,
    edgeHighlight: options.edgeHighlight ?? format === 'obj'
  });
  return { maxAxis };
}

/** Normalized pivot scale for a loaded mesh (manifest.scale = 1). */
export function computeBaseDisplayPivotScale(innerObject) {
  if (!innerObject) return 1;
  const box = new THREE.Box3().setFromObject(innerObject);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  return 3.2 / Math.max(0.001, maxAxis);
}

/**
 * Hero “Grootte in shop”: fit camera on base size, then apply user scale on the pivot
 * so the model actually grows in frame (not cancelled by auto-zoom on the larger bounds).
 */
export function fitPerspectiveCameraToHeroDisplay(camera, displayModel, options = {}) {
  if (!camera || !displayModel) return;
  const userScale = Math.max(0.01, Number(options.userScale) || 1);
  const pivot = displayModel;
  const inner = pivot.children?.[0];
  const baseScale = inner ? computeBaseDisplayPivotScale(inner) : (pivot.scale?.x ?? 1);
  pivot.scale.setScalar(baseScale);
  pivot.updateMatrixWorld(true);
  fitPerspectiveCameraToModel(camera, pivot, {
    margin: Number(options.margin) > 0 ? Number(options.margin) : 1.2,
    yLift: Number(options.yLift) >= 0 ? Number(options.yLift) : 0.02
  });
  pivot.scale.setScalar(baseScale * userScale);
  pivot.updateMatrixWorld(true);
}

/** Approximate view fraction (0–1) covered by the model axis-aligned bounds in NDC. */
export function estimateModelScreenExtents(camera, displayModel) {
  if (!camera || !displayModel) {
    return { fillW: 0, fillH: 0, area: 0, maxAxis: 0 };
  }
  displayModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(displayModel);
  if (box.isEmpty()) {
    return { fillW: 0, fillH: 0, area: 0, maxAxis: 0 };
  }
  const { min, max } = box;
  let minX = 1;
  let maxX = -1;
  let minY = 1;
  let maxY = -1;
  const corner = new THREE.Vector3();
  for (let xi = 0; xi < 2; xi += 1) {
    for (let yi = 0; yi < 2; yi += 1) {
      for (let zi = 0; zi < 2; zi += 1) {
        corner.set(
          xi ? max.x : min.x,
          yi ? max.y : min.y,
          zi ? max.z : min.z
        ).project(camera);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
      }
    }
  }
  const fillW = Math.max(0, (maxX - minX) * 0.5);
  const fillH = Math.max(0, (maxY - minY) * 0.5);
  const area = Math.min(1, fillW * fillH);
  return {
    fillW,
    fillH,
    area,
    maxAxis: Math.min(1, Math.max(fillW, fillH))
  };
}

export function estimateModelScreenFill(camera, displayModel) {
  return estimateModelScreenExtents(camera, displayModel).area;
}

/** Frame displayModel in a perspective camera (landscape + tall models). */
export function fitPerspectiveCameraToModel(camera, displayModel, options = {}) {
  if (!camera || !displayModel) return;
  const margin = Number(options.margin) > 0 ? Number(options.margin) : 1.12;
  const yLift = Number(options.yLift) >= 0 ? Number(options.yLift) : 0.02;
  displayModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(displayModel);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  box.getCenter(center);
  box.getSize(size);
  box.getBoundingSphere(sphere);
  const halfX = size.x * 0.5;
  const halfY = size.y * 0.5;
  const halfZ = size.z * 0.5;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(0.25, camera.aspect || 1);
  const tanHalfV = Math.tan(fovRad / 2);
  const tanHalfH = Math.tan(Math.atan(tanHalfV * aspect));
  const distV = (halfY / tanHalfV) * margin;
  const distH = (halfX / tanHalfH) * margin;
  const distZ = ((halfZ * 0.85) + (halfX * 0.15)) * margin;
  const distSphere = ((sphere.radius || 0) / tanHalfV) * margin;
  const distance = Math.max(distV, distH, distZ, distSphere, 0.08);
  const lift = Math.max(halfY, sphere.radius || 0) * yLift;
  camera.position.set(center.x, center.y + lift, center.z + distance);
  camera.lookAt(center);
  camera.near = Math.max(0.01, distance / 200);
  camera.far = Math.max(camera.near + 10, distance * 24);
  camera.updateProjectionMatrix();
}

export function computeDisplayPivotScale(innerObject, manifest) {
  const userScale = Math.max(0.01, Number(manifest?.scale || 1));
  return computeBaseDisplayPivotScale(innerObject) * userScale;
}

export function applyManifestToDisplayPivot(pivot, manifest) {
  if (!pivot?.children?.length) return;
  pivot.scale.setScalar(computeDisplayPivotScale(pivot.children[0], manifest));
  pivot.rotation.set(
    THREE.MathUtils.degToRad(Number(manifest.rotationX || 0)),
    THREE.MathUtils.degToRad(Number(manifest.rotationY || 0)),
    THREE.MathUtils.degToRad(Number(manifest.rotationZ || 0))
  );
}

export function wrapModelForDisplay(object, manifest, options = {}) {
  const normalized = normalizeModelObject(object, manifest, options);
  const pivot = new THREE.Group();
  pivot.add(object);
  applyManifestToDisplayPivot(pivot, manifest);
  return pivot;
}
