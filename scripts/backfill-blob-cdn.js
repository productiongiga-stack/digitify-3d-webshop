#!/usr/bin/env node
/**
 * Mirror public assets from PostgreSQL upload_blobs + public/assets to Vercel Blob CDN.
 *
 * Usage:
 *   node scripts/backfill-blob-cdn.js
 *   node scripts/backfill-blob-cdn.js --dry-run
 */
const path = require('path');
const { getAssetCdnBase } = require('../lib/asset-storage');
const { backfillPublicAssetsToBlob } = require('../lib/backfill-blob-cdn');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN ontbreekt');
  }
  const cdn = getAssetCdnBase();
  if (cdn) console.log('CDN base:', cdn);
  else console.warn('Waarschuwing: CDN base URL niet gezet — Blob mirror werkt wel, URLs blijven same-origin.');

  const { db, initDatabase } = require('../db');
  await initDatabase();

  const result = await backfillPublicAssetsToBlob({
    db,
    publicDir: path.join(__dirname, '..', 'public'),
    dryRun
  });
  console.log(`Klaar: ${result.mirrored} gemirrord, ${result.skipped} overgeslagen, ${result.failed} mislukt (${result.total} paden).`);
  if (result.failed > 0) {
    result.errors.forEach((row) => console.warn('ERR', row.path, row.error));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Backfill mislukt:', err.message || err);
  process.exit(1);
});
