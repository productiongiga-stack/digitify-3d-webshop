const crypto = require('crypto');
const sharp = require('sharp');

function isImageUpload(file) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/octet-stream') return true;
  return /\.(png|jpe?g|webp|gif|avif|heic|heif|svg)$/i.test(name);
}

async function optimizeProductMockupBuffer(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: 'inside',
      withoutEnlargement: true
    })
    .png({ compressionLevel: 9, quality: 90 })
    .toBuffer();
}

async function handleProductMockupUpload(file, deps = {}) {
  const { writePublicAsset, logAuditFromReq, req } = deps;
  if (!file?.buffer?.length) {
    const err = new Error('Geen bestand ontvangen');
    err.status = 400;
    throw err;
  }
  if (!isImageUpload(file)) {
    const err = new Error('Alleen afbeeldingsbestanden zijn toegestaan');
    err.status = 400;
    throw err;
  }

  const fileSuffix = crypto.randomBytes(4).toString('hex');
  const outName = `mockup-${Date.now()}-${fileSuffix}.png`;
  const relPath = `assets/products/${outName}`;
  const optimized = await optimizeProductMockupBuffer(file.buffer);
  await writePublicAsset(relPath, optimized, 'image/png');

  if (typeof logAuditFromReq === 'function' && req) {
    await logAuditFromReq(req, {
      action: 'CONFIG_UPDATED',
      entityType: 'config',
      entityId: 'main',
      summary: 'Product mockup geüpload',
      details: {
        path: relPath,
        originalName: file.originalname || null,
        mime: file.mimetype || null,
        sizeBytes: optimized.length
      }
    });
  }

  return { ok: true, path: relPath, sizeBytes: optimized.length };
}

module.exports = {
  isImageUpload,
  optimizeProductMockupBuffer,
  handleProductMockupUpload
};
