/* ===========================
   ASSIGNMENTS EXTRAS
   - Type chips (Quiz / Test / Essay / Discussion / Homework) that narrow the
     list, alongside the search box and the By due date / By class toggle.
   - Private notes on any assignment: a text box in its detail panel. Notes
     live in the prefs blob as userPrefs.assignmentNotes[title|course] and are
     keyed the way done-state is (title + class), not by row id, because
     Canvas sync deletes and re-inserts assignments with fresh ids every run.
=========================== */
const ASSIGNMENT_TYPES = ['Quiz', 'Test', 'Essay', 'Discussion', 'Homework'];
let allWorkTypeFilter = null;

// "1 quiz", "3 quizzes", "4 homework items" (homework has no plural).
function typeNoun(type, n) {
  if (type === 'Homework') return n === 1 ? 'homework item' : 'homework items';
  const lower = type.toLowerCase();
  return n === 1 ? lower : (lower.endsWith('s') ? lower + 'es' : lower + 's');
}

function assignmentTypeOf(a) { return getBadge(a.assignment_type, a.title)[1]; }

function isAssignmentDoneNow(a) {
  return a.completed || doneSet.has(decodeURIComponent(doneKey(a)));
}

// Chips only for types that actually have unfinished work, plus All.
function renderAllWorkChips(assignments) {
  const host = document.getElementById('allwork-chips');
  if (!host) return;
  const counts = {};
  (assignments || []).forEach(a => {
    if (isAssignmentDoneNow(a)) return;
    const t = assignmentTypeOf(a);
    counts[t] = (counts[t] || 0) + 1;
  });
  const present = ASSIGNMENT_TYPES.filter(t => counts[t]);
  // A filter whose type no longer has any work (everything got done) clears.
  if (allWorkTypeFilter && !counts[allWorkTypeFilter]) allWorkTypeFilter = null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (present.length < 2) { host.innerHTML = ''; host.style.display = 'none'; allWorkTypeFilter = null; return; }
  host.style.display = '';
  const chip = (label, n, type) => `<button type="button" class="aw-chip${(allWorkTypeFilter || null) === type ? ' active' : ''}" aria-pressed="${(allWorkTypeFilter || null) === type}" onclick="setAllWorkType(${type ? `'${type}'` : 'null'})">${label}<span>${n}</span></button>`;
  host.innerHTML = chip('All', total, null) + present.map(t => chip(t, counts[t], t)).join('');
}

function setAllWorkType(type) {
  allWorkTypeFilter = (type && allWorkTypeFilter !== type) ? type : null;
  renderAllWork(cachedAssignments);
}

/* ---- Private notes ---------------------------------------------------------- */
const ASSIGNMENT_NOTE_MAX = 2000;
const ASSIGNMENT_NOTES_MAX_COUNT = 200;

function assignmentNoteKey(a) { return decodeURIComponent(doneKey(a)); }
function assignmentNotes() {
  if (!userPrefs.assignmentNotes || typeof userPrefs.assignmentNotes !== 'object') userPrefs.assignmentNotes = {};
  return userPrefs.assignmentNotes;
}
function assignmentNoteText(a) {
  const n = (userPrefs.assignmentNotes || {})[assignmentNoteKey(a)];
  return n && n.text ? n.text : '';
}
function assignmentHasNote(a) { return !!assignmentNoteText(a); }

const NOTE_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h10v9l-4 4H5z"/><path d="M11 16.5v-4h4M7.5 7.5h5M7.5 10.5h3"/></svg>';

function noteIndicatorHTML() {
  return `<span class="a-note-ind" title="You have notes on this">${NOTE_ICON}</span>`;
}

// The "My notes" box inside the assignment detail panel.
function renderAssignmentNote(a) {
  const host = document.getElementById('a-note-section');
  if (!host || !a) return;
  const text = assignmentNoteText(a);
  host.innerHTML = `
    <div class="section-label" style="margin-top:18px;">My notes</div>
    <textarea class="settings-input a-note-input" id="a-note-input" rows="3" maxlength="${ASSIGNMENT_NOTE_MAX}"
      placeholder="Jot down anything about this one. Only you can see it."
      aria-label="My notes for ${escapeHtml(a.title)}">${escapeHtml(text)}</textarea>
    <div class="a-note-status" id="a-note-status" aria-live="polite"></div>`;
  const input = document.getElementById('a-note-input');
  const status = document.getElementById('a-note-status');
  const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(260, Math.max(84, input.scrollHeight + 2)) + 'px'; };
  fit();
  let timer = 0;
  input.addEventListener('input', () => {
    fit();
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(() => saveAssignmentNote(a, input.value, status), 600);
  });
}

function saveAssignmentNote(a, value, statusEl) {
  const notes = assignmentNotes();
  const key = assignmentNoteKey(a);
  const text = value.trim().slice(0, ASSIGNMENT_NOTE_MAX);
  if (text) {
    notes[key] = { text, updated: Date.now() };
    // Keep the blob bounded: drop the least recently edited beyond the cap.
    const keys = Object.keys(notes);
    if (keys.length > ASSIGNMENT_NOTES_MAX_COUNT) {
      keys.sort((x, y) => (notes[x].updated || 0) - (notes[y].updated || 0)).slice(0, keys.length - ASSIGNMENT_NOTES_MAX_COUNT).forEach(k => delete notes[k]);
    }
  } else {
    delete notes[key];
  }
  saveUserPrefs();
  syncNoteIndicators();
  if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl.textContent === 'Saved') statusEl.textContent = ''; }, 1500); }
}

// Updates the little note icon on cards already on screen.
function syncNoteIndicators() {
  document.querySelectorAll('.card[data-done-key]').forEach(card => {
    const key = decodeURIComponent(card.dataset.doneKey);
    const has = !!((userPrefs.assignmentNotes || {})[key] || {}).text;
    const title = card.querySelector('.card-title');
    if (!title) return;
    const ind = title.querySelector('.a-note-ind');
    if (has && !ind) title.insertAdjacentHTML('beforeend', noteIndicatorHTML());
    else if (!has && ind) ind.remove();
  });
}
