# NEBULOUS — Deployment

## Lokaal (ontwikkeling)

```bash
npm install
npm start
```

- Database: SQLite in `data/` (automatisch aangemaakt).
- Uploads: `uploads/` en `public/assets/products/3d/` op schijf.
- Geen `DATABASE_URL` nodig.

## Productie (aanbevolen)

### Database

Zet `DATABASE_URL` naar een PostgreSQL-instance (Neon, Vercel Postgres, …).  
Bij startup kiest [db.js](../db.js) automatisch Postgres wanneer `DATABASE_URL` gezet is.

Sessies: gebruik `connect-pg-simple` (al in dependencies) met dezelfde pool.

### Bestanden (belangrijk op Vercel)

Serverless filesystem is **ephemeral**. Bewaar persistent:

| Pad | Oplossing |
|-----|-----------|
| `uploads/` | Vercel Blob, S3, of externe disk |
| `assets/products/3d/` | Zelfde storage + CDN |
| `data/` (SQLite) | Alleen lokaal — productie → Postgres |

Configureer `APP_BASE_URL` op je productiedomein (SEO, mails, Stripe redirects).

### Persistente assets + CDN

Bij elke write onder `assets/` spiegelt de server optioneel naar **Vercel Blob** en levert URLs via één resolver (`lib/asset-storage.js` + `public/asset-url.js`).

| Variabele | Doel |
|-----------|------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob mirror (aanbevolen op Vercel) |
| `ASSET_CDN_BASE` of `PUBLIC_ASSET_CDN` | Expliciete CDN-origin (bv. `https://cdn.jouwdomein.be`) |
| `BLOB_PUBLIC_BASE_URL` | Publieke Blob-store URL (fallback CDN-base) |

`GET /api/config` bevat `platform.assetCdnBase`, `platform.assetStorage` en `platform.assetUrlMode` voor storefront/admin.

Na deploy: controleer `GET /api/health` → `checks.storage` en `checks.sample3d`.

### Omgevingsvariabelen

| Variabele | Doel |
|-----------|------|
| `DATABASE_URL` | Postgres (productie) |
| `APP_BASE_URL` | Absolute URLs |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Betalingen |
| `SMTP_*` | E-mail |
| `SESSION_SECRET` | Optioneel; anders `data/.session-secret` |
| `SENTRY_DSN` | Optioneel: 3D/client-fouten + server 500s |
| `BLOB_READ_WRITE_TOKEN` | Persistente product/branding assets |

### Health & monitoring

- `GET /api/health` — database, storage, sample 3D-model, SMTP/Stripe presence.
- Client 3D-fouten: `POST /api/client-log` (rate-limited) → console + optioneel Sentry.
- Admin: `GET /api/admin/ops/client-log-stats` — blob/load-fouten laatste 24u.

### Achtergrondjobs

Factuurherinneringen (`processInvoiceRemindersSafe`) draaien bij health-check traffic. Op productie: plan een **cron** (bv. elke 15 min) die `GET /api/health` aanroept, zodat reminders niet alleen bij bezoekers draaien.

### Admin checklist

In **Instellingen → E-mail** staat de integratie-checklist:

- SMTP, Stripe, health
- 3D-catalogus (posters compleet)
- Client-log blob-fouten (24u)

Bulk posters (van mockup): `POST /api/admin/products/bulk-ensure-posters`.

## Vercel

[vercel.json](../vercel.json) routeert dynamische requests naar `api/index.js` en statische assets naar `public/`.

Na deploy:

1. Zet `DATABASE_URL`, `APP_BASE_URL`, `BLOB_READ_WRITE_TOKEN` (of `ASSET_CDN_BASE`).
2. Upload 3D-modellen via admin; controleer dat `/assets/products/3d/...` via CDN bereikbaar blijft na redeploy.
3. Run integratie-checklist in admin.
