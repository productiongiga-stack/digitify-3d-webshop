const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  newSessionId,
  initChunkSession,
  saveChunkPart,
  mergeChunkParts,
  cleanupChunkSession,
  readMeta
} = require('../../lib/chunked-upload-store');

function memoryBlobStore() {
  const map = new Map();
  return {
    async persistUploadBlob(rel, buffer, mime) {
      map.set(rel, { buffer: Buffer.from(buffer), mime });
    },
    async loadUploadBlob(rel) {
      const row = map.get(rel);
      if (!row) return null;
      return { buffer: row.buffer, mime: row.mime };
    },
    async removeUploadBlob(rel) {
      map.delete(rel);
    }
  };
}

describe('chunked-upload-store', () => {
  it('merges ordered parts into one buffer', async () => {
    const deps = memoryBlobStore();
    const sessionId = newSessionId();
    await initChunkSession(deps, sessionId, { kind: 'product3d', field: 'model' }, 1);
    await saveChunkPart(deps, sessionId, 0, Buffer.from('hel'));
    await saveChunkPart(deps, sessionId, 1, Buffer.from('lo'));
    const merged = await mergeChunkParts(deps, sessionId, 2);
    assert.equal(merged.toString('utf8'), 'hello');
    const meta = await readMeta(deps, sessionId);
    assert.equal(meta.kind, 'product3d');
    await cleanupChunkSession(deps, sessionId, 2);
    assert.equal(await readMeta(deps, sessionId), null);
  });
});
