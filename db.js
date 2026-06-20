/**
 * Database adapter — async API that works with both SQLite (local) and PostgreSQL (production).
 *
 * When DATABASE_URL is set → PostgreSQL via db-pg.js
 * Otherwise → better-sqlite3 wrapped in async shims
 *
 * ALL exports are async functions. server.js must use `await` everywhere.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { inferModelFormat } = require('./lib/model3d-format');
const { sanitizePresentationFields } = require('./lib/model3d-presentation');

const USE_PG = !!String(process.env.DATABASE_URL || '').trim();
const IS_VERCEL = !!process.env.VERCEL;
const RUNTIME_ROOT = IS_VERCEL ? '/tmp' : __dirname;

// ── Database layer ────────────────────────────────────────────────────────────
let db;

if (USE_PG) {
  db = require('./db-pg');
} else {
  // Wrap better-sqlite3 synchronous API into async-compatible interface
  const Database = require('better-sqlite3');
  const DATA_DIR = path.join(RUNTIME_ROOT, 'data');
  const DB_PATH = path.join(DATA_DIR, 'nebulous.sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  db = {
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      return {
        async run(...params) { return stmt.run(...params); },
        async get(...params) { return stmt.get(...params); },
        async all(...params) { return stmt.all(...params); }
      };
    },
    async exec(sql) { return sqliteDb.exec(sql); },
    pragma(p) { return sqliteDb.pragma(p); },
    async close() { sqliteDb.close(); },
    _raw: sqliteDb   // for VACUUM etc
  };
}

async function getPgTableColumns(tableName) {
  const rows = await db.prepare(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ?
  `).all(tableName);
  return new Set(rows.map((row) => String(row.column_name || '').toLowerCase()));
}

async function getSqliteTableColumns(tableName) {
  const rows = await db.pragma(`table_info(${tableName})`);
  return new Set((rows || []).map((row) => String(row.name || '').toLowerCase()));
}

async function ensureAuditLogSchemaCompat() {
  const cols = USE_PG ? await getPgTableColumns('audit_log') : await getSqliteTableColumns('audit_log');
  if (!cols.size) return;

  const hasUserId = cols.has('user_id');
  const hasUserEmail = cols.has('user_email');
  const hasActorUserId = cols.has('actor_user_id');
  const hasActorEmail = cols.has('actor_email');

  if (USE_PG) {
    if (!hasUserId) {
      await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
    }
    if (!hasUserEmail) {
      await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT;`);
    }
    if (hasActorUserId) {
      await db.exec(`UPDATE audit_log SET user_id = COALESCE(user_id, actor_user_id) WHERE actor_user_id IS NOT NULL;`);
    }
    if (hasActorEmail) {
      await db.exec(`UPDATE audit_log SET user_email = COALESCE(user_email, actor_email) WHERE actor_email IS NOT NULL;`);
    }
    return;
  }

  if (!hasUserId) {
    await db.exec(`ALTER TABLE audit_log ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
  }
  if (!hasUserEmail) {
    await db.exec(`ALTER TABLE audit_log ADD COLUMN user_email TEXT;`);
  }
  if (hasActorUserId) {
    await db.exec(`UPDATE audit_log SET user_id = COALESCE(user_id, actor_user_id) WHERE actor_user_id IS NOT NULL;`);
  }
  if (hasActorEmail) {
    await db.exec(`UPDATE audit_log SET user_email = COALESCE(user_email, actor_email) WHERE actor_email IS NOT NULL;`);
  }
}

async function ensurePgColumn(tableName, columnName, definitionSql) {
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${definitionSql};`);
}

async function ensurePgRuntimeSchemaCompat() {
  if (!USE_PG) return;

  await db.exec(`
CREATE TABLE IF NOT EXISTS shipping_events (
  id SERIAL PRIMARY KEY,
  event_key TEXT UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT,
  status_raw TEXT,
  status_normalized TEXT,
  tracking_code TEXT,
  event_at TIMESTAMPTZ,
  payload_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposit_invoices (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  linked_final_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'DEFINITIVE',
  deposit_percentage REAL,
  deposit_amount REAL NOT NULL DEFAULT 0,
  issue_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
  `);

  const columnAdds = [
    ['cart_items', 'product_type', "TEXT NOT NULL DEFAULT 'tshirt'"],
    ['cart_items', 'product_label', "TEXT NOT NULL DEFAULT 'T-shirt'"],
    ['cart_items', 'product_mockup_path', 'TEXT'],
    ['cart_items', 'product_price_multiplier', 'REAL NOT NULL DEFAULT 1'],

    ['cart_item_designs', 'x_offset', 'REAL'],

    ['orders', 'deleted_at', 'TIMESTAMPTZ'],
    ['orders', 'deleted_by', 'INTEGER REFERENCES users(id)'],
    ['orders', 'delete_reason', 'TEXT'],
    ['orders', 'shipping_carrier', 'TEXT'],
    ['orders', 'tracking_code', 'TEXT'],
    ['orders', 'tracking_url', 'TEXT'],
    ['orders', 'shipping_status', 'TEXT'],
    ['orders', 'shipping_last_update_at', 'TIMESTAMPTZ'],

    ['order_items', 'product_label', "TEXT NOT NULL DEFAULT 'T-shirt'"],
    ['order_items', 'product_mockup_path', 'TEXT'],
    ['order_items', 'product_price_multiplier', 'REAL NOT NULL DEFAULT 1'],

    ['order_designs', 'x_offset', 'REAL'],

    ['order_status_history', 'changed_by_email', 'TEXT'],

    ['payments', 'provider_checkout_id', 'TEXT'],
    ['payments', 'payment_link_expires_at', 'TIMESTAMPTZ'],
    ['payments', 'failure_reason', 'TEXT'],
    ['payments', 'metadata', 'TEXT'],
    ['payments', 'created_by', 'INTEGER REFERENCES users(id)'],
    ['payments', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],

    ['invoices', 'finalized_at', 'TIMESTAMPTZ'],
    ['invoices', 'sent_at', 'TIMESTAMPTZ'],
    ['invoices', 'last_reminder_at', 'TIMESTAMPTZ'],
    ['invoices', 'reminder_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['invoices', 'metadata', 'TEXT'],
    ['invoices', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],

    ['email_tracking', 'first_opened_at', 'TIMESTAMPTZ'],
    ['email_tracking', 'open_count', 'INTEGER NOT NULL DEFAULT 0']
  ];

  for (const [tableName, columnName, definitionSql] of columnAdds) {
    await ensurePgColumn(tableName, columnName, definitionSql);
  }
}

// ── Schema init ───────────────────────────────────────────────────────────────
async function initDatabase() {
  if (IS_VERCEL && !USE_PG) {
    throw new Error(
      'DATABASE_URL ontbreekt op Vercel. Voeg een PostgreSQL-database toe (Neon/Vercel Postgres) en zet DATABASE_URL in Project → Settings → Environment Variables.'
    );
  }
  if (USE_PG) {
    await db.initSchema();
    await db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions(expire);
CREATE TABLE IF NOT EXISTS upload_blobs (
  path TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upload_blobs_updated_at ON upload_blobs(updated_at);
    `);
    await ensurePgRuntimeSchemaCompat();
    await ensureAuditLogSchemaCompat();
  } else {
    // SQLite schema (inline, same as original db.js)
    await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'PENDING',
  address TEXT,
  postcode TEXT,
  city TEXT,
  phone TEXT,
  company TEXT,
  vat_number TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  login_locked_until TEXT,
  last_failed_login_at TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_enabled_at TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verification_token TEXT,
  email_verification_token_expires_at TEXT,
  last_login_at TEXT,
  newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
  internal_notes TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL DEFAULT 'tshirt',
  product_label TEXT NOT NULL DEFAULT 'T-shirt',
  product_mockup_path TEXT,
  product_price_multiplier REAL NOT NULL DEFAULT 1,
  color_name TEXT, color_hex TEXT, size TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  extras_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  preview_path TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_item_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_item_id INTEGER NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  name TEXT, position TEXT, scale REAL, v_offset REAL, x_offset REAL, note TEXT, file_path TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  deleted_at TEXT,
  deleted_by INTEGER REFERENCES users(id),
  delete_reason TEXT,
  shipping_carrier TEXT,
  tracking_code TEXT,
  tracking_url TEXT,
  shipping_status TEXT,
  shipping_last_update_at TEXT,
  customer_first TEXT, customer_last TEXT, customer_email TEXT,
  customer_company TEXT, customer_vat TEXT,
  address TEXT, postcode TEXT, city TEXT, phone TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL DEFAULT 'tshirt',
  product_label TEXT NOT NULL DEFAULT 'T-shirt',
  product_mockup_path TEXT,
  product_price_multiplier REAL NOT NULL DEFAULT 1,
  color_name TEXT, color_hex TEXT, size TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  extras_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  preview_path TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS order_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  name TEXT, position TEXT, scale REAL, v_offset REAL, x_offset REAL, note TEXT, file_path TEXT
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_by_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  checkout_url TEXT,
  provider_payment_id TEXT,
  provider_checkout_id TEXT,
  payment_link_expires_at TEXT,
  paid_at TEXT,
  failure_reason TEXT,
  metadata TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'CONCEPT',
  issue_date TEXT,
  due_date TEXT,
  finalized_at TEXT,
  paid_at TEXT,
  sent_at TEXT,
  last_reminder_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  email_type TEXT NOT NULL,
  recipient TEXT,
  sent_at TEXT,
  first_opened_at TEXT,
  open_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT,
  status_raw TEXT,
  status_normalized TEXT,
  tracking_code TEXT,
  event_at TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposit_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  linked_final_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'DEFINITIVE',
  deposit_percentage REAL,
  deposit_amount REAL NOT NULL DEFAULT 0,
  issue_date TEXT,
  due_date TEXT,
  sent_at TEXT,
  paid_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upload_blobs (
  path TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON orders(shipping_status);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_email_tracking_order ON email_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_token ON email_tracking(token);
CREATE INDEX IF NOT EXISTS idx_shipping_events_order ON shipping_events(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_events_event_at ON shipping_events(event_at);
CREATE INDEX IF NOT EXISTS idx_shipping_events_carrier ON shipping_events(carrier);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_order ON deposit_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_status ON deposit_invoices(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_upload_blobs_updated_at ON upload_blobs(updated_at);
    `);
    await ensureAuditLogSchemaCompat();

    // SQLite triggers
    try {
      await db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_payments_updated_at
AFTER UPDATE ON payments FOR EACH ROW
BEGIN UPDATE payments SET updated_at = datetime('now') WHERE id = OLD.id; END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
AFTER UPDATE ON invoices FOR EACH ROW
BEGIN UPDATE invoices SET updated_at = datetime('now') WHERE id = OLD.id; END;

CREATE TRIGGER IF NOT EXISTS trg_deposit_invoices_updated_at
AFTER UPDATE ON deposit_invoices FOR EACH ROW
BEGIN UPDATE deposit_invoices SET updated_at = datetime('now') WHERE id = OLD.id; END;
      `);
    } catch (e) { /* triggers may already exist */ }
  }
}

