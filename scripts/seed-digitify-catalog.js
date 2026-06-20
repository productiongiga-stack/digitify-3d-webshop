#!/usr/bin/env node
/**
 * Seed Digitify product catalog into local SQLite or PostgreSQL.
 * Usage: node scripts/seed-digitify-catalog.js
 * Force merge products only: FORCE_PRODUCTS=1 node scripts/seed-digitify-catalog.js
 */
const { DEFAULT_CONFIG, setSetting, getSetting, initDatabase } = require('../db');

async function main() {
  await initDatabase();
  const forceProducts = String(process.env.FORCE_PRODUCTS || '').trim() === '1';
  const existing = await getSetting('config');

  if (existing && forceProducts) {
    const merged = { ...existing, ...DEFAULT_CONFIG, products: DEFAULT_CONFIG.products };
    merged.brand = { ...(existing.brand || {}), ...(DEFAULT_CONFIG.brand || {}) };
    merged.theme = { ...(existing.theme || {}), ...(DEFAULT_CONFIG.theme || {}) };
    merged.site = { ...(existing.site || {}), ...(DEFAULT_CONFIG.site || {}) };
    await setSetting('config', merged);
    console.log('Productcatalogus bijgewerkt:', DEFAULT_CONFIG.products.length, 'producten');
    return;
  }

  await setSetting('config', DEFAULT_CONFIG);
  console.log('Digitify catalogus geïnstalleerd:', DEFAULT_CONFIG.products.length, 'producten');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
