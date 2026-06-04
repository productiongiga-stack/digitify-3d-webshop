/**
 * Shared 3D presentation: lighting rigs, environment presets, contact shadows, renderer tuning.
 */
import * as THREE from 'https://esm.sh/three@0.170.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';
import { modelQuality } from './model3d-shared.js';

export { modelQuality };

export const LIGHTING_PRESETS = ['studio', 'soft', 'dramatic'];
export const ENV_PRESETS = ['room', 'neutral', 'warm', 'cool', 'none'];
export const SHADOW_PRESETS = ['none', 'soft', 'natural', 'studio'];

export const SHADOW_PRESET_LABELS = {
  none: 'Geen',
  soft: 'Zacht',
  natural: 'Natuurlijk',
  studio: 'Studio'
};

export const DETAIL_LEVELS = ['auto', 'low', 'medium', 'high'];

const SHADOW_PRESET_CONFIG = {
  none: { productShadows: false, contactSoft: false, groundCast: false, opacityBase: 0.38, footprintMul: 0.58, softMul: 0.72, shadowRadius: 3, shadowMapSize: 2048 },
  soft: { productShadows: false, contactSoft: true, groundCast: false, opacityBase: 0.38, footprintMul: 0.58, softMul: 0.72, shadowRadius: 3, shadowMapSize: 2048 },
  natural: { productShadows: true, contactSoft: true, groundCast: true, opacityBase: 0.42, footprintMul: 0.62, softMul: 0.5, shadowRadius: 5, shadowMapSize: 2048 },
  studio: { productShadows: true, contactSoft: true, groundCast: true, opacityBase: 0.48, footprintMul: 0.66, softMul: 0.55, shadowRadius: 6, shadowMapSize: 4096 }
};

const envCache = new Map();
const shadowCircleGeometry = new THREE.CircleGeometry(1, 64);
let softContactShadowTexture = null;

function getSoftContactShadowTexture() {
  if (softContactShadowTexture) return softContactShadowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.42, 'rgba(0,0,0,0.28)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softContactShadowTexture = new THREE.CanvasTexture(canvas);
  softContactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  return softContactShadowTexture;
}

