/* ===========================
   UPDATES EXTRAS
   - Mute a class's announcements (hidden from the feed, the unread badges,
     Home and the welcome summary; undo from the "Muted" chips).
   - Save an update for later: a bookmark that keeps a copy of the update,
     so it is still there after the teacher deletes it or a sync replaces it.
   Both live in the prefs blob: mutedClasses = ['AP Calculus'],
   savedUpdates = [{ key, kind, id, title, context, time, from, body, url }].
   Only announcements can be muted -- feedback on your own work and direct
   messages are never hidden.
=========================== */
const SAVED_UPDATES_MAX = 60;

function mutedClassList() { return Array.isArray(userPrefs.mutedClasses) ? userPrefs.mutedClasses : []; }

function isClassMuted(courseName) {
  const key = cleanCourseName(courseName || '').trim().toLowerCase();
  return !!key && mutedClassList().some(c => c.trim().toLowerCase() === key);
}

// Announcements that are not from a muted class.
function visibleAnnouncements() {
  const muted = mutedClassList();
  if (!muted.length) return cachedAnnouncements || [];
  return (cachedAnnouncements || []).filter(a => !isClassMuted(a.course_name));
}

function muteClass(name) {
  const clean = cleanCourseName(name || '').trim();
  if (!clean || isClassMuted(clean)) return;
  userPrefs.mutedClasses = [...mutedClassList(), clean];
  saveUserPrefs();
  refreshAfterMuteChange();
  showReward(`Muted ${clean} announcements.`, 'bell');
}

function unmuteClass(name) {
  const key = (name || '').trim().toLowerCase();
  userPrefs.mutedClasses = mutedClassList().filter(c => c.trim().toLowerCase() !== key);
  saveUserPrefs();
  refreshAfterMuteChange();
}

function refreshAfterMuteChange() {
  renderAnnouncements();   // Home + the full list; also re-renders the feed
  renderUpdates();
}

function mutedChipsHTML() {
  const muted = mutedClassList();
  if (!muted.length) return '';
  return `<div class="upd-muted"><span class="upd-muted-label">Muted</span>${muted.map(c =>
    `<button type="button" class="upd-muted-chip" data-cls="${escapeHtml(c)}" onclick="unmuteClass(this.dataset.cls)" title="Unmute ${escapeHtml(c)}">${escapeHtml(c)}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l8 8M14 6l-8 8"/></svg></button>`).join('')}</div>`;
}

/* ---- Saved for later ------------------------------------------------------ */
function savedUpdateList() { return Array.isArray(userPrefs.savedUpdates) ? userPrefs.savedUpdates : []; }
function isUpdateSaved(kind, id) { return savedUpdateList().some(s => s.key === `${kind}:${id}`); }

// A saved snapshot, shaped like allUpdates() entries so one card renderer
// serves both. It is always "read" -- reading state belongs to the live row.
function savedUpdateAsItem(s) {
  return { kind: s.kind, id: s.id, src: { read: true }, time: s.time, context: s.context, title: s.title, from: s.from, body: s.body, url: s.url, saved: true };
}

function toggleSaveUpdate(kind, id) {
  const key = `${kind}:${id}`;
  const list = savedUpdateList();
  if (list.some(s => s.key === key)) {
    userPrefs.savedUpdates = list.filter(s => s.key !== key);
    showReward('Removed from saved.', 'check');
  } else {
    const live = allUpdates().find(u => u.kind === kind && String(u.id) === String(id));
    if (!live) return;
    const snap = { key, kind, id: live.id, title: live.title, context: live.context, time: live.time, from: live.from, body: String(live.body || '').slice(0, 4000), url: live.url || '' };
    userPrefs.savedUpdates = [snap, ...list].slice(0, SAVED_UPDATES_MAX);
    showReward('Saved for later.', 'check');
  }
  saveUserPrefs();
  renderUpdates();
}

const UPD_BOOKMARK = '<svg viewBox="0 0 20 20" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M5.5 3.5h9v13L10 13l-4.5 3.5z"/></svg>';
