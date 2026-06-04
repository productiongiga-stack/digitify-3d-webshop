const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseObjMtllibFromBuffer, objBasenameMtl } = require('../../lib/obj-mtl');

describe('obj-mtl helpers', () => {
  it('parses mtllib from OBJ header', () => {
    const buf = Buffer.from('mtllib ./chair.mtl\nv 0 0 0\n');
    assert.equal(parseObjMtllibFromBuffer(buf), 'chair.mtl');
  });

  it('derives basename mtl from obj filename', () => {
    assert.equal(objBasenameMtl('model.obj'), 'model.mtl');
  });
});