function makeGroundShadowCircle(material) {
  const mesh = new THREE.Mesh(shadowCircleGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function deriveShadowPreset(manifest) {
  const raw = String(manifest?.shadowPreset || '').trim().toLowerCase();
  if (SHADOW_PRESETS.includes(raw)) return raw;
  if (manifest?.shadows === false) return 'none';
  if (manifest?.shadows === true) return 'natural';
  return 'natural';
}

const LIGHTING_CONFIG = {
  studio: {
    hemi: { sky: 0xffffff, ground: 0xe2e8f0, intensity: 1.85 },
    key: { color: 0xffffff, intensity: 2.85, pos: [4, 5, 6] },
    fill: { color: 0xf8fafc, intensity: 1.35, pos: [-5, 2, 4] },
    rim: { color: 0x99f6e4, intensity: 1.15, pos: [-3, 3, -5] }
  },
  soft: {
    hemi: { sky: 0xfffaf5, ground: 0xe8eef4, intensity: 1.55 },
    key: { color: 0xffffff, intensity: 2.1, pos: [3, 4.5, 5] },
    fill: { color: 0xf1f5f9, intensity: 1.65, pos: [-4, 1.5, 3] },
    rim: { color: 0xcffafe, intensity: 0.75, pos: [-2, 2, -4] }
  },
  dramatic: {
    hemi: { sky: 0xf8fafc, ground: 0x1e293b, intensity: 1.2 },
    key: { color: 0xffffff, intensity: 3.4, pos: [5, 6, 4] },
    fill: { color: 0x94a3b8, intensity: 0.55, pos: [-6, 1, 2] },
    rim: { color: 0x5eead4, intensity: 1.45, pos: [-4, 4, -6] }
  }
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** #rrggbb or rrggbb → number; invalid/empty → null (use preset). */
export function parseKeyLightColor(raw) {
  if (raw == null || raw === '') return null;
  const match = String(raw).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  return parseInt(match[1], 16);
}

export function formatKeyLightColorHex(value) {
  const n = typeof value === 'number' ? value : parseKeyLightColor(value);
  if (!Number.isFinite(n)) return '';
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function defaultKeyLightColorForPreset(lightingPreset) {
  const cfg = LIGHTING_CONFIG[lightingPreset] || LIGHTING_CONFIG.studio;
  return cfg.key.color;
}

export function defaultFillLightColorForPreset(lightingPreset) {
  const cfg = LIGHTING_CONFIG[lightingPreset] || LIGHTING_CONFIG.studio;
  return cfg.fill.color;
}

export function defaultRimLightColorForPreset(lightingPreset) {
  const cfg = LIGHTING_CONFIG[lightingPreset] || LIGHTING_CONFIG.studio;
  return cfg.rim.color;
}

function normalizePreset(raw, allowed, fallback) {
  const v = String(raw || '').trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

function resolveDetailCaps(manifest, context, isHigh, shadowCfg) {
  const detailLevel = normalizePreset(manifest?.detailLevel, DETAIL_LEVELS, 'auto');
  if (context === 'mini') {
    return { detailLevel, pixelRatioCap: 2, shadowMapSize: 512 };
  }
  if (detailLevel === 'low') {
    return {
      detailLevel,
      pixelRatioCap: 1,
      shadowMapSize: Math.min(shadowCfg.shadowMapSize, 1024)
    };
  }
  if (detailLevel === 'medium') {
    return {
      detailLevel,
      pixelRatioCap: 2,
      shadowMapSize: Math.min(shadowCfg.shadowMapSize, 2048)
    };
  }
  if (detailLevel === 'high') {
    return {
      detailLevel,
      pixelRatioCap: 3,
      shadowMapSize: Math.min(shadowCfg.shadowMapSize, 4096)
    };
  }
  return {
    detailLevel,
    pixelRatioCap: isHigh ? 3 : 2,
    shadowMapSize: shadowCfg.shadowMapSize
  };
}

function resolveLightIntensities(manifest, cfg) {
  const fillMulRaw = Number(manifest?.fillLightIntensity);
  const rimMulRaw = Number(manifest?.rimLightIntensity);
  const fillMul = Number.isFinite(fillMulRaw) ? clamp(fillMulRaw, 0.5, 2) : 1;
  const rimMul = Number.isFinite(rimMulRaw) ? clamp(rimMulRaw, 0.5, 2) : 1;
  return {
    fillLightIntensity: fillMul,
    rimLightIntensity: rimMul,
    fillIntensity: cfg.fill.intensity * fillMul,
    rimIntensity: cfg.rim.intensity * rimMul,
    fillColor: parseKeyLightColor(manifest?.fillLightColor) ?? cfg.fill.color,
    rimColor: parseKeyLightColor(manifest?.rimLightColor) ?? cfg.rim.color
  };
}

/** Resolved presentation options from product.model3d */
export function resolvePresentation(manifest, context = 'hero') {
  const quality = modelQuality(manifest);
  const isHigh = quality === 'high';
  const lightingPreset = normalizePreset(manifest?.lightingPreset, LIGHTING_PRESETS, 'studio');
  let envPreset = normalizePreset(manifest?.envPreset, ENV_PRESETS, 'room');
  if (!isHigh) envPreset = 'none';

  const exposureRaw = Number(manifest?.exposure);
  const envIntensityRaw = Number(manifest?.envIntensity);
  const saturationRaw = Number(manifest?.saturation);
  const shadowOpacityRaw = Number(manifest?.shadowOpacity);
  const groundShadowOpacityRaw = Number(manifest?.groundShadowOpacity);
  const productShadowOpacityRaw = Number(manifest?.productShadowOpacity);
  const legacyOpacity = Number.isFinite(shadowOpacityRaw) ? shadowOpacityRaw : null;

  let shadowPreset = deriveShadowPreset(manifest);
  if (!isHigh || context === 'mini') shadowPreset = 'none';
  const shadowCfg = SHADOW_PRESET_CONFIG[shadowPreset] || SHADOW_PRESET_CONFIG.natural;
  const opacityBase = shadowCfg.opacityBase;
  const clampShadow = (raw) => clamp(Number.isFinite(raw) ? raw : opacityBase, 0.12, 0.85);
  const groundShadowOpacity = shadowPreset === 'none'
    ? 0
    : clampShadow(Number.isFinite(groundShadowOpacityRaw) ? groundShadowOpacityRaw : legacyOpacity);
  const productShadowOpacity = shadowPreset === 'none' || !shadowCfg.productShadows
    ? 0
    : clampShadow(Number.isFinite(productShadowOpacityRaw) ? productShadowOpacityRaw : legacyOpacity);
  const shadowOpacity = groundShadowOpacity;

  const groundShadows = shadowPreset !== 'none' && manifest?.groundShadows !== false;
  const productShadows = shadowPreset !== 'none' && !!shadowCfg.productShadows;
  const keyLightColor = parseKeyLightColor(manifest?.keyLightColor);
  const cfg = LIGHTING_CONFIG[lightingPreset] || LIGHTING_CONFIG.studio;
  const lights = resolveLightIntensities(manifest, cfg);
  const detail = resolveDetailCaps(manifest, context, isHigh, shadowCfg);

  return {
    quality,
    isHigh,
    lightingPreset,
    envPreset,
    keyLightColor,
    fillLightColor: parseKeyLightColor(manifest?.fillLightColor),
    rimLightColor: parseKeyLightColor(manifest?.rimLightColor),
    fillLightIntensity: lights.fillLightIntensity,
    rimLightIntensity: lights.rimLightIntensity,
    fillIntensity: lights.fillIntensity,
    rimIntensity: lights.rimIntensity,
    fillColor: lights.fillColor,
    rimColor: lights.rimColor,
    detailLevel: detail.detailLevel,
    exposure: Number.isFinite(exposureRaw) ? clamp(exposureRaw, 0.65, 1.65) : (isHigh ? 1.08 : 1),
    envIntensity: Number.isFinite(envIntensityRaw) ? clamp(envIntensityRaw, 0.5, 2.5) : (isHigh ? 1.35 : 1.05),
    shadowPreset,
    shadows: shadowPreset !== 'none',
    groundShadows,
    productShadows,
    contactSoft: !!shadowCfg.contactSoft && groundShadows,
    groundCast: !!shadowCfg.groundCast && groundShadows,
    shadowFootprintMul: shadowCfg.footprintMul,
    shadowSoftMul: shadowCfg.softMul,
    shadowRadius: shadowCfg.shadowRadius,
    shadowMapSize: detail.shadowMapSize,
    pixelRatioCap: detail.pixelRatioCap,
    shadowOpacity,
    groundShadowOpacity,
    productShadowOpacity,
    saturation: Number.isFinite(saturationRaw) ? clamp(saturationRaw, 0.5, 1.5) : 1
  };
}

function buildEnvSourceScene(preset) {
  if (preset === 'warm') {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x9a7b4f, 2.2));
    const key = new THREE.DirectionalLight(0xffe4bc, 1.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    return scene;
  }
  if (preset === 'cool') {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x334155, 2));
    const key = new THREE.DirectionalLight(0xdbeafe, 1.2);
    key.position.set(4, 5, 3);
    scene.add(key);
    return scene;
  }
  if (preset === 'neutral') {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 4, 5);
    scene.add(key);
    return scene;
  }
  return new RoomEnvironment();
}

export function applyEnvironment(renderer, scene, presentation) {
  if (!renderer || !scene || !presentation) return;
  const preset = presentation.envPreset;
  if (preset === 'none' || !presentation.isHigh) {
    scene.environment = null;
    return;
  }
  if (envCache.has(preset)) {
    scene.environment = envCache.get(preset);
    return;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const source = buildEnvSourceScene(preset);
  const texture = pmrem.fromScene(source, 0.04).texture;
  pmrem.dispose();
  envCache.set(preset, texture);
  scene.environment = texture;
}

export function configureRendererPresentation(renderer, presentation) {
  if (!renderer || !presentation) return;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = presentation.exposure;
  renderer.shadowMap.enabled = !!presentation.productShadows;
  if (presentation.productShadows) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
}

function supportsShadowIntensity(light) {
  return !!light?.shadow && typeof light.shadow.intensity === 'number';
}

/** 0–1 strength from productShadowOpacity (0.12–0.85). */
function productShadowStrengthT(presentation) {
  const op = presentation?.productShadowOpacity ?? 0.42;
  return clamp((op - 0.12) / 0.73, 0, 1);
}

/** Fallback for Three.js < r166: deepen mesh shading via less fill/hemi lift. */
function applyLegacyProductShadowLift(lighting, presentation) {
  if (!lighting || !presentation?.productShadows || supportsShadowIntensity(lighting.keyLight)) return;
  const cfg = LIGHTING_CONFIG[presentation.lightingPreset] || LIGHTING_CONFIG.studio;
  const t = productShadowStrengthT(presentation);
  if (lighting.hemi) lighting.hemi.intensity = cfg.hemi.intensity * (1.14 - t * 0.36);
  if (lighting.fill) lighting.fill.intensity = presentation.fillIntensity * (1.28 - t * 0.72);
}

function configureShadowLight(light, presentation, lighting = null) {
  if (!light || !presentation.productShadows) return;
  light.castShadow = true;
  const size = presentation.shadowMapSize;
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 40;
  const extent = 5;
  light.shadow.camera.left = -extent;
  light.shadow.camera.right = extent;
  light.shadow.camera.top = extent;
  light.shadow.camera.bottom = -extent;
  light.shadow.bias = -0.00015;
  light.shadow.normalBias = 0.012;
  light.shadow.radius = presentation.shadowRadius || 5;
  if (supportsShadowIntensity(light)) {
    light.shadow.intensity = presentation.productShadowOpacity ?? 1;
    light.shadow.needsUpdate = true;
  }
  light.shadow.camera.updateProjectionMatrix();
}

export function applyGroundShadowMaterials(shadowState, presentation) {
  if (!shadowState || !presentation) return;
  const groundOp = presentation.groundShadowOpacity ?? presentation.shadowOpacity ?? 0.42;
  const softMul = presentation.shadowSoftMul || 0.72;
  if (shadowState.softPlane?.material) {
    shadowState.softPlane.material.opacity = groundOp * softMul;
  }
  if (shadowState.plane?.material) {
    shadowState.plane.material.opacity = groundOp;
  }
}

function fitShadowCameraToModel(keyLight, box) {
  if (!keyLight?.shadow?.camera || !box || box.isEmpty()) return;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const footprint = Math.max(size.x, size.z);
  const extent = Math.max(2.2, footprint * 0.72 + size.y * 0.14);
  const cam = keyLight.shadow.camera;
  cam.left = -extent;
  cam.right = extent;
  cam.top = extent;
  cam.bottom = -extent;
  cam.near = 0.08;
  cam.far = Math.max(18, size.y * 3 + extent * 1.8);
  cam.updateProjectionMatrix();
  keyLight.target.position.copy(center);
  keyLight.target.updateMatrixWorld();
  keyLight.shadow.needsUpdate = true;
}

export function applyKeyLightColor(keyLight, presentation) {
  if (!keyLight || !presentation) return;
  const fallback = defaultKeyLightColorForPreset(presentation.lightingPreset);
  keyLight.color.set(presentation.keyLightColor ?? fallback);
}

export function applyFillRimLights(lighting, presentation) {
  if (!lighting || !presentation) return;
  const cfg = LIGHTING_CONFIG[presentation.lightingPreset] || LIGHTING_CONFIG.studio;
  const t = productShadowStrengthT(presentation);
  const legacyLift = presentation.productShadows && !supportsShadowIntensity(lighting.keyLight);
  if (lighting.hemi) {
    lighting.hemi.intensity = legacyLift
      ? cfg.hemi.intensity * (1.14 - t * 0.36)
      : cfg.hemi.intensity;
  }
  if (lighting.fill) {
    lighting.fill.color.set(presentation.fillColor);
    lighting.fill.intensity = legacyLift
      ? presentation.fillIntensity * (1.28 - t * 0.72)
      : presentation.fillIntensity;
  }
  if (lighting.rim) {
    lighting.rim.color.set(presentation.rimColor);
    lighting.rim.intensity = presentation.rimIntensity;
  }
}

export function attachLightingRig(scene, presentation) {
  const cfg = LIGHTING_CONFIG[presentation.lightingPreset] || LIGHTING_CONFIG.studio;
  const group = new THREE.Group();
  group.name = 'presentationLighting';

  const hemi = new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity);
  group.add(hemi);

  const keyColor = presentation.keyLightColor ?? cfg.key.color;
  const key = new THREE.DirectionalLight(keyColor, cfg.key.intensity);
  key.position.set(...cfg.key.pos);
  key.target = new THREE.Object3D();
  group.add(key.target);
  const rig = { group, keyLight: key, hemi, fill: null, rim: null };
  if (presentation.productShadows) configureShadowLight(key, presentation, rig);
  else key.castShadow = false;
  group.add(key);

  const fill = new THREE.DirectionalLight(presentation.fillColor, presentation.fillIntensity);
  fill.position.set(...cfg.fill.pos);
  group.add(fill);

  const rim = new THREE.DirectionalLight(presentation.rimColor, presentation.rimIntensity);
  rim.position.set(...cfg.rim.pos);
  group.add(rim);
  rig.fill = fill;
  rig.rim = rim;
  applyLegacyProductShadowLift(rig, presentation);

  scene.add(group);
  return rig;
}

/** Live-update reflectie/glans (env + zichtbare specular op matte PBR). */
export function applyMaterialEnvIntensity(displayModel, presentation) {
  if (!displayModel || !presentation) return;
  const mul = clamp(Number(presentation.envIntensity), 0.5, 2.5);
  if (!Number.isFinite(mul)) return;
  const gloss = (mul - 0.5) / 2;
  displayModel.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return;
      if (!material.userData._nebReflectBase) {
        material.userData._nebReflectBase = {
          envMapIntensity: Number(material.envMapIntensity) || 1,
          metalness: Number(material.metalness) || 0,
          roughness: Number(material.roughness) ?? 0.5
        };
      }
      const base = material.userData._nebReflectBase;
      material.envMapIntensity = mul;
      material.roughness = clamp(base.roughness * (1.14 - gloss * 0.48), 0.1, 1);
      material.metalness = clamp(base.metalness + gloss * 0.22 - (1 - gloss) * 0.04, 0, 0.82);
      material.needsUpdate = true;
    });
  });
}