// ── Session secret ────────────────────────────────────────────────────────────
async function getOrCreateSecret() {
  // In PG mode, prefer env var or DB-stored secret
  if (USE_PG) {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'session_secret'").get();
    if (row) return row.value;
    const s = crypto.randomBytes(48).toString('hex');
    await db.prepare("INSERT INTO settings(key, value) VALUES('session_secret', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(s);
    return s;
  }
  // SQLite mode: filesystem (writable root on serverless)
  const DATA_DIR = path.join(RUNTIME_ROOT, 'data');
  const SECRET_PATH = path.join(DATA_DIR, '.session-secret');
  try { const s = fs.readFileSync(SECRET_PATH, 'utf8').trim(); if (s) return s; } catch {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SECRET_PATH, s, { mode: 0o600 });
  return s;
}

// ── Encrypted settings (AES-256-GCM) ─────────────────────────────────────────
let _encKeyCache = null;
async function _getEncKey() {
  if (_encKeyCache) return _encKeyCache;
  const secret = await getOrCreateSecret();
  _encKeyCache = crypto.pbkdf2Sync(secret, 'nebulous-enc-salt-v1', 100000, 32, 'sha256');
  return _encKeyCache;
}

async function encryptSetting(plaintext) {
  if (!plaintext) return '';
  const key = await _getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function decryptSetting(ciphertext) {
  if (!ciphertext) return '';
  try {
    const key = await _getEncKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function getSetting(key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function setSetting(key, value) {
  await db.prepare(`INSERT INTO settings(key, value) VALUES(?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, JSON.stringify(value));
}

// ── Size sorting ──────────────────────────────────────────────────────────────
const SIZE_ORDER = ['XXS','XS','S','M','L','XL','XXL','XXXL','3XL','4XL','5XL'];
function sortSizes(sizes) {
  return [...new Set(sizes)].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

// ── DEFAULT_CONFIG ────────────────────────────────────────────────────────────
const DIGITIFY_MODEL3D = (folder, opts = {}) => ({
  enabled: true,
  format: 'glb',
  modelPath: `assets/products/digitify/${folder}/model.glb`,
  materialPath: '',
  posterPath: `assets/products/digitify/${folder}/poster.png`,
  resourceDir: `assets/products/digitify/${folder}/`,
  quality: 'high',
  scale: 1,
  rotationX: 0,
  rotationY: -8,
  rotationZ: 0,
  autoRotate: true,
  rotateSpeed: 0.42,
  lightingPreset: 'warm',
  envPreset: 'warm',
  shadows: true,
  exposure: 1,
  ...opts
});

const DEFAULT_CONFIG = {
  site: {
    wordpressUrl: 'https://digitify.be',
    shopUrl: 'https://shop.digitify.be'
  },
  brand: { name: 'Digitify', tagline: 'Partner in Digital Solutions' },
  hero: {
    badge: 'NFC · LED · Smart signage',
    title1: 'Digitify',
    title2: 'Webshop',
    subtitle: 'Ontdek NFC-tags, LED lichtbakken en smart marketingproducten. Bekijk items in 3D en bestel direct online.',
    cta: 'Bekijk producten',
    videoUrl: '',
    videoOverlayColor: '#fff9f2',
    videoOverlayOpacity: 0.35,
    videoBlurPx: 0
  },
  smtp: { host: '', port: 587, user: '', pass: '', secure: false, fromName: '', fromAddress: '' },
  pricing: {
    basePrice: 19.95, extraDesignFee: 0,
    sizeUpcharge: { STD: 0 },
    shippingCost: 4.95, shippingFree: true, shippingFreeThreshold: 75, deliveryText: '3-5 werkdagen'
  },
  checkout: { approvalMode: 'MANUAL', paymentProvider: 'STRIPE', paymentLinkExpiryHours: 24, currency: 'EUR' },
  conversion: {
    ctaVariant: 'SOFT',
    designerStep2Cta: 'Naar overzicht',
    designerStep3CtaSoft: 'Toevoegen naar winkelmand',
    designerStep3CtaStrong: 'Toevoegen naar winkelmand',
    cartCtaSoft: 'Bestelling plaatsen (nog niet betalen)',
    cartCtaStrong: 'Bestelling plaatsen',
    urgencyEnabled: false, urgencyText: 'Beperkte productiecapaciteit deze week.',
    socialProofEnabled: true, socialProofText: 'Gemiddelde goedkeuring op werkdagen: binnen 2 uur.',
    checkoutNote: 'Na goedkeuring ontvang je je beveiligde betaallink per e-mail.',
    storefrontAfterAdd: 'cart',
    cancelRefundNote: 'Je kan je bestelling annuleren zolang de status nog “Nieuw” is. Na goedkeuring of betaling gelden onze algemene voorwaarden voor restitutie.'
  },
  legal: {
    cancelRefundNote: 'Je kan je bestelling annuleren zolang de status nog “Nieuw” is. Na goedkeuring of betaling gelden onze algemene voorwaarden voor restitutie.'
  },
  company: {
    legalName: 'Digitify', invoicePrefix: 'INV', vatNumber: 'BE0685.556.507',
    address: 'Boekweitstraat 7', postcode: '9000', city: 'Gent', country: 'BE',
    supportEmail: 'contact@digitify.be', supportPhone: '+32 486 51 57 73'
  },
  documents: {
    invoice: {
      title: 'Factuur',
      intro: 'Bedankt voor je bestelling. Hieronder vind je het overzicht van je order.',
      paymentTermsDays: 0, footer: 'Bedankt voor je vertrouwen.',
      showSupportContacts: true,
      legalDisclaimer: 'Bij laattijdige betaling kunnen wettelijke nalatigheidsinteresten en invorderingskosten worden aangerekend conform de Belgische wetgeving.',
      numberYearMode: 'ORDER_YEAR', numberPadLength: 6,
      reminderEnabled: true, reminderIntervalHours: 24, reminderMaxCount: 5
    },
    packingSlip: {
      title: 'Orderbon',
      intro: 'Interne productiebon voor picking, print en verpakking.',
      footer: 'Controleer aantallen en designbestanden voor start productie.',
      showFilePaths: true
    }
  },
  email: {
    fromName: 'Digitify', fromAddress: 'contact@digitify.be', replyTo: 'contact@digitify.be',
    templates: {
      orderPlaced: {
        subject: 'We hebben je bestelling ontvangen (#{{orderId}})',
        html: '<h2>Bedankt voor je bestelling, {{customerName}}.</h2><p>We hebben order <strong>#{{orderId}}</strong> goed ontvangen.</p><p>Totaal: <strong>{{orderTotal}}</strong></p><p>Je kan de status volgen via je dashboard:</p><p><a href="{{dashboardUrl}}">Open mijn dashboard</a></p><hr /><p style="color:#666">Met vriendelijke groet,<br>{{companyName}}</p>'
      },
      paymentLink: {
        subject: 'Je order is goedgekeurd — betaal nu veilig (#{{orderId}})',
        html: '<h2>Je bestelling is goedgekeurd.</h2><p>Order <strong>#{{orderId}}</strong> staat klaar voor betaling.</p><p>Totaal te betalen: <strong>{{orderTotal}}</strong></p><p><a href="{{paymentUrl}}">Betaal nu via beveiligde betaalpagina</a></p><p>Deze link verloopt op: {{paymentExpiresAt}}</p><hr /><p style="color:#666">Vragen? Contacteer ons via {{supportEmail}}.</p>'
      },
      offerSent: {
        subject: 'Offerte voor order #{{orderId}}',
        html: '<h2>Hier is je offerte.</h2><p>Voor order <strong>#{{orderId}}</strong> vind je de offerte in bijlage.</p><p>Totaal indicatie: <strong>{{orderTotal}}</strong></p><p><a href="{{dashboardUrl}}">Open dashboard</a></p><hr /><p style="color:#666">Vragen? Contacteer ons via {{supportEmail}}.</p>'
      },
      paymentReceived: {
        subject: 'Betaling ontvangen voor order #{{orderId}}',
        html: '<h2>Betaling ontvangen, bedankt.</h2><p>We hebben je betaling voor order <strong>#{{orderId}}</strong> succesvol ontvangen.</p><p>Je bestelling gaat nu verder in productieplanning.</p><p><a href="{{dashboardUrl}}">Bekijk orderstatus</a></p><hr /><p style="color:#666">{{companyName}}</p>'
      },
      invoiceReminder: {
        subject: 'Herinnering: openstaande factuur {{invoiceNumber}} voor order #{{orderId}}',
        html: '<h2>Betalingsherinnering</h2><p>Voor order <strong>#{{orderId}}</strong> staat nog een openstaande factuur.</p><p>Factuur: <strong>{{invoiceNumber}}</strong></p><p>Vervaldatum: <strong>{{invoiceDueDate}}</strong></p><p>Openstaand bedrag: <strong>{{orderTotal}}</strong></p><p><a href="{{paymentUrl}}">Betaal nu via beveiligde betaalpagina</a></p><hr /><p style="color:#666">Voor vragen: {{supportEmail}}</p>'
      },
      orderStatusChanged: {
        subject: 'Statusupdate voor order #{{orderId}}: {{orderStatusLabel}}',
        html: '<h2>Status van je bestelling is bijgewerkt</h2><p>Order <strong>#{{orderId}}</strong> staat nu op: <strong>{{orderStatusLabel}}</strong></p><p><a href="{{dashboardUrl}}">Open dashboard</a></p><hr /><p style="color:#666">{{companyName}}</p>'
      },
      accountApproved: {
        subject: 'Je account is goedgekeurd',
        html: '<h2>Welkom bij {{companyName}}</h2><p>Je account is goedgekeurd. Je kan nu inloggen en bestellingen plaatsen.</p><p><a href="{{loginUrl}}">Inloggen</a></p>'
      },
      passwordReset: {
        subject: 'Je wachtwoord is gereset',
        html: '<h2>Wachtwoord gereset</h2><p>Er werd een nieuw wachtwoord ingesteld voor je account.</p><p>Log in en wijzig dit wachtwoord meteen in je accountinstellingen.</p><p><a href="{{loginUrl}}">Inloggen</a></p>'
      },
      emailVerification: {
        subject: 'Bevestig je e-mailadres — {{companyName}}',
        html: '<h2>Welkom bij {{companyName}}!</h2><p>Bedankt voor je registratie. Klik op de knop hieronder om je e-mailadres te bevestigen.</p><p style="text-align:center;margin:2rem 0"><a href="{{verificationUrl}}" style="display:inline-block;padding:.75rem 1.5rem;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">E-mail bevestigen</a></p><p>Of kopieer deze link in je browser:<br><small>{{verificationUrl}}</small></p><p>Deze link is 24 uur geldig.</p><hr /><p style="color:#666;font-size:.85em">Als je dit account niet hebt aangemaakt, kun je deze e-mail negeren.</p>'
      }
    }
  },
  seo: {
    metaDescription: 'Digitify webshop — NFC-tags, LED lichtbakken en smart marketingproducten met 3D preview. Bestel direct online.',
    ogTitle: 'Digitify Webshop — NFC & LED producten',
    ogDescription: 'Bekijk NFC-tags, LED lichtbakken en meer in 3D. Bestel direct via shop.digitify.be.',
    ogImagePath: 'assets/products/digitify/led-lichtbak-kabel/poster.png'
  },
  theme: {
    themePreset: 'DIGITIFY',
    themeMode: 'LIGHT',
    logoMark: '✦',
    logoPath: 'assets/branding/logo-black.png',
    faviconPath: 'assets/branding/logo-black.png',
    accentColor: '#ffaf51', accentColor2: '#e8983a',
    headingFont: 'POPPINS', bodyFont: 'POPPINS',
    buttonStyle: 'ROUNDED', sectionTone: 'MUTED',
    invoiceOpenBg: '#ffaf51', invoiceOpenText: '#0a0a0a',
    invoiceDueBg: '#e8983a', invoiceDueText: '#0a0a0a'
  },
  colors: [
    { name: 'Zwart', hex: '#0b0b0b', enabled: true },
    { name: 'Wit', hex: '#f2f2f2', enabled: true },
    { name: 'Grijs', hex: '#6b6b6b', enabled: true }
  ],
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  reviews: [
    { initials: 'MK', name: 'Maarten K.', text: 'Mijn eigen artwork op een shirt! De print is scherp en de kleuren kloppen perfect.' },
    { initials: 'SV', name: 'Sophie V.', text: 'Super makkelijk te gebruiken. Van upload naar bestelling in 2 minuten. Top kwaliteit!' },
    { initials: 'JB', name: 'Jesse B.', text: 'Al 10x gewassen, print ziet er nog steeds als nieuw uit. Besteld als cadeau, groot succes!' }
  ],
  features: [
    { title: 'NFC & smart tags', text: 'Polsbandjes, kaartjes, sleutelhangers en tafelborden voor reviews en contact' },
    { title: 'LED lichtbakken', text: 'Opvallende displays voor A3/A4 — met kabel of oplaadbaar' },
    { title: '3D preview', text: 'Bekijk geselecteerde producten interactief in 3D vóór je bestelt' },
    { title: 'Veilig betalen', text: 'Bestel online via beveiligde Stripe checkout' }
  ],
  products: [
    {
      id: 'led-lichtbak-kabel', category: '3d', name: 'LED lichtbak A3/A4 (kabel)',
      description: 'Opvallende LED lichtbak met kabelaansluiting — ideaal voor vitrines en counters.',
      mockupPath: 'assets/products/digitify/led-lichtbak-kabel/mock.png', basePrice: 49.95,
      model3d: DIGITIFY_MODEL3D('led-lichtbak-kabel'),
      isFeatured: true, isDefault: true, sortOrder: 10,
      sizes: [{ code: 'A4', widthMm: 297, heightMm: 210 }],
      colorHexes: ['#ffffff'], enabled: true
    },
    {
      id: 'led-lichtbak-oplaadbaar', category: '3d', name: 'LED lichtbak A4 (oplaadbaar)',
      description: 'Draadloze LED lichtbak met oplaadbare batterij — flexibel te plaatsen.',
      mockupPath: 'assets/products/digitify/led-lichtbak-oplaadbaar/mock.png', basePrice: 54.95,
      model3d: DIGITIFY_MODEL3D('led-lichtbak-oplaadbaar'),
      sortOrder: 20, sizes: [{ code: 'A4', widthMm: 297, heightMm: 210 }],
      colorHexes: ['#ffffff'], enabled: true
    },
    {
      id: 'nfc-polsbandjes', category: '3d', name: 'NFC polsbandjes',
      description: 'Wearable NFC-tags voor events, festivals en activaties — meerdere kleuren beschikbaar.',
      mockupPath: 'assets/products/digitify/nfc-polsbandjes/mock.png', basePrice: 19.95,
      model3d: DIGITIFY_MODEL3D('nfc-polsbandjes'),
      sortOrder: 30, sizes: [{ code: 'STD', widthMm: 250, heightMm: 25 }],
      colorHexes: ['#ffffff', '#0b0b0b', '#ffaf51'], enabled: true
    },
    {
      id: 'nfc-patroon-bord', category: '3d', name: 'NFC patroon bord',
      description: 'Tafelbord met NFC — wit of zwart, eigen design of Digitify-opmaak.',
      mockupPath: 'assets/products/digitify/nfc-patroon-bord/mock.png', basePrice: 34.95,
      model3d: DIGITIFY_MODEL3D('nfc-patroon-bord'),
      sortOrder: 40, sizes: [{ code: 'STD', widthMm: 148, heightMm: 210 }],
      colorHexes: ['#ffffff', '#0b0b0b'], enabled: true
    },
    {
      id: 'nfc-sleutelhangers', category: '3d', name: 'NFC sleutelhangers',
      description: 'Compacte RFID/NFC tokens als sleutelhanger — perfect voor loyalty en activaties.',
      mockupPath: 'assets/products/digitify/nfc-sleutelhangers/mock.png', basePrice: 9.95,
      model3d: DIGITIFY_MODEL3D('nfc-sleutelhangers'),
      sortOrder: 50, sizes: [{ code: 'STD', widthMm: 40, heightMm: 40 }],
      colorHexes: ['#ffffff', '#0b0b0b'], enabled: true
    },
    {
      id: 'nfc-review-kaartjes', category: 'standard', name: 'NFC review kaartjes',
      description: 'Kaartjes die klanten direct naar je Google review-pagina leiden.',
      mockupPath: 'assets/products/digitify/nfc-review-kaartjes/mock.png', basePrice: 12.95,
      model3d: { enabled: false },
      sortOrder: 60, sizes: [{ code: 'STD', widthMm: 85, heightMm: 55 }],
      colorHexes: ['#ffffff'], enabled: true
    },
    {
      id: 'nfc-visitekaartjes', category: 'standard', name: 'NFC visitekaartjes',
      description: 'Smart business cards — deel je contactgegevens met één tik.',
      mockupPath: 'assets/products/digitify/nfc-visitekaartjes/mock-wit.png', basePrice: 24.95,
      model3d: { enabled: false },
      sortOrder: 70, sizes: [{ code: 'STD', widthMm: 85, heightMm: 55 }],
      colorHexes: ['#ffffff', '#0b0b0b'],
      colorData: {
        '#ffffff': { mockupPath: 'assets/products/digitify/nfc-visitekaartjes/mock-wit.png' },
        '#0b0b0b': { mockupPath: 'assets/products/digitify/nfc-visitekaartjes/mock-zwart.png' }
      },
      enabled: true
    }
  ]
};

// ── sanitizeProducts (pure function, no DB) ───────────────────────────────────
function slugifyProductId(input, fallback = 'product') {
  const raw = String(input || '').trim().toLowerCase();
  const slug = raw.normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

function sanitizeProducts(products) {
  const DEFAULT_SIZE_MM = {
    XS: [460, 660], S: [480, 680], M: [520, 710], L: [560, 740], XL: [600, 770], XXL: [640, 800]
  };
  const DEFAULT_PRODUCT_SIZES_BY_ID = {
    tshirt: [
      { code: 'XS', widthMm: 460, heightMm: 660 }, { code: 'S', widthMm: 480, heightMm: 680 },
      { code: 'M', widthMm: 520, heightMm: 710 }, { code: 'L', widthMm: 560, heightMm: 740 },
      { code: 'XL', widthMm: 600, heightMm: 770 }, { code: 'XXL', widthMm: 640, heightMm: 800 }
    ],
    hoodie: [
      { code: 'XS', widthMm: 500, heightMm: 650 }, { code: 'S', widthMm: 530, heightMm: 680 },
      { code: 'M', widthMm: 560, heightMm: 710 }, { code: 'L', widthMm: 590, heightMm: 740 },
      { code: 'XL', widthMm: 620, heightMm: 770 }, { code: 'XXL', widthMm: 650, heightMm: 800 }
    ],
    beachflag: [
      { code: 'S', widthMm: 600, heightMm: 2300 }, { code: 'M', widthMm: 700, heightMm: 2900 },
      { code: 'L', widthMm: 800, heightMm: 3500 }
    ],
    banner: [
      { code: 'S', widthMm: 1000, heightMm: 700 }, { code: 'M', widthMm: 2000, heightMm: 1000 },
      { code: 'L', widthMm: 3000, heightMm: 1500 }
    ]
  };

  const parseColorHexes = (raw) => {
    const arr = Array.isArray(raw) ? raw : String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
    const out = [], seen = new Set();
    arr.forEach(v => {
      const m = /^#?[0-9a-fA-F]{6}$/.exec(String(v || '').trim());
      if (!m) return;
      const hex = ('#' + String(v).replace(/^#/, '')).toLowerCase();
      if (seen.has(hex)) return;
      seen.add(hex); out.push(hex);
    });
    return out.slice(0, 20);
  };

  const parseSizeValue = (rawValue, rawUnit) => {
    const val = Number(String(rawValue || '').replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) return 0;
    const unit = String(rawUnit || 'mm').toLowerCase();
    const mm = unit === 'cm' ? (val * 10) : val;
    return Math.min(20000, Math.max(10, Math.round(mm)));
  };

  const parseProductSizes = (raw) => {
    const out = [], seen = new Set();
    const addSize = (codeRaw, widthRaw = 0, heightRaw = 0, unit = 'mm') => {
      const code = String(codeRaw || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!code || seen.has(code)) return;
      let widthMm = parseSizeValue(widthRaw, unit);
      let heightMm = parseSizeValue(heightRaw, unit);
      if (!widthMm || !heightMm) {
        const fallback = DEFAULT_SIZE_MM[code];
        if (fallback) { widthMm = fallback[0]; heightMm = fallback[1]; }
      }
      out.push({ code, widthMm, heightMm }); seen.add(code);
    };
    if (Array.isArray(raw)) {
      raw.forEach(entry => {
        if (entry && typeof entry === 'object') {
          addSize(entry.code || entry.size, entry.widthMm || entry.width || entry.w, entry.heightMm || entry.height || entry.h, entry.unit || 'mm');
        } else if (typeof entry === 'string') {
          const m = entry.match(/^\s*([A-Za-z0-9+\-]+)\s*(?::\s*([0-9]+(?:[.,][0-9]+)?)\s*[xX×]\s*([0-9]+(?:[.,][0-9]+)?)\s*(cm|mm)?)?\s*$/i);
          if (m) addSize(m[1], m[2], m[3], m[4] || 'mm');
        }
      });
    } else if (raw != null) {
      String(raw).split(/[,\n;]+/).forEach(token => {
        const t = String(token || '').trim(); if (!t) return;
        const m = t.match(/^([A-Za-z0-9+\-]+)\s*(?::\s*([0-9]+(?:[.,][0-9]+)?)\s*[xX×]\s*([0-9]+(?:[.,][0-9]+)?)\s*(cm|mm)?)?$/i);
        if (m) addSize(m[1], m[2], m[3], m[4] || 'mm');
      });
    }
    return out.slice(0, 20);
  };
  const sanitizeAssetPath = (raw, max = 260) => {
    const value = String(raw || '').trim().replace(/^\/+/, '').slice(0, max);
    if (!value || value.includes('..') || /^(https?:|data:|javascript:)/i.test(value)) return '';
    return value;
  };
  const sanitizeModel3d = (raw) => {
    const src = raw && typeof raw === 'object' ? raw : {};
    const modelPath = sanitizeAssetPath(src.modelPath || src.path || '');
    let materialPath = sanitizeAssetPath(src.materialPath || '');
    const posterPath = sanitizeAssetPath(src.posterPath || src.poster || '');
    const scaleRaw = Number(src.scale);
    const rotationXRaw = Number(src.rotationX);
    const rotationYRaw = Number(src.rotationY);
    const rotationZRaw = Number(src.rotationZ);
    const rotateSpeedRaw = Number(src.rotateSpeed);
    const format = inferModelFormat({ format: src.format, modelPath });
    if (format !== 'obj') materialPath = '';
    const qualityRaw = String(src.quality || '').trim().toLowerCase();
    const quality = qualityRaw === 'standard' ? 'standard' : 'high';
    let resourceDir = sanitizeAssetPath(src.resourceDir || '');
    if (!resourceDir && modelPath.includes('/')) {
      resourceDir = sanitizeAssetPath(modelPath.slice(0, modelPath.lastIndexOf('/') + 1));
    }
    const presentation = sanitizePresentationFields(src, quality);
    return {
      enabled: !!modelPath && src.enabled !== false,
      format,
      modelPath,
      materialPath,
      posterPath,
      resourceDir,
      quality,
      scale: Number.isFinite(scaleRaw) ? Math.min(20, Math.max(0.01, scaleRaw)) : 1,
      rotationX: Number.isFinite(rotationXRaw) ? Math.max(-360, Math.min(360, rotationXRaw)) : 0,
      rotationY: Number.isFinite(rotationYRaw) ? Math.max(-360, Math.min(360, rotationYRaw)) : 0,
      rotationZ: Number.isFinite(rotationZRaw) ? Math.max(-360, Math.min(360, rotationZRaw)) : 0,
      autoRotate: src.autoRotate === true,
      rotateSpeed: Number.isFinite(rotateSpeedRaw) ? Math.min(3, Math.max(0, rotateSpeedRaw)) : 0.42,
      ...presentation
    };
  };

  const src = Array.isArray(products) ? products : [];
  const out = [], seen = new Set();
  src.forEach((p, idx) => {
    const idBase = slugifyProductId(p?.id || p?.name || `product-${idx + 1}`, `product-${idx + 1}`);
    if (seen.has(idBase)) return;
    seen.add(idBase);
    const name = String(p?.name || idBase).trim().slice(0, 80) || idBase;
    const description = String(p?.description || '').trim().slice(0, 240);
    const mockupPath = String(p?.mockupPath || '').trim().replace(/^\/+/, '');
    const priceMultiplierRaw = Number(p?.priceMultiplier);
    const extraFeeMultiplierRaw = Number(p?.extraDesignFeeMultiplier);
    const priceMultiplier = Number.isFinite(priceMultiplierRaw) ? Math.min(10, Math.max(0.1, priceMultiplierRaw)) : 1;
    const extraDesignFeeMultiplier = Number.isFinite(extraFeeMultiplierRaw) ? Math.min(10, Math.max(0, extraFeeMultiplierRaw)) : 1;
    const colorHexes = parseColorHexes(p?.colorHexes);
    const basePriceRaw = Number(p?.basePrice);
    const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0 ? Math.round(basePriceRaw * 100) / 100 : null;
    const extraDesignFeeRaw = Number(p?.extraDesignFee);
    const extraDesignFee = Number.isFinite(extraDesignFeeRaw) && extraDesignFeeRaw >= 0 ? Math.round(extraDesignFeeRaw * 100) / 100 : null;
    const colorPrices = {};
    if (p?.colorPrices && typeof p.colorPrices === 'object') {
      Object.entries(p.colorPrices).forEach(([hex, val]) => {
        const h = ('#' + String(hex).replace(/^#/, '')).toLowerCase();
        const v = Number(val);
        if (/^#[0-9a-f]{6}$/.test(h) && Number.isFinite(v)) colorPrices[h] = Math.round(v * 100) / 100;
      });
    }
    const sizePrices = {};
    if (p?.sizePrices && typeof p.sizePrices === 'object') {
      Object.entries(p.sizePrices).forEach(([size, val]) => {
        const v = Number(val);
        if (size && Number.isFinite(v)) sizePrices[String(size).toUpperCase()] = Math.round(v * 100) / 100;
      });
    }
    const colorData = {};
    if (p?.colorData && typeof p.colorData === 'object') {
      Object.entries(p.colorData).forEach(([hex, data]) => {
        if (!data || typeof data !== 'object') return;
        const h = ('#' + String(hex).replace(/^#/, '')).toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(h)) return;
        colorData[h] = {
          mockupPath: String(data.mockupPath || '').trim().replace(/^\/+/, ''),
          priceUpcharge: Math.round((Number(data.priceUpcharge) || 0) * 100) / 100
        };
      });
    }
    let sizes = parseProductSizes(p?.sizes || p?.sizeSpecs);
    if (!sizes.length) {
      const builtIn = DEFAULT_PRODUCT_SIZES_BY_ID[idBase];
      if (builtIn?.length) sizes = builtIn.map(s => ({ ...s }));
      else sizes = [{ code: 'STD', widthMm: 100, heightMm: 100 }];
    }
    const model3d = sanitizeModel3d(p?.model3d);
    let category = String(p?.category || '').trim().toLowerCase();
    if (category !== '3d' && category !== 'standard') {
      category = model3d.enabled ? '3d' : 'standard';
    }
    out.push({
      id: idBase, name, description, mockupPath: mockupPath || 'assets/tshirt_mockup.png',
      basePrice, extraDesignFee, priceMultiplier, extraDesignFeeMultiplier,
      model3d, category,
      colorPrices, sizePrices, colorData,
      sortOrder: Number.isFinite(Number(p?.sortOrder)) ? Math.max(0, Math.min(9999, Math.round(Number(p.sortOrder)))) : ((idx + 1) * 10),
      sizes, colorHexes, enabled: p?.enabled !== false, isDefault: !!p?.isDefault, isFeatured: !!p?.isFeatured
    });
  });
  const enabled = out.filter(p => p.enabled);
  if (!enabled.length) return [{ ...DEFAULT_CONFIG.products[0] }];
  let defaultIdx = out.findIndex(p => p.enabled && p.isDefault);
  if (defaultIdx < 0) defaultIdx = out.findIndex(p => p.enabled);
  out.forEach((p, idx) => { p.isDefault = idx === defaultIdx; });
  let featuredIdx = out.findIndex(p => p.enabled && p.isFeatured);
  if (featuredIdx < 0) featuredIdx = defaultIdx;
  out.forEach((p, idx) => { p.isFeatured = idx === featuredIdx; });
  return out.sort((a, b) => {
    const aO = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
    const bO = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
    if (aO !== bO) return aO - bO;
    return String(a.name || '').localeCompare(String(b.name || ''), 'nl');
  });
}

// ── Config ────────────────────────────────────────────────────────────────────
async function ensureConfig() {
  const existing = await getSetting('config');
  if (existing == null) await setSetting('config', DEFAULT_CONFIG);
}

async function getConfig() {
  await ensureConfig();
  const stored = (await getSetting('config')) || {};
  const merged = { ...DEFAULT_CONFIG, ...stored };
  merged.brand = { ...(DEFAULT_CONFIG.brand || {}), ...(stored.brand || {}) };
  merged.hero = { ...(DEFAULT_CONFIG.hero || {}), ...(stored.hero || {}) };
  merged.smtp = { ...(DEFAULT_CONFIG.smtp || {}), ...(stored.smtp || {}) };
  merged.checkout = { ...(DEFAULT_CONFIG.checkout || {}), ...(stored.checkout || {}) };
  merged.theme = { ...(DEFAULT_CONFIG.theme || {}), ...(stored.theme || {}) };
  merged.pricing = { ...(DEFAULT_CONFIG.pricing || {}), ...(stored.pricing || {}) };
  merged.pricing.sizeUpcharge = { ...(DEFAULT_CONFIG.pricing?.sizeUpcharge || {}), ...((stored.pricing && stored.pricing.sizeUpcharge) || {}) };
  merged.conversion = { ...(DEFAULT_CONFIG.conversion || {}), ...(stored.conversion || {}) };
  if (merged.conversion.designerStep3CtaSoft === 'Toevoegen zonder betaling' || merged.conversion.designerStep3CtaSoft === 'Toevoegen aan winkelmand') {
    merged.conversion.designerStep3CtaSoft = 'Toevoegen naar winkelmand';
  }
  if (merged.conversion.designerStep3CtaStrong === 'Reserveer productieplek' || merged.conversion.designerStep3CtaStrong === 'Toevoegen aan winkelmand') {
    merged.conversion.designerStep3CtaStrong = 'Toevoegen naar winkelmand';
  }
  if (merged.conversion.cartCtaStrong === 'Reserveer nu je productieplek') {
    merged.conversion.cartCtaStrong = 'Bestelling plaatsen';
  }
  merged.company = { ...(DEFAULT_CONFIG.company || {}), ...(stored.company || {}) };
  merged.documents = { ...(DEFAULT_CONFIG.documents || {}), ...(stored.documents || {}) };
  merged.documents.invoice = { ...(DEFAULT_CONFIG.documents?.invoice || {}), ...(stored.documents?.invoice || {}) };
  merged.documents.packingSlip = { ...(DEFAULT_CONFIG.documents?.packingSlip || {}), ...(stored.documents?.packingSlip || {}) };
  merged.email = { ...(DEFAULT_CONFIG.email || {}), ...(stored.email || {}) };
  merged.email.templates = { ...(DEFAULT_CONFIG.email?.templates || {}), ...((stored.email && stored.email.templates) || {}) };
  if (Array.isArray(merged.sizes)) merged.sizes = sortSizes(merged.sizes);
  merged.products = sanitizeProducts(merged.products);
  merged.site = { ...(DEFAULT_CONFIG.site || {}), ...(stored.site || {}) };
  return merged;
}

// ── Ensure OWNER ──────────────────────────────────────────────────────────────
async function ensureOwner() {
  const exists = await db.prepare("SELECT id FROM users WHERE role = 'OWNER' LIMIT 1").get();
  if (exists) return null;
  const email = String(process.env.OWNER_EMAIL || 'owner@nebulous.local').trim().toLowerCase();
  const password = String(process.env.OWNER_PASSWORD || 'Owner!2026');
  const firstName = String(process.env.OWNER_FIRST_NAME || 'Owner').trim().slice(0, 80) || 'Owner';
  const lastName = String(process.env.OWNER_LAST_NAME || 'Digitify').trim().slice(0, 80) || 'Digitify';
  const hash = bcrypt.hashSync(password, 10);
  await db.prepare(`INSERT INTO users(email, password_hash, first_name, last_name, role, status, email_verified)
              VALUES(?, ?, ?, ?, 'OWNER', 'ACTIVE', 1)`)
    .run(email, hash, firstName, lastName);
  return { email, password };
}

module.exports = {
  db,
  getConfig, setSetting, getSetting,
  ensureOwner, ensureConfig,
  getOrCreateSecret,
  encryptSetting, decryptSetting,
  sortSizes,
  DEFAULT_CONFIG,
  initDatabase,
  sanitizeProducts,
  USE_PG,
  pragma: () => {} // no-op for compat
};
