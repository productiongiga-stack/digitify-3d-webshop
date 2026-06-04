const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { normalizeProductPosterBuffer, POSTER_CARD_PX } = require('../../lib/product-poster-image');

describe('normalizeProductPosterBuffer', () => {
  it('outputs square webp with contain padding', async () => {
    const src = await sharp({
      create: { width: 400, height: 800, channels: 3, background: { r: 20, g: 40, b: 60 } }
    })
      .png()
      .toBuffer();
    const out = await normalizeProductPosterBuffer(src, sharp);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, POSTER_CARD_PX);
    assert.equal(meta.height, POSTER_CARD_PX);
  });
});