const NEB_SAT_FRAGMENT_HOOK = `#include <color_fragment>
{
  float nebLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(vec3(nebLuma), diffuseColor.rgb, uNebSaturation);
}`;

function installMaterialSaturationShader(material) {
  if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return false;
  if (material.userData._nebSatShaderReady) return true;

  if (!material.userData._nebSatUniform) {
    material.userData._nebSatUniform = { value: 1 };
  }
  const prevOnBeforeCompile = material.onBeforeCompile;
  const prevCacheKey = material.customProgramCacheKey;

  material.onBeforeCompile = (shader) => {
    prevOnBeforeCompile?.call(material, shader);
    shader.uniforms.uNebSaturation = material.userData._nebSatUniform;
    if (!shader.fragmentShader.includes('uNebSaturation')) {
      shader.fragmentShader = `uniform float uNebSaturation;\n${shader.fragmentShader}`;
    }
    if (!shader.fragmentShader.includes('nebLuma')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        NEB_SAT_FRAGMENT_HOOK
      );
    }
  };

  material.customProgramCacheKey = () => {
    const base = typeof prevCacheKey === 'function' ? prevCacheKey.call(material) : '';
    return `${base}|nebSat`;
  };

  material.userData._nebSatShaderReady = true;
  material.needsUpdate = true;
  return true;
}

