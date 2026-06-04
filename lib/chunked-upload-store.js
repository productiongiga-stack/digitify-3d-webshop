const crypto = require('crypto');

const CHUNK_PREFIX = '_chunked_uploads';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function newSessionId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function sessionMetaPath(sessionId) {
  return `${CHUNK_PREFIX}/${sessionId}/meta.json`;
}

function sessionPartPath(sessionId, index) {
  return `${CHUNK_PREFIX}/${sessionId}/part-${String(index).padStart(5, '0')}`;
}

async function readMeta(deps, sessionId) {
  const row = await deps.loadUploadBlob(sessionMetaPath(sessionId));
  if (!row?.buffer?.length) return null;
  try {
    return JSON.parse(row.buffer.toString('utf8'));
  } catch {
    return null;
  }
}

async function initChunkSession(deps, sessionId, meta, userId) {
  const payload = {
    ...meta,
    userId: Number(userId) || null,
    createdAt: Date.now()
  };
  await deps.persistUploadBlob(
    sessionMetaPath(sessionId),
    Buffer.from(JSON.stringify(payload), 'utf8'),
    'application/json'
  );
  return payload;
}

async function saveChunkPart(deps, sessionId, index, buffer) {
  await deps.persistUploadBlob(
    sessionPartPath(sessionId, index),
    buffer,
    'application/octet-stream'
  );
}

async function mergeChunkParts(deps, sessionId, totalChunks) {
  const parts = [];
  for (let i = 0; i < totalChunks; i++) {
    const row = await deps.loadUploadBlob(sessionPartPath(sessionId, i));
    if (!row?.buffer?.length) {
      const err = new Error(`Upload-deel ${i + 1} van ${totalChunks} ontbreekt — probeer opnieuw.`);
      err.status = 400;
      throw err;
    }
    parts.push(row.buffer);
  }
  return Buffer.concat(parts);
}

async function cleanupChunkSession(deps, sessionId, totalChunks) {
  await deps.removeUploadBlob(sessionMetaPath(sessionId));
  for (let i = 0; i < totalChunks; i++) {
    await deps.removeUploadBlob(sessionPartPath(sessionId, i));
  }
}

function assertSessionAccess(meta, user) {
  if (!meta) {
    const err = new Error('Upload-sessie niet gevonden of verlopen');
    err.status = 404;
    throw err;
  }
  if (meta.createdAt && Date.now() - meta.createdAt > SESSION_TTL_MS) {
    const err = new Error('Upload-sessie verlopen — start de upload opnieuw');
    err.status = 410;
    throw err;
  }
  const ownerId = Number(meta.userId);
  const uid = Number(user?.id);
  if (ownerId && uid && ownerId !== uid) {
    const err = new Error('Geen toegang tot deze upload-sessie');
    err.status = 403;
    throw err;
  }
}

module.exports = {
  newSessionId,
  initChunkSession,
  saveChunkPart,
  mergeChunkParts,
  cleanupChunkSession,
  readMeta,
  assertSessionAccess
};
