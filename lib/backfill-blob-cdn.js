const fs = require('fs');
const path = require('path');
const { mirrorPublicAssetIfConfigured } = require('./asset-storage');

function mimeFromExt(ext) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.woff2': 'font/woff2'
  };
  return map[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

async function listDbAssetPaths(db) {
  const rows = await db.prepare(`
    SELECT path, mime_type, data, size_bytes
    FROM upload_blobs
    WHERE path LIKE 'assets/%'
    ORDER BY path ASC
  `).all();
  return Array.isArray(rows) ? rows : [];
}

function listPublicAssetFiles(publicDir) {
  const root = path.join(publicDir, 'assets');
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const rel = path.relative(publicDir, abs).replace(/\\/g, '/');
        if (rel.startsWith('assets/')) out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}

async function backfillPublicAssetsToBlob(opts = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN ontbreekt');
  }
  const db = opts.db;
  if (!db) throw new Error('db adapter vereist');
  const publicDir = opts.publicDir || path.join(__dirname, '..', 'public');
  const dryRun = !!opts.dryRun;
  const readStoredUpload = typeof opts.readStoredUpload === 'function' ? opts.readStoredUpload : null;

  const dbRows = await listDbAssetPaths(db);
  const dbMap = new Map(dbRows.map((row) => [String(row.path || ''), row]));
  const staticPaths = listPublicAssetFiles(publicDir);
  const allPaths = new Set([...dbMap.keys(), ...staticPaths]);

  let mirrored = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const rel of [...allPaths].sort()) {
    if (!rel || !rel.startsWith('assets/')) continue;
    let buffer = null;
    let mime = 'application/octet-stream';
    const row = dbMap.get(rel);
    if (row?.data) {
      buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      mime = String(row.mime_type || mimeFromExt(path.extname(rel)));
    } else {
      const abs = path.join(publicDir, rel);
      if (fs.existsSync(abs)) {
        buffer = fs.readFileSync(abs);
        mime = mimeFromExt(path.extname(abs));
      } else if (readStoredUpload) {
        const stored = await readStoredUpload(rel);
        if (stored?.buffer?.length) {
          buffer = stored.buffer;
          mime = String(stored.mime || mimeFromExt(path.extname(rel)));
        }
      }
    }
    if (!buffer?.length) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      mirrored += 1;
      continue;
    }
    try {
      const url = await mirrorPublicAssetIfConfigured(rel, buffer, mime);
      if (url) mirrored += 1;
      else {
        failed += 1;
        errors.push({ path: rel, error: 'mirror returned empty' });
      }
    } catch (err) {
      failed += 1;
      errors.push({ path: rel, error: err?.message || String(err) });
    }
  }

  return {
    ok: failed === 0,
    total: allPaths.size,
    mirrored,
    skipped,
    failed,
    errors: errors.slice(0, 20)
  };
}

module.exports = {
  backfillPublicAssetsToBlob,
  listDbAssetPaths,
  listPublicAssetFiles
};