function applySaturationToColorMaterial(material, satMul) {
  if (!material.color?.getHSL) return;
  const hsl = { h: 0, s: 0, l: 0 };
  if (!material.userData._nebSatBase) {
    material.userData._nebSatBase = material.color.clone();
  }
  const base = material.userData._nebSatBase;
  base.getHSL(hsl);
  const nextS = clamp(hsl.s * satMul, 0, 1);
  if (Math.abs(satMul - 1) < 0.0005) {
    material.color.copy(base);
  } else {
    material.color.setHSL(hsl.h, nextS, hsl.l);
  }
  material.needsUpdate = true;
}

/** Saturation on diffuse (incl. textures) via shader; fallback to tint color on simple materials. */
export function applyMaterialSaturation(displayModel, presentation) {
  if (!displayModel || !presentation) return;
  const satMul = clamp(Number(presentation.saturation), 0.5, 1.5);
  if (!Number.isFinite(satMul)) return;

  displayModel.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (installMaterialSaturationShader(material)) {
        material.userData._nebSatUniform.value = satMul;
        return;
      }
      applySaturationToColorMaterial(material, satMul);
    });
  });
}

export function applyMaterialPresentationTweaks(displayModel, presentation) {
  applyMaterialEnvIntensity(displayModel, presentation);
  applyMaterialSaturation(displayModel, presentation);
}

