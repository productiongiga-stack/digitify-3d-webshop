const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { parseObjMtllibFromBuffer, objBasenameMtl } = require('./obj-mtl');

const MODEL_3D_EXTENSIONS = new Set(['.glb', '.gltf', '.obj', '.stl', '.fbx']);
const MODEL_3D_RESOURCE_EXTENSIONS = new Set(['.bin', '.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.mtl', '.hdr', '.tga']);

function sanitize3dUploadFilename(name) {
  const base = path.basename(String(name || 'asset').trim());
  const safe = base.replace(/[^\w.\-+]/g, '_').replace(/_+/g, '_');
  return (safe || 'asset').slice(0, 120);
}

function infer3dFormatFromFilename(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.obj') return 'obj';
  if (ext === '.glb') return 'glb';
  if (ext === '.gltf') return 'gltf';
  if (ext === '.stl') return 'stl';
  if (ext === '.fbx') return 'fbx';
  return 'glb';
}

function sanitizeMtlTexturePaths(buffer, bundleDirRel, uploadDir) {
  const text = buffer.toString('utf8');
  const bundleAbs = path.join(uploadDir, bundleDirRel.replace(/^\/+/, ''));
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const mapMatch = /^(map_\w+(?:\s+-.+)?)\s+(.+)$/i.exec(line.trim());
    if (!mapMatch) return line;
    const directive = mapMatch[1].split(/\s+/)[0];
    let texRef = mapMatch[2].trim();
    if (/^[a-zA-Z]:[\\/]/.test(texRef) || texRef.includes('\\')) {
      texRef = texRef.split(/[/\\]/).pop() || texRef;
      return `${directive} ${texRef}`;
    }
    const candidate = path.join(bundleAbs, texRef);
    if (texRef && fs.existsSync(candidate)) return `${directive} ${texRef}`;
    return line;
  });
  return Buffer.from(out.join('\n'));
}

function storedObjMaterialPath(bundleDir, objBuffer, objFilename, uploadDir) {
  const candidates = [
    parseObjMtllibFromBuffer(objBuffer),
    objBasenameMtl(objFilename)
  ].filter(Boolean);
  for (const name of candidates) {
    const rel = `${bundleDir}${sanitize3dUploadFilename(name)}`;
    const abs = path.join(uploadDir, rel);
    if (fs.existsSync(abs)) return rel;
  }
  return '';
}

function mimeFor3dExtension(ext) {
  if (ext === '.glb') return 'model/gltf-binary';
  if (ext === '.gltf') return 'model/gltf+json';
  if (ext === '.stl') return 'model/stl';
  if (ext === '.fbx') return 'application/octet-stream';
  if (['.png', '.jpg', '.jpeg', '.webp', '.ktx2', '.hdr', '.tga'].includes(ext)) {
    return ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'application/octet-stream');
  }
  return 'text/plain';
}

function sanitize3dResourceDir(raw) {
  const value = String(raw || '').trim().replace(/^\/+/, '').slice(0, 260);
  if (!value || value.includes('..') || !value.startsWith('assets/products/3d/')) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

const product3dAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024, files: 24 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const field = String(file.fieldname || '');
    const mime = String(file.mimetype || '').toLowerCase();
    if (field === 'poster' && mime.startsWith('image/')) return cb(null, true);
    if (field === 'model' && (MODEL_3D_EXTENSIONS.has(ext) || mime === 'model/gltf-binary' || mime === 'model/gltf+json' || mime === 'model/stl' || mime === 'application/octet-stream')) {
      return cb(null, true);
    }
    if (field === 'material' && ext === '.mtl') return cb(null, true);
    if (field === 'resources' && (MODEL_3D_RESOURCE_EXTENSIONS.has(ext) || mime.startsWith('image/'))) return cb(null, true);
    cb(new Error('Ongeldig 3D-bestand. Modellen: GLB, GLTF, OBJ, STL, FBX. Extra: MTL, BIN, textures (PNG/JPG/WebP).'));
  }
});

