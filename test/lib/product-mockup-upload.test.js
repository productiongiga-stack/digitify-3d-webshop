const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isImageUpload } = require('../../lib/product-mockup-upload');

describe('product-mockup-upload', () => {
  it('accepts common image mime types and octet-stream', () => {
    assert.equal(isImageUpload({ mimetype: 'image/png', originalname: 'x.bin' }), true);
    assert.equal(isImageUpload({ mimetype: 'application/octet-stream', originalname: 'mockup.png' }), true);
  });

  it('accepts image extensions when mime is missing', () => {
    assert.equal(isImageUpload({ mimetype: '', originalname: 'photo.jpeg' }), true);
  });

  it('rejects non-image files', () => {
    assert.equal(isImageUpload({ mimetype: 'application/pdf', originalname: 'doc.pdf' }), false);
  });
});
