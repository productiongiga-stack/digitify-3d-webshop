const { product3dAssetUpload, handleProduct3dAssetUpload } = require('../lib/product-3d-upload');
const { findProductsMissingPoster } = require('../lib/product-poster-policy');
const { normalizeProductPosterBuffer } = require('../lib/product-poster-image');

function registerProduct3dRoutes(app, deps) {
  const {
    requireAuth,
    requireRole,
    writePublicAsset,
    readStoredUpload,
    logAuditFromReq,
    getConfig,
    setSetting,
    uploadDir
  } = deps;

  app.post('/api/admin/products/3d-assets', requireAuth, requireRole('OWNER', 'ADMIN'), product3dAssetUpload.fields([
    { name: 'model', maxCount: 1 },
    { name: 'material', maxCount: 1 },
    { name: 'poster', maxCount: 1 },
    { name: 'resources', maxCount: 20 }
  ]), async (req, res) => {
    try {
      const out = await handleProduct3dAssetUpload(req, {
        writePublicAsset,
        logAuditFromReq,
        uploadDir
      });
      res.json({ ok: true, model3d: out });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || '3D asset upload mislukt' });
    }
  });

  app.get('/api/admin/products/3d-poster-gaps', requireAuth, requireRole('OWNER', 'ADMIN'), async (_req, res) => {
    const cfg = await getConfig();
    const missing = findProductsMissingPoster(cfg?.products || []);
    res.json({ ok: true, count: missing.length, products: missing });
  });

  app.post('/api/admin/products/bulk-ensure-posters', requireAuth, requireRole('OWNER', 'ADMIN'), async (req, res) => {
    try {
      const cfg = await getConfig();
      const products = Array.isArray(cfg.products) ? [...cfg.products] : [];
      const missing = findProductsMissingPoster(products);
      if (!missing.length) {
        return res.json({ ok: true, updated: [], message: 'Alle 3D-producten hebben al een poster.' });
      }

      const onlyIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map((id) => String(id).trim().toLowerCase()) : null;
      const updated = [];

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const pid = String(p?.id || '').trim().toLowerCase();
        if (onlyIds?.length && !onlyIds.includes(pid)) continue;
        const gap = missing.find((m) => m.productId === pid);
        if (!gap) continue;

        const sourceRel = String(p.mockupPath || 'assets/tshirt_mockup.png').replace(/^\/+/, '');
        const source = await readStoredUpload(sourceRel);
        if (!source?.buffer?.length) continue;

        const suffix = Date.now();
        const posterPath = `assets/products/3d/${pid}/poster-bulk-${suffix}.webp`;
        const optimized = await normalizeProductPosterBuffer(source.buffer);
        await writePublicAsset(posterPath, optimized, 'image/webp');
        products[i] = {
          ...p,
          model3d: { ...(p.model3d || {}), posterPath }
        };
        updated.push({ productId: pid, posterPath, source: sourceRel });
      }

      if (updated.length) {
        await setSetting('config', { ...cfg, products });
        await logAuditFromReq(req, {
          action: 'CONFIG_UPDATED',
          entityType: 'config',
          entityId: 'main',
          summary: 'Bulk posters gegenereerd voor 3D-producten',
          details: { count: updated.length, products: updated.map((u) => u.productId) }
        });
      }

      res.json({ ok: true, updated, remaining: findProductsMissingPoster(products).length });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bulk poster mislukt' });
    }
  });
}

module.exports = { registerProduct3dRoutes };
