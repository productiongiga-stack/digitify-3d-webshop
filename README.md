# NEBULOUS — Custom T-shirt Platform

Een complete custom-t-shirt webshop met designer, winkelmand, login, dashboard
en owner-beheer.

## Starten

```bash
npm install
npm start
```

Open: **http://localhost:3737**

Bij allereerste start verschijnt het OWNER-account in de console:

```
 Email:    owner@nebulous.local
 Password: Owner!2026
```

Wijzig dit wachtwoord direct via `/account`.

## Stripe Checkout (Sprint 1 stap 2)

Zet deze env vars voor betaalflow + webhook:

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export APP_BASE_URL=http://localhost:3737
```

Webhook endpoint:

`POST /api/payments/stripe/webhook`

Flow:

1. OWNER/ADMIN opent orderdetail in `/admin`.
2. Klik op **Goedkeuren + betaallink** (of **Verstuur betaallink opnieuw**).
3. Systeem maakt Stripe Checkout link + slaat payment attempt op.
4. Stripe webhook zet status naar `PAYMENT_PENDING` of `PAID`.

## E-mailnotificaties (Sprint 1 stap 3)

SMTP env vars:

```bash
export SMTP_HOST=smtp.jouwdomein.be
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER=apikey-of-user
export SMTP_PASS=secret
export SMTP_FROM="[email protected]"
```

Automatische mails:

1. `orderPlaced` bij nieuwe bestelling.
2. `paymentLink` bij goedkeuren + betaallink.
3. `paymentReceived` bij bevestigde betaling (webhook).
4. `orderStatusChanged` bij manuele statuswijziging door staff.
5. `accountApproved` bij goedkeuren van een gebruiker.

Templates zijn aanpasbaar via `config.email.templates` (in settings-config).
Testmail endpoint voor OWNER:

`POST /api/admin/email/test`

Vanaf Sprint 1 stap 4 kan OWNER dit beheren via:

`/admin` → tab **Instellingen** → sectie **E-mail instellingen**

Vanaf Sprint 1 stap 5 bevat elke template ook live **desktop + mobiel preview** in dezelfde sectie.
Vanaf Sprint 1 stap 6 toont elke template ook **versiestatus + diff (laatst opgeslagen vs concept)** en een **herstelknop**.
Vanaf Sprint 1 stap 7 zijn ook **Factuur PDF** en **Orderbon PDF** beschikbaar per order in admin, en wordt bij `PAID` de factuur als bijlage meegestuurd in de betaalbevestiging.

## Upload pipeline (Sprint 2 stap 1)

`/api/cart` gebruikt nu standaard `multipart/form-data`:

- `preview` (bestand)
- `designFiles[]` (één bestand per design)
- `product` (JSON string)
- `designs` (JSON string metadata: positie, schaal, offsets, notities)

Legacy base64 payloads blijven tijdelijk ondersteund voor backward compatibility.

## Image optimalisatie (Sprint 2 stap 2)

Bij upload in `/api/cart` worden rasterafbeeldingen nu automatisch geoptimaliseerd:

1. Auto-rotate op basis van EXIF.
2. Resize naar max `2048x2048` (zonder upscaling).
3. Re-encode naar WebP (preview kwaliteit 78, design kwaliteit 82).
4. Alleen toepassen als het resultaat kleiner is dan het origineel.

Niet-raster bestanden (zoals SVG) blijven ongewijzigd.
De order-finalisatie behoudt nu ook de juiste preview-extensie (bv. `.webp`) bij verplaatsen van cart naar order.

## Designer draft restore (Sprint 2 stap 3)

De designer bewaart nu automatisch een concept in `sessionStorage`:

1. kleur, maat, aantal, actieve stap
2. layer-instellingen (positie, schaal, offsets, notities)
3. actieve layer-selectie

Na een refresh wordt dit concept hersteld zonder data-URLs.
Bestanden zelf staan niet in `sessionStorage`, dus je ziet na restore per layer een melding om het design opnieuw te uploaden.

## Bulk order acties (Sprint 2 stap 4)

In `/admin` bij **Bestellingen**:

1. checkbox per order + "selecteer alles" op de huidige pagina
2. bulk status dropdown (`Nieuw` t/m `Geannuleerd`)
3. knop **Toepassen** om geselecteerde orders in één keer te updaten

Backend endpoint:

`PUT /api/admin/orders/bulk-status`

Dit endpoint schrijft statusgeschiedenis per order, verstuurt statusmails (of betaalbevestiging + factuur bij `PAID`), en geeft een samenvatting terug (`changed`, `skipped`, `missing`).

## Login "Onthoud mij" (Sprint 2 stap 5)

Op `/login` staat nu een toggle:

1. **Aangevinkt**: sessie-cookie met `maxAge` van 30 dagen
2. **Uitgevinkt**: sessie-cookie zonder `maxAge` (vervalt bij browser sluiten)

`POST /api/auth/login` accepteert nu ook `remember` (`true/false`).

## Verzenddrempel (Sprint 2 stap 6)

Owner kan nu in `/admin` → **Prijzen** instellen:

1. `Verzendkost (€)`
2. `Gratis verzending vanaf (€)`
3. `Gratis verzending inschakelen`

Logica:

1. Is `Gratis verzending` uit: verzendkost wordt altijd aangerekend.
2. Is `Gratis verzending` aan en drempel = `0`: verzending altijd gratis.
3. Is `Gratis verzending` aan en drempel > `0`: gratis vanaf die subtotaalwaarde.

De winkelmand toont nu correcte verzending + totaal, inclusief melding hoeveel nog ontbreekt tot gratis verzending.
Bij ordercreatie (`POST /api/orders`) wordt dezelfde server-side berekening gebruikt.

## Owner audit log (Sprint 2 stap 7)

Nieuwe audit logging voor kritieke beheeracties:

1. `CONFIG_UPDATED` (bv. basisprijs/verzendinstellingen aangepast)
2. `USER_UPDATED` (rol/status wijzigingen, incl. promoties)
3. `USER_DELETED`
4. `ORDER_STATUS_UPDATED`
5. `ORDER_BULK_STATUS_UPDATED`
6. `ORDER_PAYMENT_LINK_CREATED`

Backend:

- tabel `audit_log` (met actor, actie, entiteit, samenvatting, details-json)
- endpoint `GET /api/admin/audit` (owner-only, met zoek/filter/paginatie)

Frontend:

- nieuwe owner-tab **Audit log** in `/admin`
- zoeken op tekst + filter op actie + detailweergave per entry

## Per-account login lockout (Sprint 3 stap 1)

Login is nu beveiligd met account-based lockout (los van IP rate-limit):

1. Na **5 foutieve wachtwoordpogingen** op hetzelfde account.
2. Wordt dat account **15 minuten vergrendeld**.
3. Fouten op andere accounts worden niet meegeteld.

Technisch:

- velden op `users`: `failed_login_attempts`, `login_locked_until`, `last_failed_login_at`
- bestaande databases krijgen deze velden automatisch via startup-migratie

## 2FA voor OWNER/ADMIN (Sprint 3 stap 2)

TOTP 2FA is nu ondersteund met QR-setup via `/account`.

Loginflow:

1. Email + wachtwoord
2. Indien 2FA actief: extra stap met 6-cijferige code (`/api/auth/login/2fa`)

Staff-verplichting:

1. `OWNER` en `ADMIN` zonder actieve 2FA krijgen na login een verplichte setup-flow.
2. Zolang setup niet afgerond is, zijn staff API-calls geblokkeerd behalve de 2FA setup endpoints.

Endpoints:

- `GET /api/me/2fa/status`
- `POST /api/me/2fa/setup`
- `POST /api/me/2fa/enable`

## Restore-from-backup UI (Sprint 3 stap 3)

Owner kan nu in `/admin` → **Instellingen**:

1. backupbestand uploaden via **Herstel uit upload**
2. dubbele confirm uitvoeren (veiligheidsstap)
3. database volledig herstellen vanuit backup

Backend endpoint:

- `POST /api/admin/backup/restore` (owner-only, multipart veld `backup`)

Na succesvolle restore wordt de huidige sessie beëindigd en is opnieuw inloggen vereist.

## Upload cache + signed URLs (Sprint 3 stap 4)

Uploads ondersteunen nu:

1. Cache headers op beveiligde `/uploads/*` responses (`private`, `max-age`).
2. Tijdelijke signed links zonder login via:
   - `POST /api/uploads/sign` (auth vereist om link te genereren)
   - `GET /uploads-signed?p=...&exp=...&sig=...` (TTL + HMAC validatie)

In admin orderdetail kan je nu 24u deellinks kopiëren voor preview en designbestanden.

## GDPR data export (Sprint 3 stap 5)

Gebruikers kunnen nu in `/account` via **Download al mijn data (ZIP)** een GDPR-export downloaden.

Endpoint:

- `GET /api/me/export-data` (auth vereist)

De ZIP bevat:

1. `user/profile.json`
2. `orders/orders.json`
3. `orders/order-items.json`
4. `orders/order-designs.json`
5. `orders/order-status-history.json`
6. `orders/payments.json`
7. `cart/cart-items.json`
8. `cart/cart-designs.json`
9. `uploads/files-manifest.json`

Bij elke download wordt een audit-event `GDPR_DATA_EXPORTED` gelogd.

## Health check endpoint (Sprint 3 stap 6)

Voor uptime monitoring is er nu een publieke health endpoint:

- `GET /api/health`

Response:

1. `200` + `{ ok: true, status: "healthy", ... }` als app + database OK zijn.
2. `503` + `{ ok: false, status: "unhealthy", ... }` als database check faalt.

Handig voor StatusCake / UptimeRobot met JSON body validatie.

## Multi-product catalogus & flow polish (Sprint 3 stap 7)

De designer ondersteunt nu configureerbare producttypes per bedrijf:

1. Productkeuze in de designer (bv. T-shirt, trui, beachflag, spandoek).
2. Per product: eigen `mockupPath`, `priceMultiplier`, `extraDesignFeeMultiplier`, beschrijving.
3. Geselecteerd product wordt meegestuurd naar cart/order en blijft zichtbaar in dashboard/admin.

Owner instellingen:

1. `/admin` → **Instellingen** → sectie **Producttypes & mockups**.
2. Producten toevoegen/verwijderen, activeren/deactiveren, default instellen.
3. Mockup pad invullen (bv. `assets/beachflag.png`) voor realtime preview in designer.

Datamodel:

1. `cart_items`: `product_type`, `product_label`, `product_mockup_path`, `product_price_multiplier`
2. `order_items`: dezelfde velden, zodat productie/rapportage consistent blijft.

## Mobile-first designer polish (Sprint 4 stap 1)

Onder `700px` is de designer nu geoptimaliseerd voor mobiel:

1. Betere stacking van preview + controls met compactere spacing.
2. Grotere tap-targets voor positie, maat, quantity en actieknoppen.
3. Sticky actiebalk onderaan voor **Terug / Volgende** tijdens scrollen.
4. Compactere preview-canvas + mobiele swipe-hint.
5. Minder achtergrondpartikels op mobiele devices voor betere performance.

## Realistische custom-hex tint (Sprint 4 stap 2)

Shirtkleur gebruikt nu een realistischer tintmethode:

1. Geen hue-rotate hack meer voor custom hex.
2. Nieuwe overlaylaag met `mix-blend-mode: multiply`.
3. Overlay wordt gemaskeerd op basis van de gekozen mockup (`mockupPath`), zodat alleen het product zelf wordt ingekleurd.
4. Opaciteit wordt dynamisch afgestemd op licht/donker/saturatie voor betere resultaten in zowel dark als light UI-thema.
5. Dezelfde tintlogica wordt ook toegepast bij preview-render/export (`renderCompositeDataUrl`), zodat upload/resultaat consistent blijft.

## SEO basics + social cards (Sprint 4 stap 3)

Homepage SEO is nu bedrijfsspecifiek configureerbaar en server-side gerenderd op `/`:

1. `<title>`, `meta description`, OpenGraph (`og:title`, `og:description`, `og:image`, `og:url`) en Twitter tags worden live ingevuld vanuit config.
2. JSON-LD `Product` schema (`application/ld+json`) wordt server-side gegenereerd met merknaam, beschrijving, valuta en vanaf-prijs.
3. Owner kan deze velden beheren via `/admin` → **Instellingen** → **SEO & social**:
   - `Meta description`
   - `OG title`
   - `OG description`
   - `OG image path`
4. `og:image` ondersteunt zowel absolute URL's (`https://...`) als lokale paden (bv. `assets/tshirt_mockup.png`), die automatisch naar `APP_BASE_URL` worden omgezet.

Tip: zet `APP_BASE_URL` in productie op je echte domein zodat social previews juiste absolute links gebruiken.

## Branding & thema customization (Sprint 4 stap 4)

Owner kan nu per bedrijf de visuele stijl centraal beheren via `/admin` → **Instellingen** → **Branding & thema**:

1. `Logo symbool` (bv. ✦, ●, ◆) voor nav/footer/auth-logo.
2. `Accentkleur` + `Accent gradient kleur 2` voor CTA's, active states, gradients en ambient orbs.
3. `Heading font` + `Body font` (Space Grotesk, Inter, System, Serif).
4. `Button stijl` (`Rounded`, `Pill`, `Sharp`) met globale radius-overname.
5. `Section achtergrond` (`Subtiel`, `Vlak`, `Sterker contrast`) voor content-secties.

Technisch:

1. Frontend past deze waarden live toe via CSS-variabelen (`NEB.applyBranding` in `public/app.js`).
2. Dezelfde branding werkt op designer, auth, dashboard, cart en admin.
3. Bij thema-switch (dark/light) blijft branding actief, inclusief aangepaste contrastwaardes.

## Brand-kit assets + mail/PDF sync (Sprint 4 stap 5)

Branding gaat nu verder dan kleuren en typography:

1. Owner kan in `/admin` → **Instellingen** → **Branding & thema** een **logo** en **favicon** uploaden.
2. Uploads worden geoptimaliseerd en opgeslagen in `public/assets/branding/*` via:
   - `POST /api/admin/branding/upload` (owner-only, `kind=logo|favicon`, `asset=file`)
3. Geüploade paden worden configureerbaar via:
   - `theme.logoPath`
   - `theme.faviconPath`

Sync naar kanalen:

1. Website: nav/auth/footer logo-mark kan automatisch vervangen worden door geüpload logo; favicon wordt dynamisch gezet.
2. E-mail: alle templates krijgen een branded shell met logo/symbool, merknaam en accentkleur.
3. PDF: factuur en orderbon tonen bovenaan automatisch het geconfigureerde logo (indien beschikbaar).

Extra placeholders in e-mailtemplates:

1. `{{brandName}}`
2. `{{brandLogoUrl}}`
3. `{{brandFaviconUrl}}`
4. `{{brandAccentColor}}`

## Conversion polish checkout + productkeuze (Sprint 4 stap 6)

Flow en conversie op designer/cart zijn verder aangescherpt:

1. Productkeuze in de designer is nu visueel:
   - kaarten met mockup-preview, naam en vanaf-prijs i.p.v. enkel dropdown.
   - actieve productkaart heeft duidelijke highlight.
2. In stap 3 van de designer staat nu extra trust-microcopy:
   - eerst bestellen, daarna goedkeuring, daarna betaallink.
3. Winkelmand-checkout bevat nu een duidelijke 4-stappen checkoutflow:
   - bestelling → goedkeuring → betalen via mail → productie.
4. CTA-tekst verduidelijkt dat er op deze stap nog geen betaling gebeurt.
5. Extra trust-badges + “nog een ontwerp toevoegen” knop verhogen vertrouwen en herhaal-aankopen.

## Conversion controls & A/B-ready CTA (Sprint 4 stap 7)

Conversiecopy is nu centraal en per bedrijf instelbaar:

1. Nieuwe settings in `/admin` → **Conversie & checkout copy**:
   - CTA variant: `SOFT` of `STRONG`
   - aparte CTA-teksten voor designer stap 2/stap 3 en winkelmand
   - urgency toggle + tekst
   - social-proof toggle + tekst
   - checkout noot onder de CTA
2. Designer gebruikt deze instellingen live voor:
   - CTA-labels per stap
   - urgency/social-proof trust cards
3. Winkelmand gebruikt dezelfde instellingen voor:
   - checkout CTA label (soft/strong)
   - urgency banner
   - dynamische trustlijst + checkout note
4. Mobile checkout polish:
   - CTA in de winkelmand blijft op mobiel sticky zichtbaar tijdens scrollen.

## PDF template engine (Sprint 5 stap 1)

Factuur en orderbon zijn nu ook inhoudelijk per bedrijf aanpasbaar (niet alleen logo):

1. Nieuwe owner-sectie in `/admin` → **Bedrijf & documenten**:
   - bedrijfsgegevens (`legalName`, `invoicePrefix`, `vatNumber`, adres, support-contact)
   - factuurtemplate (titel, intro, betaaltermijn in dagen, footer, support-contact toggle)
   - orderbontemplate (titel, intro, footer, toggle om design-bestandspaden te tonen)
2. Backend valideert/sanitizet deze documentinstellingen in `PUT /api/admin/config`.
3. PDF rendering gebruikt nu die templates:
   - factuur toont betaalstatus, vervaldatum (op basis van betaaltermijn), en betaaldatum indien beschikbaar
   - orderbon respecteert `showFilePaths` voor interne/extern deelbare varianten
4. Lifecycle-koppeling blijft actief:
   - bij `PAID` wordt betaalbevestiging verstuurd met factuur-PDF als bijlage
   - admin kan per order factuur en orderbon blijven downloaden via orderdetail

## Facturatie legal/compliance polish (Sprint 5 stap 2)

De PDF-documenten zijn juridisch en boekhoudkundig verder afgewerkt:

1. Factuurnummering:
   - formaat: `PREFIX-JAAR-VOLGNUMMER` (bv. `INV-2026-000123`)
   - jaarmodus instelbaar: `ORDER_YEAR` of `ISSUE_YEAR`
   - padding instelbaar (4-10 cijfers)
2. Factuurmetadata uitgebreid:
   - factuurdatum + orderdatum
   - betalingsstatus
   - expliciete betaalmethode (bv. `Stripe Checkout`)
   - vervaldatum op basis van betaaltermijn
3. Juridische blokken:
   - vrije juridische disclaimer in factuurtemplate
   - footer + supportgegevens blijven configureerbaar
4. Klant-facturatiegegevens:
   - optionele velden in checkout: `Bedrijf` en `Klant BTW`
   - opgeslagen op orderniveau (`customer_company`, `customer_vat`)
   - zichtbaar in dashboard/admin orderdetail en meegenomen in factuur/orderbon
5. Layout:
   - factuur- en orderbonlijnen nu in strakkere tabelvorm voor productie/boekhouding.

## Factuur lifecycle + reminders (Sprint 5 stap 3)

Er is nu een automatische factuurflow en opvolging toegevoegd:

1. Factuurstatus lifecycle:
   - `CONCEPT` bij orderplaatsing
   - `DEFINITIVE` bij goedkeuren + betaallink
   - `PAID` bij bevestigde betaling (webhook of manuele status `PAID`)
   - `VOID` bij annulatie (tenzij al betaald)
2. Nieuwe `invoices` tabel (gekoppeld aan `orders`) met:
   - `invoice_number`, `issue_date`, `due_date`, `paid_at`
   - reminder-tracking (`last_reminder_at`, `reminder_count`)
3. Automatische reminder-engine:
   - verstuurt `invoiceReminder` mails voor vervallen, onbetaalde `DEFINITIVE` facturen
   - interval/max reminders per factuur instelbaar in documentconfig
   - throttle ingebouwd om spam te voorkomen
4. Admin-overzicht openstaande facturen:
   - endpoint `GET /api/admin/invoices`
   - zichtbaar in admin bestellingen (topkaart met open/overdue + laatste open facturen)
   - handmatig triggeren via `POST /api/admin/invoices/run-reminders`
5. Health endpoint toont reminder job-status in `jobs.invoiceReminders`.

## Factuurbijlage op betaallink + resend (Sprint 5 stap 4)

Payment-link communicatie is nu vollediger:

1. Bij `Goedkeuren + betaallink` wordt de `paymentLink` mail nu verstuurd met:
   - de betaallink
   - de factuurgegevens in placeholders (`invoiceNumber`, `invoiceDueDate`, `invoiceStatusLabel`)
   - de factuur-PDF als bijlage
2. `sent_at` tracking op factuur:
   - eerste succesvolle paymentLink-mail zet `invoices.sent_at`
   - resend kan deze timestamp verversen
3. Resend endpoint:
   - `POST /api/admin/invoices/:id/resend`
   - verstuurt paymentLink + factuur-PDF opnieuw naar de klant
4. Admin-overzicht openstaande facturen toont nu:
   - `Verstuurd op`
   - actieknop **Opnieuw sturen** per factuur
5. Audit:
   - `INVOICE_EMAIL_SENT` wordt gelogd bij succesvolle factuurmail.

## Factuurbadges + admin filter (Sprint 5 stap 5)

Factuuropvolging is nu zichtbaar in zowel admin als klantdashboard:

1. Orderdetail (`/admin` en `/dashboard`) toont nu een **Factuur** blok met:
   - factuurstatus badge
   - factuurnummer
   - factuurdatum
   - vervaldatum + due/overdue label
   - verstuurd op + aantal reminders
2. Orders-lijsten tonen nu ook factuurbadges:
   - open, overdue, betaald, concept, geannuleerd
3. Admin bestellingen heeft extra filter:
   - `Alle facturen`, `Factuur open`, `Factuur overdue`, `Concept`, `Definitief`, `Betaald`, `Geannuleerd`
4. Backend:
   - `/api/admin/orders` ondersteunt nu `invoiceStatus` query-filter en geeft invoice metadata per order terug
   - `/api/orders/mine` en `/api/orders/:id` geven invoice data mee voor frontend-badges.

## Bulk reminders + factuur CSV + sortering (Sprint 5 stap 6)

Factuuropvolging in admin is verder versneld:

1. Open facturenkaart heeft nu:
   - statusfilter (`open`, `overdue`, `concept`, `definitief`, `betaald`, `geannuleerd`, `alles`)
   - sortering (`vervaldatum ↑/↓`, `oudste eerst`, `bedrag hoog-laag`)
2. Bulk herinneringen:
   - checkbox-selectie op factuurregels
   - knop **Bulk herinnering** voor geselecteerde facturen
   - endpoint: `POST /api/admin/invoices/remind-bulk`
3. CSV export:
   - `CSV huidige view`, `CSV open`, `CSV overdue` knoppen in admin
   - endpoint: `GET /api/admin/invoices.csv?status=...&sort=...`
4. Backend factuurlijst (`GET /api/admin/invoices`) ondersteunt nu ook:
   - `status` incl. `OVERDUE`
   - `sort` voor opvolging op vervaldatum/ouderdom/bedrag.

## Rollen

| Rol | Wat ze kunnen |
|-----|---------------|
| `USER` | Designer + winkelmand + eigen orders + profiel |
| `ADMIN` | + Alle bestellingen beheren (status wijzigen, klantontwerpen bekijken/downloaden) |
| `OWNER` | + Klanten goedkeuren/blokkeren/rollen, winkel-instellingen, backup, CSV export |

## Klantflow

1. Ontwerp shirt in de designer
2. **"Voeg toe aan winkelmand"** — herhaal voor meerdere ontwerpen
3. Op `/cart`: aantallen aanpassen, adres invullen, afrekenen
4. Volg de status in `/dashboard` (Nieuw → Goedgekeurd → Betaling in behandeling → Betaald → In productie → Verzonden → Bezorgd)
5. Annuleer eigen order zolang die nog `NEW` is

## Security & data

- bcrypt-hash op wachtwoorden
- Rate-limit: 8 inlogpogingen per 15 min, 10 registraties per uur
- Session-secret persist in `data/.session-secret` (geen logout-storm bij restart)
- httpOnly + SameSite=lax sessie cookies
- Uploads zijn **alleen** zichtbaar voor de eigenaar van de cart/order, of staff
- SQLite WAL voor snelle reads tijdens writes

## Owner kan customizen via `/admin` → Instellingen

| Wat | Live op site |
|---|---|
| Hero badge / titels / subtitel / CTA | ja |
| Merknaam + tagline | ja |
| Basisprijs + extra-design fee + levertijd-tekst | ja |
| Gratis verzending toggle | ja |
| **Kleuren** (naam + hex + actief/inactief) | ja |
| **Maten** + meerprijs per maat (auto-gesorteerd) | ja |
| **Reviews** | ja |

## Owner-tools

- **CSV export** — alle orders met klantgegevens (`/admin` → Export CSV knop)
- **Backup downloaden** — VACUUM-snapshot van de database
- **Notificatie-badges** — rode bolletjes op admin-tabs voor nieuwe orders + pending registraties (refresh elke 30s)
- **Open homepage** — knop om live-preview van de site te checken

## Wachtwoord vergeten

```bash
node reset-password.js owner@nebulous.local NieuwWachtwoord123
# of zonder argument → genereert random:
node reset-password.js owner@nebulous.local
```

## Wat ADMIN/OWNER ziet per order

- Composite **preview-PNG** van het volledige shirt (zoals klant zag)
- Elk **origineel design-bestand** (download knop)
- Per design: positie, schaal, x/y offset, opmerkingen
- Statusgeschiedenis (timeline) — wie wat wanneer heeft gewijzigd

## Bestandsstructuur

```
T-shirt/
├── server.js              ← Express + alle API routes
├── db.js                  ← SQLite schema + helpers
├── reset-password.js      ← CLI wachtwoord reset
├── package.json
├── data/                  ← SQLite db + session secret + backups (auto-generated)
├── uploads/
│   ├── cart/<itemId>/     ← Tijdelijke cart-bestanden
│   └── orders/<orderId>/<itemId>/  ← Definitieve order-bestanden
└── public/                ← Frontend (geen build step)
    ├── index.html         ← Designer + step 1-3
    ├── login.html  register.html
    ├── dashboard.html     ← Eigen orders + timeline + cancel
    ├── cart.html          ← Winkelmand + checkout
    ├── account.html       ← Profiel + adres + wachtwoord
    ├── admin.html         ← Bestellingen / Klanten / Instellingen
    ├── style.css          ← Original NEBULOUS styling
    ├── app.css            ← App-pages styling (cards, table, timeline, cart, ...)
    ├── script.js          ← Designer logica
    ├── designer-boot.js   ← Laadt config → patcht designer DOM
    ├── app.js             ← Gedeelde client helpers (auth, nav, theme, cart)
    └── admin.js           ← Admin paneel logica
```

## Tech stack

- **Backend**: Node + Express + SQLite (better-sqlite3) + bcryptjs + express-session + express-rate-limit + multer + Stripe + Nodemailer + PDFKit
- **Frontend**: vanilla HTML/CSS/JS — geen build, geen framework
- **Auth**: httpOnly session cookies, bcrypt wachtwoorden
- **Theme**: dark/light, persistent in localStorage, op alle pagina's
