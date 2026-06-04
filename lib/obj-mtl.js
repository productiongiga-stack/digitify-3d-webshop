'use strict';

/** Parse first mtllib reference from OBJ header (first 128KB). */
function parseObjMtllibName(objText) {
  const head = String(objText || '').slice(0, 131072);
  const match = head.match(/^\s*mtllib\s+(\S+)/im);
  if (!match) return '';
  return match[1].replace(/^\.\//, '').trim();
}

function parseObjMtllibFromBuffer(buffer) {
  if (!buffer?.length) return '';
  const slice = buffer.length > 131072 ? buffer.subarray(0, 131072) : buffer;
  return parseObjMtllibName(slice.toString('utf8'));
}

function objBasenameMtl(objFilename) {
  const name = String(objFilename || '').trim();
  if (!/\.obj$/i.test(name)) return '';
  return name.replace(/\.obj$/i, '.mtl');
}

module.exports = {
  parseObjMtllibName,
  parseObjMtllibFromBuffer,
  objBasenameMtl
};
