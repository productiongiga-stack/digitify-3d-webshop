# Digitify 3D Webshop — deployment

Production target: **https://shop.digitify.be**

## GitHub

Repository: `productiongiga-stack/digitify-3d-webshop`

## Vercel project setup

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Other** (Node serverless via `api/index.js`).
3. Add environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Vercel Postgres or Neon connection string |
| `APP_BASE_URL` | Yes | `https://shop.digitify.be` |
| `SESSION_SECRET` | Yes | Random 32+ char string |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob for GLB/product assets |
| `OWNER_EMAIL` | Yes | Admin login |
| `OWNER_PASSWORD` | Yes | Admin password (change after first login) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe webhook `https://shop.digitify.be/api/stripe/webhook` |

4. Run Postgres schema: apply `schema.sql` to the production database.
5. After first deploy, run locally against production DB (or use a one-off script):

```bash
DATABASE_URL="postgres://..." FORCE_PRODUCTS=1 npm run seed:catalog
```

6. Verify: `GET https://shop.digitify.be/api/health`

## DNS

At your `digitify.be` DNS provider:

```
shop  CNAME  cname.vercel-dns.com
```

Then add `shop.digitify.be` as a custom domain in the Vercel project.

## WordPress theme link

In WordPress: **Appearance → Customize → Digitify Webshop**

- Webshop URL: `https://shop.digitify.be`
- Enable nav link + homepage 3D block

## Local development

```bash
npm install
npm run seed:catalog
npm start
# http://localhost:3737
```
