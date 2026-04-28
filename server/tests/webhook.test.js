'use strict';

/**
 * Tests for server routes and helpers.
 * Run with: npm test  (uses Node.js built-in test runner, Node >= 18)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');

// ── Set up env before requiring the app ──
process.env.PORT        = '0'; // random port
process.env.ADMIN_TOKEN = 'test-admin-token-secret';
process.env.GITHUB_PAT  = '';  // empty → GitHub calls will be mocked

const app = require('../src/index');

// ── Simple HTTP helper ──
function request(server, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let server;

before(() => new Promise(resolve => {
  server = app.listen(0, '127.0.0.1', resolve);
}));

after(() => new Promise(resolve => server.close(resolve)));

// ─────────────────────────────────────────
describe('Health check', () => {
  it('GET /health returns ok:true', async () => {
    const { status, body } = await request(server, 'GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'ayudahannah-server');
  });
});

// ─────────────────────────────────────────
describe('POST /donations/register', () => {
  it('returns 400 when donor_name is missing', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_phone: '3001234567',
      method: 'nequi',
      amount: 50000,
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes('donor_name'));
  });

  it('returns 400 when donor_phone is invalid', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_name: 'Ana López',
      donor_phone: 'abc',
      method: 'nequi',
      amount: 50000,
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes('donor_phone'));
  });

  it('returns 400 when method is not nequi or daviplata', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_name: 'Ana López',
      donor_phone: '3001234567',
      method: 'epayco',
      amount: 50000,
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes('method'));
  });

  it('returns 400 when amount is below minimum (1000 COP)', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_name: 'Ana López',
      donor_phone: '3001234567',
      method: 'nequi',
      amount: 500,
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes('amount'));
  });

  it('returns 400 when amount is missing', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_name: 'Ana López',
      donor_phone: '3001234567',
      method: 'daviplata',
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes('amount'));
  });

  it('returns 200 or 500 for valid payload (GitHub call will fail without PAT)', async () => {
    const { status, body } = await request(server, 'POST', '/donations/register', {
      donor_name: 'Juan Pérez',
      donor_phone: '3154694934',
      method: 'nequi',
      amount: 50000,
    });
    // 200 = success, 500 = GitHub not configured (expected in test env)
    assert.ok(status === 200 || status === 500, `Expected 200 or 500, got ${status}`);
    if (status === 200) {
      assert.equal(body.ok, true);
      assert.ok(body.transaction_id);
    }
  });
});

// ─────────────────────────────────────────
describe('Admin endpoints', () => {
  it('returns 401 without token', async () => {
    const { status } = await request(server, 'POST', '/admin/confirm', { transaction_id: 'X' });
    assert.equal(status, 401);
  });

  it('returns 403 with wrong token', async () => {
    const { status } = await request(
      server, 'POST', '/admin/confirm',
      { transaction_id: 'X' },
      { 'x-admin-token': 'wrong-token' }
    );
    assert.equal(status, 403);
  });

  it('returns 400 with correct token but missing transaction_id', async () => {
    const { status, body } = await request(
      server, 'POST', '/admin/confirm',
      {},
      { 'x-admin-token': 'test-admin-token-secret' }
    );
    assert.equal(status, 400);
    assert.ok(body.error);
  });
});

// ─────────────────────────────────────────
describe('404 handler', () => {
  it('returns 404 for unknown route', async () => {
    const { status, body } = await request(server, 'GET', '/nonexistent');
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  it('old webhook route no longer exists', async () => {
    const { status } = await request(server, 'POST', '/webhooks/epayco', {});
    assert.equal(status, 404);
  });
});

// ─────────────────────────────────────────
describe('webhook.js unit tests', () => {
  const { normalizeStatus, buildDonationRecord } = require('../src/webhook');

  it('normalizeStatus: maps aprobada/approved to approved', () => {
    assert.equal(normalizeStatus('approved'), 'approved');
    assert.equal(normalizeStatus('aprobada'), 'approved');
    assert.equal(normalizeStatus('aceptada'), 'approved');
  });

  it('normalizeStatus: maps rejected variants to rejected', () => {
    assert.equal(normalizeStatus('rejected'), 'rejected');
    assert.equal(normalizeStatus('rechazada'), 'rejected');
    assert.equal(normalizeStatus('fallida'), 'rejected');
  });

  it('normalizeStatus: maps pending variants to pending', () => {
    assert.equal(normalizeStatus('pending'), 'pending');
    assert.equal(normalizeStatus('pendiente'), 'pending');
  });

  it('normalizeStatus: maps manual to manual', () => {
    assert.equal(normalizeStatus('manual'), 'manual');
  });

  it('normalizeStatus: unknown values return unknown', () => {
    assert.equal(normalizeStatus(''), 'unknown');
    assert.equal(normalizeStatus('other'), 'unknown');
  });

  it('buildDonationRecord: creates correct record with status pending', () => {
    const params = {
      donor_name: 'María García',
      donor_phone: '3001234567',
      method: 'nequi',
      amount: '75000',
    };
    const rec = buildDonationRecord(params);
    assert.ok(rec.transaction_id.startsWith('DON-'));
    assert.equal(rec.amount, 75000);
    assert.equal(rec.currency, 'COP');
    assert.equal(rec.status, 'pending');
    assert.equal(rec.method, 'nequi');
    assert.equal(rec.donor_name, 'María García');
    assert.equal(rec.donor_phone, '3001234567');
    assert.ok(rec.date);
    // Sensitive data NOT included
    assert.ok(!rec.card_number);
    assert.ok(!rec.cvv);
    assert.ok(!rec.customer_email);
  });

  it('buildDonationRecord: strips non-digits from phone', () => {
    const rec = buildDonationRecord({
      donor_name: 'Test',
      donor_phone: '315-469-4934',
      method: 'daviplata',
      amount: 10000,
    });
    assert.equal(rec.donor_phone, '3154694934');
  });

  it('buildDonationRecord: truncates long donor_name to 80 chars', () => {
    const longName = 'A'.repeat(100);
    const rec = buildDonationRecord({ donor_name: longName, donor_phone: '3001234567', method: 'nequi', amount: 5000 });
    assert.ok(rec.donor_name.length <= 80);
  });
});
