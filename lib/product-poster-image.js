/** Square product poster/thumb: subject centered with padding (fits storefront cards). */
const POSTER_CARD_PX = 1200;
const POSTER_CARD_BG = { r: 232, g: 245, b: 248, alpha: 1 };

async function normalizeProductPosterBuffer(buffer, sharpFactory = null) {
  const sharp = sharpFactory || require('sharp');
  if (!buffer?.length) throw new Error('Lege poster-afbeelding');
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(POSTER_CARD_PX, POSTER_CARD_PX, {
      fit: 'contain',
      background: POSTER_CARD_BG,
      withoutEnlargement: false
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
}

module.exports = {
  POSTER_CARD_PX,
  POSTER_CARD_BG,
  normalizeProductPosterBuffer
};
