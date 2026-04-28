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
  // Ensure ISO-8601 strings are parsed as local time when only a date is given
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T00:00:00' : dateStr;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return dateStr; // fallback to raw string
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

/* ── Donation form submission (Google Forms) ── */
async function submitDonationForm(event) {
  event.preventDefault();

  const nameVal   = document.getElementById('don-name').value.trim();
  const phoneVal  = document.getElementById('don-phone').value.trim();
  const methodVal = document.getElementById('don-method').value;
  const amountVal = parseInt(document.getElementById('don-amount').value, 10);
  const submitBtn = document.getElementById('don-submit-btn');

  // Client-side validation
  if (!nameVal) { showFormMsg('error', 'Por favor ingresa tu nombre completo.'); return; }
  if (!phoneVal || !/^\d{7,15}$/.test(phoneVal.replace(/[\s\-]/g, ''))) {
    showFormMsg('error', 'Por favor ingresa un número de teléfono válido.'); return;
  }
  if (!methodVal) { showFormMsg('error', 'Selecciona el método de pago que usaste.'); return; }
  if (!amountVal || amountVal < 1000) {
    showFormMsg('error', 'El monto mínimo de donación es $1.000 COP.'); return;
  }

  const formId = window.GOOGLE_FORM_ID;
  if (!formId || formId.includes('REEMPLAZA')) {
    showFormMsg('error', '❌ Formulario no configurado. Contáctanos por WhatsApp para reportar tu donación.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando…';

  try {
    const body = new URLSearchParams();
    body.set(window.GF_ENTRY_NAME,   nameVal.slice(0, 80));
    body.set(window.GF_ENTRY_PHONE,  phoneVal.replace(/[\s\-]/g, '').slice(0, 15));
    body.set(window.GF_ENTRY_METHOD, methodVal);
    body.set(window.GF_ENTRY_AMOUNT, String(amountVal));

    // Google Forms doesn't allow CORS reads; mode 'no-cors' submits without reading the response.
    await fetch(
      `https://docs.google.com/forms/d/e/${formId}/formResponse`,
      { method: 'POST', mode: 'no-cors', body }
    );

    showFormMsg('success', '✅ ¡Gracias! Tu donación quedó registrada. La confirmaremos pronto. 🐾');
    event.target.reset();
  } catch (err) {
    showFormMsg('error', '❌ Error al enviar. Intenta de nuevo o contáctanos por WhatsApp.');
    console.error('Donation submit error:', err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '💛 Registrar mi donación';
  }
}

function showFormMsg(type, text) {
  const el = document.getElementById('donation-form-msg');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  el.style.background = type === 'success' ? '#d4edda' : '#f8d7da';
  el.style.color = type === 'success' ? '#155724' : '#721c24';
  el.style.border = type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
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
