/**
 * Public asset URLs + optional Vercel Blob mirror for product/branding files.
 * Local + upload_blobs (server) remain source of truth; CDN is an overlay when configured.
 */
const path = require('path');

function sanitizeRelativeAssetPath(raw) {
  let rel = String(raw || '').trim().replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return '';
  if (!rel.startsWith('assets/')) return '';
  return rel.replace(/\\/g, '/');
}

function getAssetCdnBase() {
  const explicit = String(process.env.ASSET_CDN_BASE || process.env.PUBLIC_ASSET_CDN || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const blobStore = String(process.env.BLOB_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return blobStore;
}

function getStorageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'vercel-blob';
  if (getAssetCdnBase()) return 'cdn';
  return 'local';
}

function resolvePublicAssetUrl(relativePath, appBaseUrl = '') {
  const rel = sanitizeRelativeAssetPath(relativePath);
  if (!rel) return '';
  const cdn = getAssetCdnBase();
  if (cdn) return `${cdn}/${rel}`;
  const base = String(appBaseUrl || '').trim().replace(/\/+$/, '');
  if (base) return `${base}/${rel}`;
  return `/${rel}`;
}

async function mirrorToVercelBlob(relativePath, buffer, mimeType) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const rel = sanitizeRelativeAssetPath(relativePath);
  if (!token || !rel || !buffer?.length) return null;

  let put;
  try {
    ({ put } = require('@vercel/blob'));
  } catch {
    return null;
  }

  try {
    const result = await put(rel, buffer, {
      access: 'public',
      contentType: mimeType || 'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite: true
    });
    return result?.url || null;
  } catch (err) {
    console.warn('Vercel Blob mirror mislukt:', rel, err?.message || err);
    return null;
  }
}

async function mirrorPublicAssetIfConfigured(relativePath, buffer, mimeType) {
  const rel = sanitizeRelativeAssetPath(relativePath);
  if (!rel || !buffer?.length) return null;
  return mirrorToVercelBlob(rel, buffer, mimeType);
}

function getPlatformAssetMeta(appBaseUrl = '') {
  return {
    assetCdnBase: getAssetCdnBase(),
    assetStorage: getStorageMode(),
    assetUrlMode: getAssetCdnBase() ? 'cdn' : 'same-origin',
    resolveAssetUrl: (rel) => resolvePublicAssetUrl(rel, appBaseUrl)
  };
}

module.exports = {
  sanitizeRelativeAssetPath,
  getAssetCdnBase,
  getStorageMode,
  resolvePublicAssetUrl,
  mirrorPublicAssetIfConfigured,
  getPlatformAssetMeta
};
