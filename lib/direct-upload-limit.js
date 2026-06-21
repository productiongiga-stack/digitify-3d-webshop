/** Vercel serverless rejects bodies above ~4.5 MB before Express runs. */
const VERCEL_HARD_BODY_LIMIT = 4.5 * 1024 * 1024;
const SAFE_DIRECT_UPLOAD_BYTES = Math.floor(3.5 * 1024 * 1024);
const CHUNK_UPLOAD_BYTES = 2 * 1024 * 1024;

function getMaxDirectUploadBytes() {
  const raw = Number(process.env.MAX_DIRECT_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, VERCEL_HARD_BODY_LIMIT);
  if (process.env.VERCEL) return SAFE_DIRECT_UPLOAD_BYTES;
  return 150 * 1024 * 1024;
}

function getChunkUploadBytes() {
  const raw = Number(process.env.CHUNK_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, SAFE_DIRECT_UPLOAD_BYTES);
  return CHUNK_UPLOAD_BYTES;
}

function getUploadPlatformLimits() {
  return {
    maxDirectUploadBytes: getMaxDirectUploadBytes(),
    chunkUploadBytes: getChunkUploadBytes(),
    chunkedUploadsEnabled: true
  };
}

module.exports = {
  VERCEL_HARD_BODY_LIMIT,
  SAFE_DIRECT_UPLOAD_BYTES,
  CHUNK_UPLOAD_BYTES,
  getMaxDirectUploadBytes,
  getChunkUploadBytes,
  getUploadPlatformLimits
};
