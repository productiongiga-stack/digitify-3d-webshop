function posterFallbackFromProduct(p) {
  if (!p || typeof p !== 'object') return '';
  const m3d = p.model3d && typeof p.model3d === 'object' ? p.model3d : {};
  return String(m3d.posterPath || p.mockupPath || p.designerMockupPath || '').trim().replace(/^\/+/, '');
}

/** Fill missing model3d.posterPath from mockup before validation/save. */
function coalesceProductsPosterPaths(products) {
  const list = Array.isArray(products) ? products : [];
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const m3d = p.model3d && typeof p.model3d === 'object' ? { ...p.model3d } : {};
    const modelPath = String(m3d.modelPath || '').trim();
    const enabled3d = m3d.enabled !== false && !!modelPath;
    if (enabled3d && !String(m3d.posterPath || '').trim()) {
      const fallback = posterFallbackFromProduct({ ...p, model3d: m3d });
      if (fallback) m3d.posterPath = fallback;
    }
    return { ...p, model3d: m3d };
  });
}

const DEFAULT_STORE_MOCKUP = 'assets/tshirt_mockup.png';

/** Keep 3D poster in sync with uploaded store mockups so the shop preview updates. */
function syncStoreMockupToModel3dPoster(products) {
  const list = Array.isArray(products) ? products : [];
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const mockup = String(p.mockupPath || '').trim().replace(/^\/+/, '');
    if (!mockup || mockup === DEFAULT_STORE_MOCKUP) return p;
    const m3d = p.model3d && typeof p.model3d === 'object' ? { ...p.model3d } : null;
    if (!m3d) return p;
    const modelPath = String(m3d.modelPath || '').trim();
    if (m3d.enabled === false || !modelPath) return p;
    const poster = String(m3d.posterPath || '').trim().replace(/^\/+/, '');
    if (poster === mockup) return p;
    const uploadedStoreMockup = /^assets\/products\/mockup-/i.test(mockup);
    const posterLooksBundled = !poster
      || /\/poster\.(png|webp|jpe?g)$/i.test(poster)
      || /\/mock\.(png|webp|jpe?g)$/i.test(poster);
    if (!posterLooksBundled) return p;
    if (uploadedStoreMockup || mockup !== poster) {
      return { ...p, model3d: { ...m3d, posterPath: mockup } };
    }
    return p;
  });
}

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
  posterFallbackFromProduct,
  coalesceProductsPosterPaths,
  syncStoreMockupToModel3dPoster,
  findProductsMissingPoster,
  validateProductsPosterPolicy
};
