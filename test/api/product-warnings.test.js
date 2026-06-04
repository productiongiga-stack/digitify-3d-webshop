const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { collectProductWarnings, collectProductsWarnings } = require('../../lib/product-warnings');

describe('collectProductWarnings', () => {
  it('warns when 3D enabled without poster', () => {
    const warnings = collectProductWarnings({
      id: 'chair',
      name: 'Stoel',
      model3d: { enabled: true, modelPath: 'assets/products/3d/chair/model.glb', posterPath: '' }
    });
    assert.ok(warnings.some((w) => w.code === 'POSTER_MISSING'));
  });

  it('no poster warning when poster set', () => {
    const warnings = collectProductWarnings({
      id: 'chair',
      name: 'Stoel',
      model3d: {
        enabled: true,
        modelPath: 'assets/products/3d/chair/model.glb',
        posterPath: 'assets/products/3d/chair/poster.webp'
      }
    });
    assert.equal(warnings.find((w) => w.code === 'POSTER_MISSING'), undefined);
  });
});

describe('collectProductsWarnings', () => {
  it('aggregates per product', () => {
    const warnings = collectProductsWarnings([
      { id: 'a', name: 'A', model3d: { enabled: true, modelPath: 'x.glb' } }
    ]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].productId, 'a');
  });
});
