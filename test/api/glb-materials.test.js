const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { glbHasTexturedMaterials, parseGlbJson } = require('../../lib/glb-inspect');

const FIXTURE_CANDIDATES = [
  path.join(__dirname, '../../uploads/assets/products/3d/beachflag/New_Stool_x_chair.glb'),
  path.join(__dirname, '../fixtures/sample.glb')
];

function firstExistingGlb() {
  for (const p of FIXTURE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

describe('glb material inspection', () => {
  it('parses GLB JSON chunk when a sample file is present', () => {
    const sample = firstExistingGlb();
    if (!sample) {
      console.log('skip: geen GLB-fixture op schijf');
      return;
    }
    const buffer = fs.readFileSync(sample);
    const json = parseGlbJson(buffer);
    assert.ok(json, 'GLB JSON chunk moet parsebaar zijn');
    assert.ok(Array.isArray(json.materials), 'materials array verwacht');
    assert.equal(glbHasTexturedMaterials(buffer), true, 'productie-GLB moet textures in materials hebben');
  });
});
