/* ===========================
   SYNC WHILE BUSY
   The sync screen covers the whole app. If the student taps Sync while in
   the middle of something (an assignment or syllabus open, a focus timer
   running, writing a note), they get a choice instead of being covered:
   keep going and sync in the background, open the sync screen, or skip.
=========================== */

const BUSY_OVERLAYS = [
  'assignment-detail-overlay', 'syllabus-detail-overlay', 'grade-detail-overlay', 'grade-all-overlay',
  'announcements-detail-overlay', 'completed-detail-overlay', 'focus-overlay', 'deepwork-overlay',
];

function studentIsBusy() {
  const open = BUSY_OVERLAYS.some(id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  });
  if (open) return true;
  if (typeof focusState !== 'undefined' && focusState && focusState.phase === 'study' && !focusState.paused) return true;
  if (typeof deepWorkState !== 'undefined' && deepWorkState && deepWorkState.phase === 'active' && !deepWorkState.paused) return true;
  // Typing something (a note, a link, a coco.1 question).
  const a = document.activeElement;
  return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|)$/.test(a.type))) && a.value && a.value.trim());
}

function closeSyncBusyPrompt() {
  const el = document.getElementById('sync-busy-prompt');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 200);
}

function showSyncBusyPrompt() {
  closeSyncBusyPrompt();
  const running = !!syncPromise;
  const el = document.createElement('div');
  el.id = 'sync-busy-prompt';
  el.className = 'sync-busy-backdrop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'sync-busy-title');
  el.innerHTML = `
    <div class="sync-busy-card">
      <div class="sync-busy-title" id="sync-busy-title">${running ? 'Already syncing' : 'Sync now?'}</div>
      <div class="sync-busy-sub">${running
        ? 'A sync is already running in the background. You can keep going, or watch it finish.'
        : "You're in the middle of something. Sync in the background and keep going, or open the sync screen."}</div>
      <div class="sync-busy-actions">
        <button type="button" class="settings-btn" data-act="bg">${running ? 'Keep going' : 'Sync in the background'}</button>
        <button type="button" class="sync-btn" data-act="screen">${running ? 'Watch it finish' : 'Open the sync screen'}</button>
        ${running ? '' : '<button type="button" class="sync-busy-skip" data-act="skip">Not now</button>'}
      </div>
    </div>`;
  el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target === el || act === 'skip') { closeSyncBusyPrompt(); return; }
    if (act === 'bg') {
      closeSyncBusyPrompt();
      if (!running) {
        showReward('Syncing in the background. Keep going.', 'sync');
        syncCanvas().then(r => { if (r && !r.ok) showReward(`Sync failed: ${r.error || 'try again'}`, 'error'); });
      }
    } else if (act === 'screen') {
      closeSyncBusyPrompt();
      openSyncOverlay({ force: true });
    }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') closeSyncBusyPrompt(); });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.classList.add('show'); el.querySelector('[data-act="bg"]').focus(); });
}

/* ---- "Updates" after a background sync --------------------------------- */
// A sync the student didn't watch on the sync screen (Sync in the
// background, or the daily auto-sync) ends with a small Updates card: the
// new assignments it found, each one tappable, then it goes away by itself.
// The timer bar pauses while the pointer or focus is on the card. Nothing
// new gets the usual short "all caught up" message instead.
const SYNC_UPDATES_SHOW = 3;
const SYNC_UPDATES_MS = 9000;

function closeSyncUpdates() {
  const el = document.getElementById('sync-updates');
  if (!el) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

function showSyncUpdates(newWork) {
  const list = (newWork || []).slice().sort((a, b) =>
    new Date(a.due_date || '9999-01-01') - new Date(b.due_date || '9999-01-01'));
  if (!list.length) {
    showReward(SYNC_REWARD_MESSAGES[Math.floor(Math.random() * SYNC_REWARD_MESSAGES.length)], 'sync', true);
    return;
  }
  document.getElementById('sync-updates')?.remove();
  const n = list.length;
  const due = a => a.due_date
    ? 'Due ' + new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No due date';
  const el = document.createElement('div');
  el.id = 'sync-updates';
  el.className = 'sync-updates';
  el.setAttribute('role', 'status');
  el.style.setProperty('--su-ms', SYNC_UPDATES_MS + 'ms');
  el.innerHTML = `
    <div class="su-head">
      <span class="su-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10a6 6 0 0 1 10.24-4.24L16 7.5"/><path d="M16 4v3.5h-3.5"/><path d="M16 10a6 6 0 0 1-10.24 4.24L4 12.5"/><path d="M4 16v-3.5h3.5"/></svg></span>
      <div>
        <div class="su-title">Updates</div>
        <div class="su-sub">${n} new assignment${n !== 1 ? 's' : ''} from Canvas</div>
      </div>
      <button type="button" class="su-close" aria-label="Close">&times;</button>
    </div>
    <ul class="su-list">
      ${list.slice(0, SYNC_UPDATES_SHOW).map(a => `
        <li><button type="button" class="su-item" data-id="${escapeHtml(String(a.id))}">
          <span class="su-item-title">${escapeHtml(a.title || 'Untitled')}</span>
          <span class="su-item-meta">${escapeHtml(cleanCourseName(a.course || ''))} · ${due(a)}</span>
        </button></li>`).join('')}
    </ul>
    ${n > SYNC_UPDATES_SHOW ? `<button type="button" class="su-more">See all ${n} new ›</button>` : ''}
    <div class="su-timer" aria-hidden="true"><i></i></div>`;
  el.addEventListener('click', e => {
    if (e.target.closest('.su-close')) { closeSyncUpdates(); return; }
    const item = e.target.closest('.su-item');
    if (item) { closeSyncUpdates(); openAssignmentDetail(item.dataset.id); return; }
    if (e.target.closest('.su-more')) { closeSyncUpdates(); if (window.wsViewList) wsViewList(list); }
  });
  // Goes away when the timer bar runs out (the bar pauses on hover/focus).
  el.querySelector('.su-timer i').addEventListener('animationend', closeSyncUpdates);
  if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) setTimeout(closeSyncUpdates, SYNC_UPDATES_MS);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
}
