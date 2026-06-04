const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductsPosterPolicy } = require('../../lib/product-poster-policy');

describe('validateProductsPosterPolicy', () => {
  it('flags enabled 3D products without poster', () => {
    const gaps = validateProductsPosterPolicy([{
      id: 'chair',
      name: 'Chair',
      model3d: { enabled: true, modelPath: 'assets/products/3d/chair/model.glb' }
    }]);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].code, 'POSTER_REQUIRED');
  });

  it('allows 3D with poster', () => {
    const gaps = validateProductsPosterPolicy([{
      id: 'chair',
      model3d: {
        enabled: true,
        modelPath: 'assets/products/3d/chair/model.glb',
        posterPath: 'assets/products/3d/chair/poster.webp'
      }
    }]);
    assert.equal(gaps.length, 0);
  });
});
