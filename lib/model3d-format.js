'use strict';

const SUPPORTED_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'fbx'];

/** Prefer file extension over stored format (admin dropdown can be stale). */
function inferModelFormat(manifest) {
  const path = String(manifest?.modelPath || manifest?.path || '').trim().toLowerCase();
  if (path.endsWith('.obj')) return 'obj';
  if (path.endsWith('.glb')) return 'glb';
  if (path.endsWith('.gltf')) return 'gltf';
  if (path.endsWith('.stl')) return 'stl';
  if (path.endsWith('.fbx')) return 'fbx';
  const fmt = String(manifest?.format || '').trim().toLowerCase();
  if (SUPPORTED_FORMATS.includes(fmt)) return fmt;
  return 'glb';
}

module.exports = { inferModelFormat, SUPPORTED_FORMATS };
