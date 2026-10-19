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

// What a sync newly graded, as list rows: "Unit 2 Test · 46/50 (92%)", and
// class grades that moved ("MATH 132 · 91.2% → 93.2%").
function syncGradedRowsHTML(graded, gradeChanges) {
  const pct = (s, p) => (p ? ` (${Math.round((Number(s) / Number(p)) * 1000) / 10}%)` : '');
  const num = v => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1));
  const rows = (graded || []).slice(0, SYNC_UPDATES_SHOW).map(g => `
    <li><button type="button" class="su-item su-graded" data-grades="1">
      <span class="su-item-title">${escapeHtml(g.title || 'Assignment')}</span>
      <span class="su-item-meta">${escapeHtml(cleanCourseName(g.course || ''))} · <b>${num(g.score)}${g.points_possible ? '/' + num(g.points_possible) : ''}${pct(g.score, g.points_possible)}</b></span>
    </button></li>`);
  (gradeChanges || []).slice(0, 2).forEach(c => rows.push(`
    <li><button type="button" class="su-item su-graded" data-grades="1">
      <span class="su-item-title">${escapeHtml(cleanCourseName(c.course || ''))}</span>
      <span class="su-item-meta">Class grade ${c.from != null ? `${Number(c.from).toFixed(1)}% → ` : ''}<b>${Number(c.to).toFixed(1)}%</b></span>
    </button></li>`));
  return rows.join('');
}

function showSyncUpdates(newWork, extra = {}) {
  const list = (newWork || []).slice().sort((a, b) =>
    new Date(a.due_date || '9999-01-01') - new Date(b.due_date || '9999-01-01'));
  const graded = Array.isArray(extra.graded) ? extra.graded : [];
  const gradeChanges = Array.isArray(extra.gradeChanges) ? extra.gradeChanges : [];
  if (!list.length && !graded.length && !gradeChanges.length) {
    showReward(SYNC_REWARD_MESSAGES[Math.floor(Math.random() * SYNC_REWARD_MESSAGES.length)], 'sync', true);
    return;
  }
  document.getElementById('sync-updates')?.remove();
  const n = list.length;
  const g = graded.length;
  const subParts = [n ? `${n} new assignment${n !== 1 ? 's' : ''}` : '', g ? `${g} newly graded` : '', !g && gradeChanges.length ? 'a class grade changed' : ''].filter(Boolean);
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
        <div class="su-sub">${subParts.join(' · ')} from Canvas</div>
      </div>
      <button type="button" class="su-close" aria-label="Close">&times;</button>
    </div>
    ${g || gradeChanges.length ? `<div class="su-section">Graded</div><ul class="su-list">${syncGradedRowsHTML(graded, gradeChanges)}</ul>` : ''}
    ${n && (g || gradeChanges.length) ? '<div class="su-section">New</div>' : ''}
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
    if (item && item.dataset.grades) { closeSyncUpdates(); jumpTo('grades'); return; }
    if (item) { closeSyncUpdates(); openAssignmentDetail(item.dataset.id); return; }
    if (e.target.closest('.su-more')) { closeSyncUpdates(); if (window.wsViewList) wsViewList(list); }
  });
  // Goes away when the timer bar runs out (the bar pauses on hover/focus).
  el.querySelector('.su-timer i').addEventListener('animationend', closeSyncUpdates);
  if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) setTimeout(closeSyncUpdates, SYNC_UPDATES_MS);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
}

/* ---- What's new since the last sync -------------------------------------- */
// The assignments the latest syncs brought in stay "new" until the student
// opens one or checks it off: a "New" tag on its card, and an "N new" link
// under Sync now (a chip next to the sync button on phones) that reopens the
// list any time. Kept per account on this device.
const newWorkKey = () => 'sf_new_work_' + USER_ID;
const workKeyOf = a => `${a.title}||${a.course}`;

function newWorkKeys() {
  try { return new Set(JSON.parse(localStorage.getItem(newWorkKey()) || '[]')); } catch (e) { return new Set(); }
}
function saveNewWorkKeys(set) {
  try { localStorage.setItem(newWorkKey(), JSON.stringify([...set])); } catch (e) {}
}