export function updateContactShadowPlane(shadowState, displayModel) {
  if (!shadowState || !displayModel) return;
  if (!shadowState.plane && !shadowState.softPlane) return;
  const presentation = shadowState.presentation;
  if (!presentation) return;
  displayModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(displayModel);
  if (!Number.isFinite(box.min.y)) return;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const footprint = Math.max(size.x, size.z);
  const mul = presentation.shadowFootprintMul || 0.62;
  const radius = Math.max(0.4, footprint * mul);
  const groundY = box.min.y - 0.003;
  if (shadowState.plane) {
    shadowState.plane.scale.set(radius, radius, 1);
    shadowState.plane.position.set(center.x, groundY, center.z);
  }
  if (shadowState.softPlane) {
    const softScale = radius * 1.12;
    shadowState.softPlane.scale.set(softScale, softScale, 1);
    shadowState.softPlane.position.set(center.x, groundY + 0.001, center.z);
  }
  if (shadowState.keyLight && presentation.productShadows) {
    fitShadowCameraToModel(shadowState.keyLight, box);
  }
}

export function attachContactShadow(scene, displayModel, keyLight, presentation) {
  if (!presentation?.shadows && !presentation?.productShadows) return null;
  const group = new THREE.Group();
  group.name = 'presentationShadow';
  let softPlane = null;
  let plane = null;
  if (presentation.contactSoft) {
    softPlane = makeGroundShadowCircle(new THREE.MeshBasicMaterial({
      map: getSoftContactShadowTexture(),
      transparent: true,
      opacity: (presentation.groundShadowOpacity ?? presentation.shadowOpacity) * (presentation.shadowSoftMul || 0.72),
      depthWrite: false,
      toneMapped: false
    }));
    softPlane.renderOrder = -2;
    group.add(softPlane);
  }
  if (presentation.groundCast) {
    plane = makeGroundShadowCircle(new THREE.ShadowMaterial({
      opacity: presentation.groundShadowOpacity ?? presentation.shadowOpacity,
      transparent: true,
      color: 0x000000
    }));
    plane.receiveShadow = true;
    plane.renderOrder = -1;
    group.add(plane);
  }
  if (!softPlane && !plane) {
    if (!presentation.productShadows) return null;
    return { group: null, plane: null, softPlane: null, keyLight, presentation };
  }
  scene.add(group);
  const state = { group, plane, softPlane, keyLight, presentation };
  updateContactShadowPlane(state, displayModel);
  return state;
}

