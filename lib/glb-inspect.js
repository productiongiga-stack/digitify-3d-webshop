/** Lightweight GLB JSON chunk inspection (no Three.js). */
function parseGlbJson(buffer) {
  if (!buffer?.length || buffer.length < 20) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) return null;
  const version = view.getUint32(4, true);
  if (version !== 2) return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > buffer.length) break;
    if (chunkType === 0x4E4F534A) {
      const jsonBytes = buffer.subarray(offset, offset + chunkLength);
      return JSON.parse(Buffer.from(jsonBytes).toString('utf8'));
    }
    offset += chunkLength;
  }
  return null;
}

function glbHasTexturedMaterials(buffer) {
  const root = parseGlbJson(buffer);
  if (!root || !Array.isArray(root.materials)) return false;
  const textures = Array.isArray(root.textures) ? root.textures : [];
  const images = Array.isArray(root.images) ? root.images : [];
  if (!textures.length && !images.length) return false;
  return root.materials.some((mat) => {
    const pbr = mat?.pbrMetallicRoughness || {};
    return Number.isFinite(pbr.baseColorTexture?.index)
      || Number.isFinite(mat.normalTexture?.index)
      || Number.isFinite(mat.emissiveTexture?.index);
  });
}

module.exports = {
  parseGlbJson,
  glbHasTexturedMaterials
};
