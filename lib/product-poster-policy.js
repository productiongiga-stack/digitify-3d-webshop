/** Server-side validation: 3D enabled in shop requires a poster. */
function findProductsMissingPoster(products) {
  const list = Array.isArray(products) ? products : [];
  const missing = [];
  list.forEach((p) => {
    if (!p || typeof p !== 'object') return;
    const m3d = p.model3d && typeof p.model3d === 'object' ? p.model3d : {};
    const modelPath = String(m3d.modelPath || '').trim();
    const posterPath = String(m3d.posterPath || '').trim();
    const enabled3d = m3d.enabled !== false && !!modelPath;
    if (enabled3d && !posterPath) {
      missing.push({
        productId: String(p.id || '').trim(),
        productName: String(p.name || p.id || 'Product').trim(),
        code: 'POSTER_REQUIRED'
      });
    }
  });
  return missing;
}

function validateProductsPosterPolicy(products) {
  return findProductsMissingPoster(products);
}

module.exports = {
  findProductsMissingPoster,
  validateProductsPosterPolicy
};
