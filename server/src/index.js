'use strict';

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const { buildDonationRecord } = require('./webhook');
const { persistDonation } = require('./github');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Body parsers ──
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── Security headers ──
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Allow GitHub Pages to call endpoints
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

// ── Health check ──
app.get('/health', (_req, res) => res.json({ ok: true, service: 'ayudahannah-server' }));

// ══════════════════════════════════════════
// Public: register a donor's consignment
// POST /donations/register
// ══════════════════════════════════════════
app.post('/donations/register', async (req, res) => {
  const { donor_name, donor_phone, method, amount } = req.body;

  // ── Validate required fields ──
  if (!donor_name || !String(donor_name).trim()) {
    return res.status(400).json({ error: 'donor_name is required' });
  }
  if (!donor_phone || !/^\d{7,15}$/.test(String(donor_phone).replace(/[\s\-]/g, ''))) {
    return res.status(400).json({ error: 'donor_phone must be a valid phone number (7-15 digits)' });
  }
  if (!method || !['nequi', 'daviplata'].includes(String(method).toLowerCase())) {
    return res.status(400).json({ error: 'method must be "nequi" or "daviplata"' });
  }
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) < 1000) {
    return res.status(400).json({ error: 'amount must be at least 1000 COP' });
  }

  const donation = buildDonationRecord({ donor_name, donor_phone, method, amount });

  console.log('[register] New pending donation:', {
    donor_name:  donation.donor_name,
    method:      donation.method,
    amount:      donation.amount,
    transaction_id: donation.transaction_id,
  });

  try {
    const { skipped } = await persistDonation(donation);
    return res.json({ ok: true, skipped, transaction_id: donation.transaction_id });
  } catch (err) {
    console.error('[register] Failed to persist donation:', err.message);
    return res.status(500).json({ ok: false, error: 'internal_error', message: err.message });
  }
});

// ══════════════════════════════════════════
// Admin middleware – validates ADMIN_TOKEN
// ══════════════════════════════════════════
// Minimum buffer length for timing-safe token comparison.
// Both buffers are padded to this length so that crypto.timingSafeEqual
// always operates on equal-length inputs regardless of the actual token length.
const TOKEN_COMPARISON_LENGTH = 128;

function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: 'admin_not_configured' });
  }

  const provided = req.headers['x-admin-token'] || req.query.token || '';
  if (!provided) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(provided.padEnd(TOKEN_COMPARISON_LENGTH));
  const b = Buffer.from(adminToken.padEnd(TOKEN_COMPARISON_LENGTH));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  next();
}

// ══════════════════════════════════════════
// Admin: approve a pending donation
// POST /admin/confirm
// ══════════════════════════════════════════
app.post('/admin/confirm', requireAdmin, async (req, res) => {
  const { transaction_id } = req.body;
  if (!transaction_id) {
    return res.status(400).json({ error: 'transaction_id required' });
  }

  try {
    const { readRepoFile, writeRepoFile } = require('./github');
    const { content: donationsData, sha } = await readRepoFile('data/donations.json');
    const donations = donationsData.donations || [];

    const idx = donations.findIndex(d => d.transaction_id === transaction_id);
    if (idx === -1) return res.status(404).json({ error: 'donation_not_found' });
    if (donations[idx].status === 'approved') return res.json({ ok: true, message: 'already_approved' });

    donations[idx].status = 'approved';
    donations[idx].confirmed_at = new Date().toISOString();
    donationsData.donations = donations;

    await writeRepoFile(
      'data/donations.json',
      donationsData,
      sha,
      `chore: approve donation ${transaction_id}`
    );

    // Recalculate summary
    const { content: summaryData, sha: summarySha } = await readRepoFile('data/summary.json');
    const goal   = parseFloat(process.env.CAMPAIGN_GOAL) || summaryData.goal || 3000000;
    const raised = donations.filter(d => d.status === 'approved' || d.status === 'manual')
      .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const count  = donations.filter(d => d.status === 'approved' || d.status === 'manual').length;
    const pct    = Math.min(100, Math.round((raised / goal) * 100));

    await writeRepoFile(
      'data/summary.json',
      { ...summaryData, raised, donations_count: count, percentage: pct, last_updated: new Date().toISOString() },
      summarySha,
      `chore: update summary after approving donation`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin/confirm]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── 404 ──
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// ── Error handler ──
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'internal_error' });
});

// ── Start ──
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Ayuda Hannah server running on port ${PORT}`);
    console.log(`   Health:   http://localhost:${PORT}/health`);
    console.log(`   Register: http://localhost:${PORT}/donations/register`);
    console.log(`   Confirm:  http://localhost:${PORT}/admin/confirm`);
  });
}

module.exports = app; // export for testing
