/** Product/catalog warnings for admin save responses. */
function collectProductWarnings(product) {
  const warnings = [];
  if (!product || typeof product !== 'object') return warnings;
  const name = String(product.name || '').trim();
  const id = String(product.id || '').trim().toLowerCase();
  const mockupPath = String(product.mockupPath || '').trim().toLowerCase();
  const m3d = product.model3d && typeof product.model3d === 'object' ? product.model3d : {};
  const modelPath = String(m3d.modelPath || '').trim();
  const posterPath = String(m3d.posterPath || '').trim();
  const enabled3d = m3d.enabled !== false && !!modelPath;

  if (!name) warnings.push({ code: 'NAME_EMPTY', severity: 'warn', message: 'Productnaam ontbreekt.' });
  if (enabled3d && !posterPath) {
    warnings.push({
      code: 'POSTER_MISSING',
      severity: 'error',
      blocking: true,
      message: '3D-product zonder poster: upload een poster of maak een snapshot — opslaan met 3D in de shop is geblokkeerd.'
    });
  }
  if (enabled3d && posterPath) {
    const genericPoster = /tshirt_mockup|poster-.*tshirt/i.test(posterPath)
      || (!posterPath.includes(id) && id && id !== 'tshirt' && /tshirt/i.test(posterPath));
    if (genericPoster || (mockupPath.includes('tshirt') && id && !id.includes('shirt') && !id.includes('tshirt'))) {
      warnings.push({
        code: 'POSTER_MISMATCH',
        severity: 'warn',
        message: 'Poster lijkt niet bij dit product te horen (t-shirt-fallback?). Upload een passende poster of maak een 3D-snapshot.'
      });
    }
  }
  if (m3d.enabled !== false && !modelPath) {
    warnings.push({ code: 'MODEL_MISSING', severity: 'error', blocking: true, message: '3D staat aan maar er is geen modelpad ingesteld.' });
  }
  return warnings;
}

function collectProductsWarnings(products) {
  const list = Array.isArray(products) ? products : [];
  const warnings = [];
  list.forEach((p) => {
    const pw = collectProductWarnings(p);
    pw.forEach((w) => warnings.push({ ...w, productId: p.id, productName: p.name }));
  });
  return warnings;
}

module.exports = { collectProductWarnings, collectProductsWarnings };
