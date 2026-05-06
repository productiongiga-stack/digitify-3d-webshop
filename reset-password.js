#!/usr/bin/env node
// Usage: node reset-password.js <email> [newPassword]
// If newPassword is omitted, a random one is generated.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const email = (process.argv[2] || '').toLowerCase();
let password = process.argv[3];

if (!email) {
  console.error('Usage: node reset-password.js <email> [newPassword]');
  process.exit(1);
}

const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
if (!user) {
  console.error(`Geen gebruiker met email "${email}"`);
  process.exit(2);
}

if (!password) {
  password = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
}

const hash = bcrypt.hashSync(password, 10);
db.prepare('UPDATE users SET password_hash = ?, status = CASE WHEN status = ? THEN ? ELSE status END WHERE id = ?')
  .run(hash, 'BLOCKED', 'ACTIVE', user.id);

console.log('========================================');
console.log(' Wachtwoord gereset');
console.log(` Email:    ${user.email}`);
console.log(` Password: ${password}`);
console.log('========================================');