function isNewWork(a) {
  if (!a || a.completed) return false;
  const k = workKeyOf(a);
  return newWorkKeys().has(k) && !doneSet.has(k);
}

// Still-open new assignments, soonest due first.
function currentNewWork() {
  const keys = newWorkKeys();
  return (cachedAssignments || [])
    .filter(a => keys.has(workKeyOf(a)) && !a.completed && !doneSet.has(workKeyOf(a)))
    .sort((a, b) => new Date(a.due_date || '9999-01-01') - new Date(b.due_date || '9999-01-01'));
}

function rememberNewWork(list) {
  const keys = newWorkKeys();
  // Drop anything that's gone from Canvas since, then add this sync's.
  const present = new Set((cachedAssignments || []).map(workKeyOf));
  [...keys].forEach(k => { if (!present.has(k)) keys.delete(k); });
  (list || []).forEach(a => keys.add(workKeyOf(a)));
  saveNewWorkKeys(keys);
  refreshNewWorkViews();
}

function markNewWorkSeen(a) {
  if (!a) return;
  const keys = newWorkKeys();
  if (keys.delete(workKeyOf(a))) { saveNewWorkKeys(keys); refreshNewWorkViews(); }
}

function renderNewWorkLink() {
  const n = currentNewWork().length;
  const label = `${n} new assignment${n !== 1 ? 's' : ''} since your last sync`;
  const link = document.getElementById('new-work-link');
  if (link) { link.hidden = !n; link.textContent = `${n} new since your last sync ›`; link.title = label; }
  const chip = document.getElementById('new-work-chip');
  if (chip) {
    chip.hidden = !n;
    chip.innerHTML = `<span class="nwc-dot"></span>${n} new`;
    chip.setAttribute('aria-label', label);
    chip.title = label;
  }
}

function refreshNewWorkViews() {
  renderNewWorkLink();
  const list = cachedAssignments || [];
  ['renderDueSoon', 'renderAllWork', 'renderPriority'].forEach(fn => { if (typeof window[fn] === 'function') window[fn](list); });
  if (typeof renderHome === 'function') renderHome();
}

function openNewWork() {
  const list = currentNewWork();
  if (!list.length) { renderNewWorkLink(); return; }
  if (window.wsViewList) wsViewList(list);
}

// Opening an assignment counts as having seen it; checked-off work is never
// "new". The link count follows along with every Home render.
(function hookNewWorkSeen() {
  const orig = window.openAssignmentDetail;
  if (typeof orig === 'function') {
    window.openAssignmentDetail = function (id) {
      const a = (cachedAssignments || []).find(x => String(x.id) === String(id));
      const r = orig.apply(this, arguments);
      if (a && isNewWork(a)) markNewWorkSeen(a);
      return r;
    };
  }
  const origHome = window.renderHome;
  if (typeof origHome === 'function') {
    window.renderHome = function () { const r = origHome.apply(this, arguments); renderNewWorkLink(); return r; };
  }
})();

// Checking one off clears it right away too (the card is updated in place,
// so its tag would otherwise linger until the next redraw).
(function hookNewWorkDone() {
  const wrapDone = (name, findA) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const a = findA.apply(null, arguments);
      const r = orig.apply(this, arguments);
      if (a && newWorkKeys().has(workKeyOf(a))) {
        Promise.resolve(r).then(() => markNewWorkSeen(a));
      }
      return r;
    };
  };
  const byKey = key => (cachedAssignments || []).find(x => doneKey(x) === key);
  const byId = id => (cachedAssignments || []).find(x => String(x.id) === String(id));
  wrapDone('toggleDone', byKey);
  wrapDone('markPriorityDone', byId);
  wrapDone('toggleDoneFromDetail', byId);
})();

// A sync watched on the sync screen: what it graded shows once that screen
// closes, so a new test score isn't buried in the Grades tab.
(function gradedAfterSyncScreen() {
  const orig = window.wsClose;
  if (typeof orig !== 'function') return;
  window.wsClose = function () {
    const r = orig.apply(this, arguments);
    const pending = window.pendingGradedUpdate;
    window.pendingGradedUpdate = null;
    if (pending) setTimeout(() => showSyncUpdates([], pending), 450);
    return r;
  };
})();
