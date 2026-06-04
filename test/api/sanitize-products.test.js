const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeProducts } = require('../../db');

describe('sanitizeProducts model3d', () => {
  it('preserves poster and scale', () => {
    const out = sanitizeProducts([{
      id: 'demo',
      name: 'Demo',
      enabled: true,
      model3d: {
        enabled: true,
        modelPath: 'assets/products/3d/demo/model.glb',
        posterPath: 'assets/products/3d/demo/poster.webp',
        scale: 2.5,
        rotationY: -45
      }
    }]);
    assert.equal(out[0].model3d.posterPath, 'assets/products/3d/demo/poster.webp');
    assert.equal(out[0].model3d.scale, 2.5);
    assert.equal(out[0].model3d.rotationY, -45);
  });

  it('disables 3D when model path missing', () => {
    const out = sanitizeProducts([{
      id: 'demo',
      name: 'Demo',
      enabled: true,
      model3d: { enabled: true, modelPath: '', posterPath: 'x.webp' }
    }]);
    assert.equal(out[0].model3d.enabled, false);
  });
});
