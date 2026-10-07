/* ===========================
   TOP BAR EXTRAS
   - Bug button: opens a small "Report a problem" form on top of whatever
     the student is looking at, so a report takes one tap and nobody has to
     find Settings > Help. The page they were on is attached automatically.
   - The theme button's sun/moon line icons live in the markup and CSS
     (see .theme-btn in styles.css); applyTheme() only updates its label.
=========================== */

const QUICK_REPORT_TYPES = [
  { id: 'bug', label: 'Bug', placeholder: 'What happened? What did you expect instead?' },
  { id: 'idea', label: 'Idea', placeholder: 'What would make StudyFlow better for you?' },
  { id: 'other', label: 'Other', placeholder: "Tell us what's on your mind." },
];

// Human name of the tab the student is on, for the report and the form's note.
function currentPageLabel() {
  const id = (document.querySelector('.page.active')?.id || '').replace(/^page-/, '');
  const names = { home: 'Home', links: 'Links', updates: 'Updates', due: 'Upcoming', allwork: 'Assignments',
    priority: 'Priority', study: 'Study', grades: 'Grades', goals: 'Goals', syllabus: 'Syllabus',
    settings: 'Settings', more: 'More', messages: 'Messages', feedback: 'Feedback', discarded: 'Discarded' };
  return names[id] || id || '';
}

function closeQuickReport() {
  const el = document.getElementById('quick-report');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 200);
  document.getElementById('bug-btn')?.focus();
}

function openQuickReport() {
  if (document.getElementById('quick-report')) return;
  trackEvent('quick_report_opened', { page: currentPageLabel() });
  let type = 'bug';
  const page = currentPageLabel();
  const el = document.createElement('div');
  el.id = 'quick-report';
  el.className = 'quick-report-backdrop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'qr-title');
  el.innerHTML = `
    <div class="quick-report-card">
      <div class="qr-head">
        <span class="qr-icon">${BUG_ICON_SVG}</span>
        <div>
          <div class="qr-title" id="qr-title">Report a problem</div>
          <div class="qr-sub">Goes straight to the StudyFlow team${page ? `. We'll know you were on <strong>${escapeHtml(page)}</strong>.` : '.'}</div>
        </div>
        <button type="button" class="qr-close" data-act="close" aria-label="Close">&times;</button>
      </div>
      <div class="seg-control qr-types" role="radiogroup" aria-label="Report type">
        ${QUICK_REPORT_TYPES.map(t => `<button type="button" class="seg-btn${t.id === type ? ' active' : ''}" data-type="${t.id}" role="radio" aria-checked="${t.id === type}">${t.label}</button>`).join('')}
      </div>
      <textarea class="syllabus-textarea qr-text" rows="4" placeholder="${QUICK_REPORT_TYPES[0].placeholder}" aria-label="Describe the problem"></textarea>
      <div class="qr-status" aria-live="polite"></div>
      <div class="qr-actions">
        <button type="button" class="sync-btn" data-act="close">Cancel</button>
        <button type="button" class="settings-btn" data-act="send">Send</button>
      </div>
    </div>`;
  const text = el.querySelector('.qr-text');
  const status = el.querySelector('.qr-status');
  const sendBtn = el.querySelector('[data-act="send"]');

  async function send() {
    const msg = text.value.trim();
    if (!msg) { status.className = 'qr-status err'; status.textContent = 'Write a quick description first.'; text.focus(); return; }
    sendBtn.disabled = true; status.className = 'qr-status'; status.textContent = 'Sending…';
    trackEvent('problem_report_submitted', { via: 'topbar' });
    const { ok } = await sbFetchWithRetry('/rest/v1/problem_reports', 'POST', {
      user_id: USER_ID,
      email: USER_EMAIL,
      report_type: type,
      message: msg,
      context: { page: document.querySelector('.page.active')?.id || null, via: 'topbar', userAgent: navigator.userAgent, url: location.href },
    }, true);
    if (ok) {
      el.querySelector('.quick-report-card').classList.add('sent');
      status.className = 'qr-status ok'; status.textContent = "Thanks, it's sent. We'll look into it.";
      setTimeout(closeQuickReport, 1600);
    } else {
      sendBtn.disabled = false;
      status.className = 'qr-status err'; status.textContent = "Couldn't send. Check your connection and try again.";
    }
  }

  el.addEventListener('click', e => {
    if (e.target === el) { closeQuickReport(); return; }
    const t = e.target.closest('[data-type]');
    if (t) {
      type = t.dataset.type;
      el.querySelectorAll('.qr-types .seg-btn').forEach(b => {
        const on = b === t; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on));
      });
      text.placeholder = QUICK_REPORT_TYPES.find(x => x.id === type).placeholder;
      text.focus();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') closeQuickReport();
    else if (act === 'send') send();
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeQuickReport();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.classList.add('show'); text.focus(); });
}

const BUG_ICON_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M7.2 6.2a2.8 2.8 0 0 1 5.6 0"/>'
  + '<rect x="6" y="6.2" width="8" height="9.8" rx="4"/>'
  + '<path d="M10 9v7M6 10.5H3.5M16.5 10.5H14M6.3 14 4 15.8M13.7 14l2.3 1.8M6.3 7.6 4.3 6M13.7 7.6l2-1.6"/>'
  + '</svg>';
