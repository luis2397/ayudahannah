/* =============================================
   Ayuda Hannah – main.js
   ============================================= */

const DATA_BASE_URL = './data';

/* ── Utilities ── */
function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function fetchJSON(path) {
  const res = await fetch(path + '?_=' + Date.now());
  if (!res.ok) throw new Error('Error fetching ' + path);
  return res.json();
}

/* ── Progress Bar ── */
async function loadProgress() {
  try {
    const data = await fetchJSON(DATA_BASE_URL + '/summary.json');
    const raised = data.raised || 0;
    const goal = data.goal || 3000000;
    const pct = Math.min(100, Math.round((raised / goal) * 100));
    const count = data.donations_count || 0;

    document.getElementById('stat-raised').textContent = formatCOP(raised);
    document.getElementById('stat-goal').textContent = formatCOP(goal);
    document.getElementById('stat-count').textContent = count;
    document.getElementById('progress-pct-text').textContent = pct + '%';

    const fill = document.getElementById('progress-fill');
    if (fill) {
      fill.style.width = Math.max(2, pct) + '%';
      fill.setAttribute('aria-valuenow', pct);
    }

    const pctLabel = document.getElementById('progress-pct');
    if (pctLabel) pctLabel.textContent = pct + '% completado';
  } catch (err) {
    console.warn('Could not load summary.json:', err.message);
  }
}

/* ── Updates Timeline ── */
async function loadUpdates() {
  const container = document.getElementById('updates-timeline');
  if (!container) return;

  try {
    const data = await fetchJSON(DATA_BASE_URL + '/updates.json');
    const updates = (data.updates || []).slice().reverse();

    if (updates.length === 0) {
      container.innerHTML = '<p style="color:var(--color-text-muted)">No hay actualizaciones todavía. ¡Pronto!</p>';
      return;
    }

    container.innerHTML = updates.map(u => `
      <div class="timeline-item ${u.type || 'info'}">
        <div class="timeline-date">${formatDate(u.date)}</div>
        <div class="timeline-card">
          <h3>${escapeHtml(u.title)}</h3>
          <p>${escapeHtml(u.content)}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--color-text-muted)">No se pudieron cargar las actualizaciones.</p>';
    console.warn('Updates error:', err.message);
  }
}

/* ── Evidences Grid ── */
async function loadEvidences() {
  const container = document.getElementById('evidence-grid');
  if (!container) return;

  try {
    const data = await fetchJSON(DATA_BASE_URL + '/evidences.json');
    const evidences = data.evidences || [];

    if (evidences.length === 0) {
      container.innerHTML = '<p style="color:var(--color-text-muted)">Las evidencias se agregarán pronto.</p>';
      return;
    }

    container.innerHTML = evidences.map(e => {
      const icon = e.type === 'pdf' ? '📄' : e.type === 'image' ? '🖼️' : '📎';
      const thumb = e.thumbnail
        ? `<img src="${escapeHtml(e.thumbnail)}" alt="${escapeHtml(e.title)}">`
        : `<div class="evidence-thumb">${icon}</div>`;

      const linkLabel = e.type === 'pdf' ? 'Ver documento →' : 'Ver imagen →';
      const link = e.url && e.url !== '#'
        ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${linkLabel}</a>`
        : `<span style="color:var(--color-text-muted);font-size:0.83rem">Próximamente</span>`;

      return `
        <div class="evidence-card">
          ${e.thumbnail ? `<div class="evidence-thumb">${thumb}</div>` : `<div class="evidence-thumb">${icon}</div>`}
          <div class="evidence-info">
            <h3>${escapeHtml(e.title)}</h3>
            <p>${escapeHtml(e.description)}</p>
            ${link}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--color-text-muted)">No se pudieron cargar las evidencias.</p>';
    console.warn('Evidences error:', err.message);
  }
}

/* ── ePayco Checkout ── */
let selectedAmount = 0;

function selectAmount(amount, btn) {
  selectedAmount = amount;
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const customInput = document.getElementById('custom-amount');
  if (customInput) customInput.value = '';
}

function onCustomAmountChange(input) {
  const val = parseInt(input.value.replace(/\D/g, ''), 10);
  selectedAmount = isNaN(val) ? 0 : val;
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
}

function donatePrimary() {
  const customInput = document.getElementById('custom-amount');
  if (customInput && customInput.value) {
    const val = parseInt(customInput.value.replace(/\D/g, ''), 10);
    if (!isNaN(val)) selectedAmount = val;
  }

  if (!selectedAmount || selectedAmount < 1000) {
    alert('Por favor selecciona o ingresa un monto de donación (mínimo $1.000 COP).');
    return;
  }

  if (typeof ePayco === 'undefined' || !ePayco.checkout) {
    alert('El sistema de pago no está disponible temporalmente. Por favor usa Nequi o Daviplata como alternativa.');
    return;
  }

  const handler = ePayco.checkout.configure({
    key: window.EPAYCO_PUBLIC_KEY || 'TU_PUBLIC_KEY',
    test: window.EPAYCO_TEST_MODE !== false,
  });

  handler.open({
    name: 'Donación para Hannah',
    description: 'Ayuda a cubrir los gastos veterinarios de Hannah 🐾',
    invoice: 'DON-' + Date.now(),
    currency: 'COP',
    amount: String(selectedAmount),
    tax_base: '0',
    tax: '0',
    country: 'CO',
    lang: 'es',
    external: 'false',
    confirmation: window.EPAYCO_CONFIRMATION_URL || '',
    response: window.EPAYCO_RESPONSE_URL || window.location.href,
    acepted: window.EPAYCO_CONFIRMATION_URL || '',
    rejected: window.EPAYCO_CONFIRMATION_URL || '',
    pending: window.EPAYCO_CONFIRMATION_URL || '',
  });
}

/* ── FAQ accordion ── */
function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ── WhatsApp share ── */
function shareWhatsApp() {
  const text = encodeURIComponent(
    '🐾 *¡Ayuda a Hannah!* Mi perrita está en estado delicado y necesito tu apoyo. ' +
    'Cada donación, por pequeña que sea, hace la diferencia. ' +
    '👉 ' + window.location.href
  );
  window.open('https://wa.me/?text=' + text, '_blank', 'noopener');
}

/* ── Security helper ── */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  loadProgress();
  loadUpdates();
  loadEvidences();
  initFAQ();

  // Auto-refresh progress every 5 minutes
  setInterval(loadProgress, 5 * 60 * 1000);
});
