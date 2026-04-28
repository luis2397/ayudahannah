'use strict';

/**
 * GitHub REST API helpers for reading and updating data files
 * directly via commits (no local git required).
 */

const https = require('https');

const GITHUB_API_BASE = 'api.github.com';

/**
 * Makes a GitHub API request.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. '/repos/owner/repo/contents/file.json')
 * @param {object|null} body - Request body
 * @returns {Promise<{status: number, data: object}>}
 */
function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_PAT;
    if (!token) {
      return reject(new Error('GITHUB_PAT environment variable is not set'));
    }

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: GITHUB_API_BASE,
      path,
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'AyudaHannahWebhook/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Reads a file from the GitHub repository, returning its content and SHA.
 * @param {string} filePath - Repository file path (e.g. 'data/donations.json')
 * @returns {Promise<{content: object, sha: string}>}
 */
async function readRepoFile(filePath) {
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  const { status, data } = await githubRequest(
    'GET',
    `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`
  );

  if (status !== 200) {
    throw new Error(`GitHub read error (${status}): ${JSON.stringify(data)}`);
  }

  const raw = Buffer.from(data.content, 'base64').toString('utf8');
  return { content: JSON.parse(raw), sha: data.sha };
}

/**
 * Writes/updates a file in the GitHub repository via a direct commit.
 * @param {string} filePath - Repository file path
 * @param {object} content - JavaScript object to serialize as JSON
 * @param {string} sha - Current file SHA (required by GitHub API)
 * @param {string} message - Commit message
 * @returns {Promise<void>}
 */
async function writeRepoFile(filePath, content, sha, message) {
  const owner  = process.env.GITHUB_OWNER;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  const encoded = Buffer.from(JSON.stringify(content, null, 2) + '\n').toString('base64');

  const { status, data } = await githubRequest(
    'PUT',
    `/repos/${owner}/${repo}/contents/${filePath}`,
    {
      message,
      content: encoded,
      sha,
      branch,
    }
  );

  if (status !== 200 && status !== 201) {
    throw new Error(`GitHub write error (${status}): ${JSON.stringify(data)}`);
  }
}

/**
 * Adds a donation to data/donations.json and recalculates data/summary.json,
 * committing both changes in a single GitHub API call sequence.
 *
 * Idempotent: if the transaction_id already exists, no update is made.
 *
 * @param {object} donation - Donation record from buildDonationRecord()
 * @returns {Promise<{skipped: boolean}>}
 */
async function persistDonation(donation) {
  // Read current donations
  const { content: donationsData, sha: donationsSha } = await readRepoFile('data/donations.json');
  const donations = donationsData.donations || [];

  // Idempotency check
  const exists = donations.some(d => d.transaction_id === donation.transaction_id);
  if (exists) {
    console.log(`[github] Donation ${donation.transaction_id} already recorded – skipping`);
    return { skipped: true };
  }

  // Only persist approved donations in the public list
  if (donation.status !== 'approved' && donation.status !== 'manual') {
    console.log(`[github] Donation ${donation.transaction_id} not approved (${donation.status}) – skipping`);
    return { skipped: true };
  }

  donations.push(donation);
  donationsData.donations = donations;

  // Recalculate summary (only approved and manual donations count toward the total)
  const { content: summaryData, sha: summarySha } = await readRepoFile('data/summary.json');
  const goal = parseFloat(process.env.CAMPAIGN_GOAL) || summaryData.goal || 3000000;
  const approvedDonations = donations.filter(d => d.status === 'approved' || d.status === 'manual');
  const raised = approvedDonations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const count  = approvedDonations.length;
  const pct    = Math.min(100, Math.round((raised / goal) * 100));

  const newSummary = {
    goal,
    currency: summaryData.currency || 'COP',
    raised,
    donations_count: count,
    percentage: pct,
    last_updated: new Date().toISOString(),
  };

  const shortId = donation.transaction_id.slice(-8);
  await writeRepoFile(
    'data/donations.json',
    donationsData,
    donationsSha,
    `chore: add donation ${shortId} [skip ci]`
  );

  await writeRepoFile(
    'data/summary.json',
    newSummary,
    summarySha,
    `chore: update summary – raised ${raised} COP (${count} donations) [skip ci]`
  );

  console.log(`[github] Persisted donation ${donation.transaction_id}: ${donation.amount} COP`);
  return { skipped: false };
}

module.exports = { readRepoFile, writeRepoFile, persistDonation };
