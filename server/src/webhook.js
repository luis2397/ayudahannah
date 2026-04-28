'use strict';

/**
 * Utility helpers for donation records.
 */

/**
 * Maps a status string to a normalized status value.
 * @param {string} status
 * @returns {'approved'|'rejected'|'pending'|'manual'|'unknown'}
 */
function normalizeStatus(status) {
  const s = (status || '').trim().toLowerCase();
  if (s === 'approved' || s === 'aprobada' || s === 'aceptada') return 'approved';
  if (s === 'rejected' || s === 'rechazada' || s === 'fallida') return 'rejected';
  if (s === 'pending'  || s === 'pendiente') return 'pending';
  if (s === 'manual') return 'manual';
  return 'unknown';
}

/**
 * Builds a donation record from a public registration form submission.
 * Only stores minimum data required for transparency.
 * Does NOT store card data or other sensitive info.
 *
 * @param {object} params - Parsed form fields
 * @param {string} params.donor_name  - Donor's full name
 * @param {string} params.donor_phone - Donor's phone number
 * @param {string} params.method      - 'nequi' | 'daviplata'
 * @param {number} params.amount      - Amount in COP
 * @returns {object}
 */
function buildDonationRecord(params) {
  return {
    transaction_id: `DON-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    amount: parseFloat(params.amount) || 0,
    currency: 'COP',
    status: 'pending',
    method: String(params.method || 'manual').slice(0, 30),
    donor_name: String(params.donor_name || '').slice(0, 80),
    donor_phone: String(params.donor_phone || '').replace(/\D/g, '').slice(0, 15),
  };
}

module.exports = { normalizeStatus, buildDonationRecord };