export function disposePresentationState(scene, state) {
  if (!state) return;
  if (state.lighting?.group) {
    scene.remove(state.lighting.group);
    state.lighting.group.traverse((obj) => {
      if (obj.isLight) obj.dispose?.();
    });
  }
  if (state.shadow?.group) {
    scene.remove(state.shadow.group);
    state.shadow.plane?.material?.dispose?.();
    state.shadow.softPlane?.material?.dispose?.();
  } else if (state.shadow) {
    state.shadow.plane?.material?.dispose?.();
    state.shadow.softPlane?.material?.dispose?.();
  }
  state.lighting = null;
  state.shadow = null;
}

/**
 * Apply full presentation stack to a scene. Returns mutable state for updates/dispose.
 */
export function applyModel3dPresentation({
  renderer,
  scene,
  manifest,
  displayModel = null,
  context = 'hero',
  state = null
}) {
  const presentation = resolvePresentation(manifest, context);
  disposePresentationState(scene, state || {});

  configureRendererPresentation(renderer, presentation);
  applyEnvironment(renderer, scene, presentation);

  const lighting = attachLightingRig(scene, presentation);
  let shadow = null;
  if (displayModel && (presentation.shadows || presentation.productShadows)) {
    shadow = attachContactShadow(scene, displayModel, lighting.keyLight, presentation);
  }

  if (displayModel) applyMaterialPresentationTweaks(displayModel, presentation);

  const nextState = {
    presentation,
    lighting,
    shadow,
    context
  };
  return nextState;
}

