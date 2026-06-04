const multer = require('multer');
const { getChunkUploadBytes } = require('../lib/direct-upload-limit');
const {
  newSessionId,
  initChunkSession,
  saveChunkPart,
  mergeChunkParts,
  cleanupChunkSession,
  readMeta,
  assertSessionAccess
} = require('../lib/chunked-upload-store');
const { parseChunkMeta, dispatchChunkedUpload } = require('../lib/chunked-upload-dispatch');

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getChunkUploadBytes() + 256 * 1024, files: 1 }
});

function registerChunkedUploadRoutes(app, deps) {
  const {
    requireAuth,
    requireRole,
    persistUploadBlob,
    loadUploadBlob,
    removeUploadBlob,
    writePublicAsset,
    logAuditFromReq,
    uploadDir
  } = deps;

  const storeDeps = { persistUploadBlob, loadUploadBlob, removeUploadBlob };

  app.post(
    '/api/admin/uploads/chunk',
    requireAuth,
    requireRole('OWNER', 'ADMIN'),
    chunkUpload.single('chunk'),
    async (req, res) => {
      try {
        if (!req.file?.buffer?.length) {
          return res.status(400).json({ error: 'Geen chunk-data ontvangen' });
        }

        const chunkIndex = Number(req.body?.chunkIndex);
        const totalChunks = Number(req.body?.totalChunks);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
          return res.status(400).json({ error: 'chunkIndex ongeldig' });
        }
        if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 500) {
          return res.status(400).json({ error: 'totalChunks ongeldig (max 500)' });
        }
        if (chunkIndex >= totalChunks) {
          return res.status(400).json({ error: 'chunkIndex buiten bereik' });
        }

        const meta = parseChunkMeta(req.body?.meta);
        if (!meta?.kind) {
          return res.status(400).json({ error: 'Upload-metadata ontbreekt' });
        }

        let sessionId = String(req.body?.sessionId || '').trim();
        if (!sessionId) {
          if (chunkIndex !== 0) {
            return res.status(400).json({ error: 'sessionId vereist vanaf chunk 2' });
          }
          sessionId = newSessionId();
          await initChunkSession(storeDeps, sessionId, meta, req.user?.id);
        } else {
          const existing = await readMeta(storeDeps, sessionId);
          assertSessionAccess(existing, req.user);
        }

        await saveChunkPart(storeDeps, sessionId, chunkIndex, req.file.buffer);

        if (chunkIndex + 1 < totalChunks) {
          return res.json({ ok: true, sessionId, done: false, chunkIndex, totalChunks });
        }

        const sessionMeta = await readMeta(storeDeps, sessionId);
        assertSessionAccess(sessionMeta, req.user);
        const merged = await mergeChunkParts(storeDeps, sessionId, totalChunks);
        await cleanupChunkSession(storeDeps, sessionId, totalChunks);

        const payload = await dispatchChunkedUpload(sessionMeta || meta, merged, {
          writePublicAsset,
          logAuditFromReq,
          uploadDir
        });

        return res.json({ ok: true, sessionId, done: true, ...payload });
      } catch (err) {
        console.error('[chunk-upload]', err?.message || err);
        return res.status(err.status || 400).json({ error: err.message || 'Chunk-upload mislukt' });
      }
    }
  );
}

module.exports = { registerChunkedUploadRoutes };
