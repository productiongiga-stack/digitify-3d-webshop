const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizePresentationFields } = require('../../lib/model3d-presentation');

describe('sanitizePresentationFields', () => {
  it('defaults to studio + room for high quality', () => {
    const out = sanitizePresentationFields({}, 'high');
    assert.equal(out.lightingPreset, 'studio');
    assert.equal(out.envPreset, 'room');
    assert.equal(out.shadows, true);
    assert.equal(out.exposure, 1.08);
  });

  it('disables env and shadows for standard quality', () => {
    const out = sanitizePresentationFields({ shadows: true, envPreset: 'warm' }, 'standard');
    assert.equal(out.envPreset, 'none');
    assert.equal(out.shadows, false);
    assert.equal(out.shadowPreset, 'none');
  });

  it('keeps shadow preset for high quality', () => {
    const out = sanitizePresentationFields({ shadowPreset: 'soft' }, 'high');
    assert.equal(out.shadowPreset, 'soft');
    assert.equal(out.shadows, true);
    assert.equal(out.groundShadows, true);
  });

  it('allows ground shadows off while shadows on', () => {
    const out = sanitizePresentationFields({ shadowPreset: 'natural', groundShadows: false }, 'high');
    assert.equal(out.groundShadows, false);
    assert.equal(out.shadows, true);
  });

  it('sanitizes key light color hex', () => {
    const out = sanitizePresentationFields({ keyLightColor: 'ffaa00' }, 'high');
    assert.equal(out.keyLightColor, '#ffaa00');
  });

  it('clamps fill and rim light intensity', () => {
    const out = sanitizePresentationFields({ fillLightIntensity: 3, rimLightIntensity: 0.1 }, 'high');
    assert.equal(out.fillLightIntensity, 2);
    assert.equal(out.rimLightIntensity, 0.5);
  });

  it('sanitizes detail level', () => {
    const out = sanitizePresentationFields({ detailLevel: 'low' }, 'high');
    assert.equal(out.detailLevel, 'low');
    const bad = sanitizePresentationFields({ detailLevel: 'ultra' }, 'high');
    assert.equal(bad.detailLevel, 'auto');
  });

  it('clamps exposure and envIntensity', () => {
    const out = sanitizePresentationFields({ exposure: 9, envIntensity: 0.1 }, 'high');
    assert.equal(out.exposure, 1.65);
    assert.equal(out.envIntensity, 0.5);
  });

  it('clamps saturation and shadowOpacity', () => {
    const out = sanitizePresentationFields({ saturation: 3, shadowOpacity: 0.05 }, 'high');
    assert.equal(out.saturation, 1.5);
    assert.equal(out.shadowOpacity, 0.12);
    assert.equal(out.groundShadowOpacity, 0.12);
    assert.equal(out.productShadowOpacity, 0.12);
  });

  it('keeps separate ground and product shadow opacity', () => {
    const out = sanitizePresentationFields({
      groundShadowOpacity: 0.3,
      productShadowOpacity: 0.7
    }, 'high');
    assert.equal(out.groundShadowOpacity, 0.3);
    assert.equal(out.productShadowOpacity, 0.7);
  });
});