export function refreshPresentationForModel(renderer, scene, state, displayModel, manifest) {
  if (!state) return applyModel3dPresentation({ renderer, scene, manifest, displayModel, context: 'hero' });
  const presentation = resolvePresentation(manifest, state.context || 'hero');
  const prev = state.presentation;
  const rigChanged = prev?.quality !== presentation.quality
    || prev?.isHigh !== presentation.isHigh
    || prev?.lightingPreset !== presentation.lightingPreset
    || prev?.envPreset !== presentation.envPreset
    || prev?.shadows !== presentation.shadows
    || prev?.shadowPreset !== presentation.shadowPreset
    || prev?.productShadows !== presentation.productShadows
    || prev?.groundShadows !== presentation.groundShadows
    || prev?.contactSoft !== presentation.contactSoft
    || prev?.groundCast !== presentation.groundCast
    || prev?.detailLevel !== presentation.detailLevel
    || prev?.shadowMapSize !== presentation.shadowMapSize
    || prev?.pixelRatioCap !== presentation.pixelRatioCap;
  const tweakChanged = prev && (
    prev.exposure !== presentation.exposure
    || prev.envIntensity !== presentation.envIntensity
    || prev.shadowOpacity !== presentation.shadowOpacity
    || prev.groundShadowOpacity !== presentation.groundShadowOpacity
    || prev.productShadowOpacity !== presentation.productShadowOpacity
    || prev.saturation !== presentation.saturation
    || prev.keyLightColor !== presentation.keyLightColor
    || prev.fillLightColor !== presentation.fillLightColor
    || prev.rimLightColor !== presentation.rimLightColor
    || prev.fillLightIntensity !== presentation.fillLightIntensity
    || prev.rimLightIntensity !== presentation.rimLightIntensity
    || prev.fillIntensity !== presentation.fillIntensity
    || prev.rimIntensity !== presentation.rimIntensity
  );

  if (rigChanged) {
    return applyModel3dPresentation({
      renderer,
      scene,
      manifest,
      displayModel,
      context: state.context,
      state
    });
  }

  if (!tweakChanged) return state;

  configureRendererPresentation(renderer, presentation);
  if (prev?.envPreset !== presentation.envPreset) {
    applyEnvironment(renderer, scene, presentation);
  }
  if (state.lighting?.keyLight) {
    if (prev?.keyLightColor !== presentation.keyLightColor) {
      applyKeyLightColor(state.lighting.keyLight, presentation);
    }
    if (
      prev?.productShadowOpacity !== presentation.productShadowOpacity
      || prev?.shadowRadius !== presentation.shadowRadius
      || prev?.productShadows !== presentation.productShadows
    ) {
      if (presentation.productShadows) {
        configureShadowLight(state.lighting.keyLight, presentation, state.lighting);
        applyLegacyProductShadowLift(state.lighting, presentation);
      } else {
        state.lighting.keyLight.castShadow = false;
      }
    }
  }
  if (state.lighting && (
    prev?.fillLightColor !== presentation.fillLightColor
    || prev?.rimLightColor !== presentation.rimLightColor
    || prev?.fillIntensity !== presentation.fillIntensity
    || prev?.rimIntensity !== presentation.rimIntensity
    || prev?.productShadowOpacity !== presentation.productShadowOpacity
  )) {
    applyFillRimLights(state.lighting, presentation);
  }
  if (renderer && prev?.pixelRatioCap !== presentation.pixelRatioCap) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, presentation.pixelRatioCap));
  }
  state.presentation = presentation;
  applyMaterialPresentationTweaks(displayModel, presentation);
  if (state.shadow && displayModel) {
    state.shadow.presentation = presentation;
    applyGroundShadowMaterials(state.shadow, presentation);
    updateContactShadowPlane(state.shadow, displayModel);
  } else if ((presentation.shadows || presentation.productShadows) && displayModel && !state.shadow) {
    state.shadow = attachContactShadow(scene, displayModel, state.lighting?.keyLight, presentation);
  } else if (!presentation.shadows && !presentation.productShadows && state.shadow) {
    if (state.shadow.group) scene.remove(state.shadow.group);
    state.shadow.plane?.material?.dispose?.();
    state.shadow.softPlane?.material?.dispose?.();
    state.shadow = null;
    if (state.lighting?.keyLight) state.lighting.keyLight.castShadow = false;
  }
  return state;
}
