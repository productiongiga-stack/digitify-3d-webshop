const { handleProduct3dAssetUpload } = require('./product-3d-upload');
const { handleProductMockupUpload } = require('./product-mockup-upload');

function toMulterFile(buffer, originalname, mimetype) {
  return {
    buffer,
    originalname: String(originalname || 'upload.bin'),
    mimetype: String(mimetype || 'application/octet-stream'),
    size: buffer.length
  };
}

function parseChunkMeta(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function dispatchChunkedUpload(meta, buffer, deps) {
  const kind = String(meta?.kind || '').trim();
  if (kind === 'product3d') {
    const field = String(meta.field || '').trim();
    const allowed = new Set(['model', 'material', 'poster', 'resources']);
    if (!allowed.has(field)) {
      const err = new Error('Ongeldig 3D-uploadveld');
      err.status = 400;
      throw err;
    }
    const file = toMulterFile(buffer, meta.filename, meta.mimetype);
    const req = {
      body: {
        productId: String(meta.productId || 'product'),
        resourceDir: String(meta.resourceDir || '')
      },
      files: {}
    };
    req.files[field] = [file];
    const model3d = await handleProduct3dAssetUpload(req, {
      writePublicAsset: deps.writePublicAsset,
      logAuditFromReq: deps.logAuditFromReq,
      uploadDir: deps.uploadDir
    });
    return { model3d };
  }

  if (kind === 'productMockup') {
    const file = toMulterFile(buffer, meta.filename, meta.mimetype);
    const out = await handleProductMockupUpload(file, {
      writePublicAsset: deps.writePublicAsset,
      logAuditFromReq: deps.logAuditFromReq,
      req: deps.req
    });
    return out;
  }

  const err = new Error('Onbekend chunk-upload type');
  err.status = 400;
  throw err;
}

module.exports = {
  parseChunkMeta,
  dispatchChunkedUpload
};
