const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductsPosterPolicy, coalesceProductsPosterPaths } = require('../../lib/product-poster-policy');

describe('coalesceProductsPosterPaths', () => {
  it('fills posterPath from mockupPath when missing', () => {
    const out = coalesceProductsPosterPaths([{
      id: 'chair',
      mockupPath: 'assets/products/chair/mockup.png',
      model3d: { enabled: true, modelPath: 'assets/products/3d/chair/model.glb' }
    }]);
    assert.equal(out[0].model3d.posterPath, 'assets/products/chair/mockup.png');
    assert.equal(validateProductsPosterPolicy(out).length, 0);
  });
});

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
