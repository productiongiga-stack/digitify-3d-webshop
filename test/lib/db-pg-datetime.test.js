const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { convertDatetime } = require('../../db-pg');

describe('convertDatetime', () => {
  it('converts datetime(now) with bound interval parameter', () => {
    const sql = `datetime(i.last_reminder_at) <= datetime('now', ?)`;
    const out = convertDatetime(sql);
    assert.match(out, /i\.last_reminder_at::timestamptz/);
    assert.match(out, /NOW\(\) \+ \(\?::interval\)/);
    assert.doesNotMatch(out, /'now', \?::timestamptz/);
  });

  it('converts datetime(now) without parameters', () => {
    const out = convertDatetime(`datetime('now')`);
    assert.equal(out, 'NOW()');
  });

  it('converts datetime column references', () => {
    const out = convertDatetime(`datetime(i.due_date) <= datetime('now')`);
    assert.match(out, /i\.due_date::timestamptz/);
    assert.match(out, /<= NOW\(\)/);
  });
});
