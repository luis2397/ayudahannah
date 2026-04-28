'use strict';

const crypto = require('crypto');

/**
 * Validates the ePayco webhook signature.
 *
 * ePayco sends x_signature = MD5(p_cust_id_cliente + p_key + x_ref_payco +
 *                                   x_transaction_id + x_amount + x_currency_code)
 *
 * @param {object} params - The parsed body/query params from ePayco
 * @returns {boolean}
 */
function validateEpaycoSignature(params) {
  const customerId = process.env.EPAYCO_CUSTOMER_ID;
  const pKey = process.env.EPAYCO_P_KEY;

  if (!customerId || !pKey) {
    // If credentials are not configured, skip validation (useful for tests)
    console.warn('[webhook] EPAYCO_CUSTOMER_ID or EPAYCO_P_KEY not set – skipping sig validation');
    return true;
  }

  const {
    x_ref_payco,
    x_transaction_id,
    x_amount,
    x_currency_code,
    x_signature,
  } = params;

  if (!x_signature) return false;

  const raw = `${customerId}${pKey}${x_ref_payco}${x_transaction_id}${x_amount}${x_currency_code}`;
  const expected = crypto.createHash('md5').update(raw).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(x_signature.toLowerCase(), 'hex')
  );
}

/**
 * Maps ePayco's x_response to a normalized status string.
 * @param {string} xResponse
 * @returns {'approved'|'rejected'|'pending'|'unknown'}
 */
function normalizeStatus(xResponse) {
  const r = (xResponse || '').trim().toLowerCase();
  if (r === 'aceptada' || r === 'accepted') return 'approved';
  if (r === 'rechazada' || r === 'rejected' || r === 'fallida' || r === 'failed') return 'rejected';
  if (r === 'pendiente' || r === 'pending') return 'pending';
  return 'unknown';
}

/**
 * Builds a donation record from ePayco params.
 * Only stores minimum data required for transparency.
 * Does NOT store card data, CVV, or other sensitive info.
 *
 * @param {object} params
 * @returns {object}
 */
function buildDonationRecord(params) {
  return {
    transaction_id: String(params.x_transaction_id || ''),
    ref_payco: String(params.x_ref_payco || ''),
    date: new Date().toISOString(),
    amount: parseFloat(params.x_amount) || 0,
    currency: String(params.x_currency_code || 'COP'),
    status: normalizeStatus(params.x_response),
    method: String(params.x_franchise || 'epayco'),
    approval_code: String(params.x_approval_code || ''),
  };
}

module.exports = { validateEpaycoSignature, normalizeStatus, buildDonationRecord };
