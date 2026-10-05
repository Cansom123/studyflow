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