async function handleProduct3dAssetUpload(req, deps) {
  const {
    writePublicAsset,
    logAuditFromReq,
    uploadDir
  } = deps;

  const modelFile = req.files?.model?.[0] || null;
  const materialFile = req.files?.material?.[0] || null;
  const posterFile = req.files?.poster?.[0] || null;
  const resourceFiles = Array.isArray(req.files?.resources) ? req.files.resources : [];
  if (!modelFile?.buffer?.length && !materialFile?.buffer?.length && !posterFile?.buffer?.length && !resourceFiles.length) {
    const err = new Error('Geen 3D asset ontvangen');
    err.status = 400;
    throw err;
  }

  const productId = String(req.body?.productId || 'product').trim().toLowerCase()
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'product';
  const baseDir = `assets/products/3d/${productId}`;
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const out = { quality: 'high' };
  let bundleDir = sanitize3dResourceDir(req.body?.resourceDir);
  if (!bundleDir && modelFile?.buffer?.length) {
    const extRaw = path.extname(modelFile.originalname || '');
    const ext = extRaw ? extRaw.toLowerCase() : '';
    const mime = String(modelFile.mimetype || '').toLowerCase();
    const normalizedExt = MODEL_3D_EXTENSIONS.has(ext)
      ? ext
      : (mime === 'model/gltf-binary' ? '.glb' : (mime === 'model/gltf+json' ? '.gltf' : (mime === 'model/stl' ? '.stl' : '.glb')));
    const flatDirFormats = new Set(['.obj', '.stl', '.fbx']);
    bundleDir = flatDirFormats.has(normalizedExt) ? `${baseDir}/` : `${baseDir}/bundle-${suffix}/`;
  }
  if (!bundleDir && (materialFile?.buffer?.length || resourceFiles.length)) {
    bundleDir = `${baseDir}/bundle-${suffix}/`;
  }

  if (modelFile?.buffer?.length) {
    const extRaw = path.extname(modelFile.originalname || '');
    const ext = extRaw ? extRaw.toLowerCase() : '';
    const mime = String(modelFile.mimetype || '').toLowerCase();
    const normalizedExt = MODEL_3D_EXTENSIONS.has(ext)
      ? ext
      : (mime === 'model/gltf-binary' ? '.glb' : (mime === 'model/gltf+json' ? '.gltf' : (mime === 'model/stl' ? '.stl' : '.glb')));
    const safeName = sanitize3dUploadFilename(modelFile.originalname || `model${normalizedExt}`);
    const modelPath = `${bundleDir}${safeName}`;
    await writePublicAsset(modelPath, modelFile.buffer, mimeFor3dExtension(normalizedExt));
    out.modelPath = modelPath;
    out.format = infer3dFormatFromFilename(safeName);
    out.resourceDir = bundleDir;
    if (normalizedExt === '.glb' || normalizedExt === '.gltf') {
      out.materialPath = '';
    } else if (normalizedExt === '.obj') {
      const linked = storedObjMaterialPath(bundleDir, modelFile.buffer, safeName, uploadDir);
      if (linked) out.materialPath = linked;
    }
  }

  if (materialFile?.buffer?.length) {
    const targetDir = bundleDir || `${baseDir}/bundle-${suffix}/`;
    const materialName = sanitize3dUploadFilename(materialFile.originalname || 'material.mtl');
    const materialPath = `${targetDir}${materialName}`;
    const mtlBody = sanitizeMtlTexturePaths(materialFile.buffer, targetDir, uploadDir);
    await writePublicAsset(materialPath, mtlBody, 'text/plain');
    out.materialPath = materialPath;
    out.resourceDir = targetDir;
  }

  for (const resourceFile of resourceFiles) {
    if (!resourceFile?.buffer?.length) continue;
    const targetDir = bundleDir || sanitize3dResourceDir(req.body?.resourceDir) || `${baseDir}/bundle-${suffix}/`;
    const resourceName = sanitize3dUploadFilename(resourceFile.originalname || 'resource.bin');
    const resourcePath = `${targetDir}${resourceName}`;
    const ext = path.extname(resourceName).toLowerCase();
    const resourceBody = ext === '.mtl'
      ? sanitizeMtlTexturePaths(resourceFile.buffer, targetDir, uploadDir)
      : resourceFile.buffer;
    await writePublicAsset(resourcePath, resourceBody, mimeFor3dExtension(ext));
    out.resourceDir = targetDir;
    if (ext === '.mtl' && !out.materialPath) out.materialPath = resourcePath;
  }

  if (out.modelPath?.toLowerCase().endsWith('.obj') && !out.materialPath && modelFile?.buffer?.length) {
    const dir = bundleDir || `${path.posix.dirname(out.modelPath)}/`;
    const linked = storedObjMaterialPath(dir.endsWith('/') ? dir : `${dir}/`, modelFile.buffer, path.basename(out.modelPath), uploadDir);
    if (linked) out.materialPath = linked;
  }

  if (posterFile?.buffer?.length) {
    const { normalizeProductPosterBuffer } = require('./product-poster-image');
    const posterPath = `${baseDir}/poster-${suffix}.webp`;
    const optimizedPoster = await normalizeProductPosterBuffer(posterFile.buffer);
    await writePublicAsset(posterPath, optimizedPoster, 'image/webp');
    out.posterPath = posterPath;
  }

  await logAuditFromReq(req, {
    action: 'CONFIG_UPDATED',
    entityType: 'config',
    entityId: 'main',
    summary: 'Product 3D asset geüpload',
    details: {
      productId,
      modelPath: out.modelPath || null,
      materialPath: out.materialPath || null,
      posterPath: out.posterPath || null,
      resourceDir: out.resourceDir || null,
      resourceCount: resourceFiles.length,
      format: out.format || null,
      quality: out.quality,
      modelName: modelFile?.originalname || null,
      materialName: materialFile?.originalname || null,
      posterName: posterFile?.originalname || null
    }
  });

  return out;
}

module.exports = {
  MODEL_3D_EXTENSIONS,
  product3dAssetUpload,
  handleProduct3dAssetUpload,
  sanitize3dUploadFilename,
  infer3dFormatFromFilename
};
