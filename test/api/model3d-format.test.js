const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { inferModelFormat } = require('../../lib/model3d-format.js');

describe('inferModelFormat', () => {
  it('prefers model path extension over stale format field', () => {
    assert.equal(
      inferModelFormat({ format: 'obj', modelPath: 'assets/products/3d/chair/model.glb' }),
      'glb'
    );
  });

  it('uses obj when path is obj', () => {
    assert.equal(
      inferModelFormat({ format: 'glb', modelPath: 'assets/products/3d/chair/model.obj' }),
      'obj'
    );
  });
});
