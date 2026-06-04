/** Server-side sanitize for model3d presentation fields (mirrors client resolvePresentation defaults). */
const LIGHTING_PRESETS = new Set(['studio', 'soft', 'dramatic']);
const ENV_PRESETS = new Set(['room', 'neutral', 'warm', 'cool', 'none']);
const SHADOW_PRESETS = new Set(['none', 'soft', 'natural', 'studio']);
const DETAIL_LEVELS = new Set(['auto', 'low', 'medium', 'high']);

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function deriveShadowPreset(src, isHigh) {
  const raw = String(src.shadowPreset || '').trim().toLowerCase();
  if (SHADOW_PRESETS.has(raw)) return raw;
  if (src.shadows === false) return 'none';
  if (src.shadows === true) return 'natural';
  return isHigh ? 'natural' : 'none';
}

function parseKeyLightColor(raw) {
  if (raw == null || raw === '') return '';
  const match = String(raw).trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : '';
}

function sanitizePresentationFields(src = {}, quality = 'high') {
  const isHigh = quality !== 'standard';
  const lightingRaw = String(src.lightingPreset || '').trim().toLowerCase();
  const envRaw = String(src.envPreset || '').trim().toLowerCase();
  const exposureRaw = Number(src.exposure);
  const envIntensityRaw = Number(src.envIntensity);
  const shadowOpacityRaw = Number(src.shadowOpacity);
  const groundShadowOpacityRaw = Number(src.groundShadowOpacity);
  const productShadowOpacityRaw = Number(src.productShadowOpacity);
  const legacyOpacity = Number.isFinite(shadowOpacityRaw) ? shadowOpacityRaw : null;
  const saturationRaw = Number(src.saturation);
  const fillMulRaw = Number(src.fillLightIntensity);
  const rimMulRaw = Number(src.rimLightIntensity);
  const detailRaw = String(src.detailLevel || '').trim().toLowerCase();

  let shadowPreset = deriveShadowPreset(src, isHigh);
  if (!isHigh) shadowPreset = 'none';

  return {
    lightingPreset: LIGHTING_PRESETS.has(lightingRaw) ? lightingRaw : 'studio',
    envPreset: isHigh && ENV_PRESETS.has(envRaw) ? envRaw : (isHigh ? 'room' : 'none'),
    shadowPreset,
    shadows: shadowPreset !== 'none',
    groundShadows: shadowPreset !== 'none' && src.groundShadows !== false,
    keyLightColor: parseKeyLightColor(src.keyLightColor),
    fillLightIntensity: Number.isFinite(fillMulRaw) ? clamp(fillMulRaw, 0.5, 2) : 1,
    rimLightIntensity: Number.isFinite(rimMulRaw) ? clamp(rimMulRaw, 0.5, 2) : 1,
    fillLightColor: parseKeyLightColor(src.fillLightColor),
    rimLightColor: parseKeyLightColor(src.rimLightColor),
    detailLevel: DETAIL_LEVELS.has(detailRaw) ? detailRaw : 'auto',
    exposure: Number.isFinite(exposureRaw) ? clamp(exposureRaw, 0.65, 1.65) : (isHigh ? 1.08 : 1),
    envIntensity: Number.isFinite(envIntensityRaw) ? clamp(envIntensityRaw, 0.5, 2.5) : (isHigh ? 1.35 : 1.05),
    shadowOpacity: Number.isFinite(groundShadowOpacityRaw)
      ? clamp(groundShadowOpacityRaw, 0.12, 0.85)
      : (legacyOpacity != null ? clamp(legacyOpacity, 0.12, 0.85) : 0.42),
    groundShadowOpacity: Number.isFinite(groundShadowOpacityRaw)
      ? clamp(groundShadowOpacityRaw, 0.12, 0.85)
      : (legacyOpacity != null ? clamp(legacyOpacity, 0.12, 0.85) : 0.42),
    productShadowOpacity: Number.isFinite(productShadowOpacityRaw)
      ? clamp(productShadowOpacityRaw, 0.12, 0.85)
      : (legacyOpacity != null ? clamp(legacyOpacity, 0.12, 0.85) : 0.42),
    saturation: Number.isFinite(saturationRaw) ? clamp(saturationRaw, 0.5, 1.5) : 1
  };
}

module.exports = { sanitizePresentationFields };
