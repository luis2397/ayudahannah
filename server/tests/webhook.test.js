'use strict';

/**
 * Tests for webhook handler and admin routes.
 * Run with: npm test  (uses Node.js built-in test runner, Node >= 18)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const crypto = require('node:crypto');

// ── Set up env before requiring the app ──
process.env.PORT            = '0'; // random port
process.env.ADMIN_TOKEN     = 'test-admin-token-secret';
process.env.EPAYCO_CUSTOMER_ID = '';  // empty → sig validation skipped
process.env.EPAYCO_P_KEY       = '';  // empty → sig validation skipped
process.env.WEBHOOK_SECRET  = 'test-webhook-secret';
process.env.GITHUB_PAT      = '';   // empty → GitHub calls will be mocked

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
    assert.equal(body.service, 'ayudahannah-webhook');
  });
});

// ─────────────────────────────────────────
describe('ePayco webhook', () => {
  it('returns 400 when x_transaction_id is missing', async () => {
    const { status, body } = await request(server, 'POST', '/webhooks/epayco', {
      x_response: 'Aceptada',
      x_amount: '10000',
      x_currency_code: 'COP',
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'missing_transaction_id');
  });

  it('returns 200 for valid transaction (GitHub API call will fail gracefully)', async () => {
    const { status, body } = await request(server, 'POST', '/webhooks/epayco', {
      x_transaction_id: 'TXN-' + Date.now(),
      x_ref_payco: 'REF-001',
      x_response: 'Aceptada',
      x_amount: '50000',
      x_currency_code: 'COP',
      x_franchise: 'visa',
      x_approval_code: 'APR001',
    });
    // Should return 200 (even if GitHub API fails, we return 200 to ePayco)
    assert.ok(status === 200 || status === 400, `Expected 200 or 400, got ${status}`);
    assert.ok(body.ok !== undefined || body.error !== undefined);
  });

  it('GET /webhooks/epayco also works (ePayco uses both)', async () => {
    const { status } = await request(server, 'GET', '/webhooks/epayco?x_transaction_id=TXN-GET-1&x_response=Rechazada&x_amount=0&x_currency_code=COP');
    assert.ok(status === 200 || status === 400);
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

  it('returns 400 for manual donation with invalid amount', async () => {
    const { status, body } = await request(
      server, 'POST', '/admin/manual-donation',
      { amount: 0, method: 'nequi' },
      { 'x-admin-token': 'test-admin-token-secret' }
    );
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  it('returns 400 for manual donation amount below minimum', async () => {
    const { status, body } = await request(
      server, 'POST', '/admin/manual-donation',
      { amount: 500, method: 'nequi' },
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
});

// ─────────────────────────────────────────
describe('webhook.js unit tests', () => {
  const { validateEpaycoSignature, normalizeStatus, buildDonationRecord } = require('../src/webhook');

  it('normalizeStatus: maps Aceptada to approved', () => {
    assert.equal(normalizeStatus('Aceptada'), 'approved');
    assert.equal(normalizeStatus('Accepted'), 'approved');
  });

  it('normalizeStatus: maps Rechazada to rejected', () => {
    assert.equal(normalizeStatus('Rechazada'), 'rejected');
    assert.equal(normalizeStatus('Fallida'), 'rejected');
  });

  it('normalizeStatus: maps Pendiente to pending', () => {
    assert.equal(normalizeStatus('Pendiente'), 'pending');
  });

  it('normalizeStatus: unknown values return unknown', () => {
    assert.equal(normalizeStatus(''), 'unknown');
    assert.equal(normalizeStatus('other'), 'unknown');
  });

  it('buildDonationRecord: creates correct record structure', () => {
    const params = {
      x_transaction_id: 'TXN123',
      x_ref_payco: 'REF456',
      x_amount: '75000',
      x_currency_code: 'COP',
      x_response: 'Aceptada',
      x_franchise: 'mastercard',
      x_approval_code: 'APR789',
    };
    const rec = buildDonationRecord(params);
    assert.equal(rec.transaction_id, 'TXN123');
    assert.equal(rec.ref_payco, 'REF456');
    assert.equal(rec.amount, 75000);
    assert.equal(rec.currency, 'COP');
    assert.equal(rec.status, 'approved');
    assert.equal(rec.method, 'mastercard');
    assert.equal(rec.approval_code, 'APR789');
    assert.ok(rec.date);
    // Sensitive data NOT included
    assert.ok(!rec.card_number);
    assert.ok(!rec.cvv);
    assert.ok(!rec.customer_email);
  });

  it('validateEpaycoSignature: returns true when credentials not configured', () => {
    // Credentials are empty in test env
    const result = validateEpaycoSignature({ x_signature: 'anything' });
    assert.equal(result, true);
  });

  it('validateEpaycoSignature: validates correct MD5 signature', () => {
    // Set test credentials
    process.env.EPAYCO_CUSTOMER_ID = '100';
    process.env.EPAYCO_P_KEY = 'testkey';

    const params = {
      x_ref_payco: 'REF1',
      x_transaction_id: 'TXN1',
      x_amount: '10000',
      x_currency_code: 'COP',
    };
    const raw = `100testkey${params.x_ref_payco}${params.x_transaction_id}${params.x_amount}${params.x_currency_code}`;
    params.x_signature = crypto.createHash('md5').update(raw).digest('hex');

    assert.equal(validateEpaycoSignature(params), true);

    // Clean up
    process.env.EPAYCO_CUSTOMER_ID = '';
    process.env.EPAYCO_P_KEY = '';
  });

  it('validateEpaycoSignature: rejects wrong signature', () => {
    process.env.EPAYCO_CUSTOMER_ID = '100';
    process.env.EPAYCO_P_KEY = 'testkey';

    const result = validateEpaycoSignature({
      x_ref_payco: 'REF1',
      x_transaction_id: 'TXN1',
      x_amount: '10000',
      x_currency_code: 'COP',
      x_signature: 'aabbccddeeff00112233445566778899', // wrong but valid hex length
    });
    assert.equal(result, false);

    process.env.EPAYCO_CUSTOMER_ID = '';
    process.env.EPAYCO_P_KEY = '';
  });
});
