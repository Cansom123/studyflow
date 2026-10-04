/* ===========================
   UPCOMING CALENDAR EXTRAS
   - Week view beside the month view: seven tall columns showing each day's
     assignments and study blocks right in the grid.
   - Drag and drop (mouse devices): drag a study block onto another day to
     move it, or drag the "Study block" chip onto a day to start scheduling
     study time there. Phones keep the + Schedule study time button.
   Both reuse the month grid's day cells (.cal-day, data-key), so hover
   preview, click-to-pin and the day panel all keep working unchanged.
=========================== */
let dueCalView = (() => {
  try { return localStorage.getItem('sf_cal_view') === 'week' ? 'week' : 'month'; } catch (e) { return 'month'; }
})();
let dueCalWeekStart = startOfWeek(new Date());

const WEEK_ITEM_LIMIT = 4;
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateFromKey(key) { return new Date(key + 'T00:00:00'); }

// The seven days of a week with each day's items, as plain data.
function buildDueCalendarWeekCells(weekStart, assignments, sessions, todayStr, selectedKey) {
  const byDate = {};
  assignments.forEach(a => {
    if (!a.due_date) return;
    const d = new Date(a.due_date); d.setHours(0, 0, 0, 0);
    (byDate[ymd(d)] = byDate[ymd(d)] || []).push({ type: 'a', title: a.title, sub: cleanCourseName(a.course || a.course_name || ''), overdue: false });
  });
  const studyByDate = {};
  sessions.forEach(s => { (studyByDate[s.session_date] = studyByDate[s.session_date] || []).push({ type: 's', title: s.title, sub: s.start_time ? fmtTime12(s.start_time) : '', done: !!s.completed }); });
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
    const key = ymd(date);
    const items = (byDate[key] || []).concat(studyByDate[key] || []);
    return { key, dow: DOW_SHORT[date.getDay()], dnum: date.getDate(), isToday: key === todayStr, isSelected: key === selectedKey, items };
  });
}

function dueCalWeekTitle() {
  const start = new Date(dueCalWeekStart), end = new Date(dueCalWeekStart);
  end.setDate(end.getDate() + 6);
  const m = d => months[d.getMonth()].slice(0, 3);
  return start.getMonth() === end.getMonth()
    ? `${m(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
    : `${m(start)} ${start.getDate()} – ${m(end)} ${end.getDate()}, ${end.getFullYear()}`;
}

function renderDueCalendarWeek() {
  const gridEl = document.getElementById('due-cal-grid');
  const titleEl = document.getElementById('due-cal-title');
  if (!gridEl || !titleEl) return;
  titleEl.textContent = dueCalWeekTitle();
  const cells = buildDueCalendarWeekCells(dueCalWeekStart, dueCalAssignments, cachedStudySessions, ymd(new Date()), dueCalSelectedDate);
  gridEl.innerHTML = cells.map(c => {
    const shown = c.items.slice(0, WEEK_ITEM_LIMIT);
    const more = c.items.length - shown.length;
    return `<div class="cal-day cal-wday${c.isToday ? ' today' : ''}${c.isSelected ? ' selected' : ''}" data-key="${c.key}" onclick="selectDueCalDate('${c.key}')">
      <div class="cwd-head"><span class="cwd-dow">${c.dow}</span><span class="cal-day-num">${c.dnum}</span></div>
      <div class="cwd-items">
        ${shown.map(it => `<div class="cwd-item ${it.type === 's' ? 'study' : 'due'}${it.done ? ' done' : ''}" title="${escapeHtml(it.title)}${it.sub ? ' · ' + escapeHtml(it.sub) : ''}"><span class="cwd-dot"></span><span class="cwd-text">${escapeHtml(it.title)}</span></div>`).join('')}
        ${more > 0 ? `<div class="cwd-more">+${more} more</div>` : ''}
        ${!c.items.length ? '<div class="cwd-empty">Free</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

// Month/week chrome that has to follow the current view on every render.
function syncDueCalViewChrome() {
  const week = dueCalView === 'week';
  const card = document.querySelector('.due-cal-card');
  if (card) card.classList.toggle('week-view', week);
  document.getElementById('due-cal-grid')?.classList.toggle('cal-week-grid', week);
  document.querySelectorAll('#due-cal-view .seg-btn').forEach(b => {
    const on = b.dataset.view === dueCalView;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  const prev = document.querySelector('.due-cal-card .cal-header .cal-nav-btn');
  if (prev) prev.title = week ? 'Previous week' : 'Previous month';
}

function setDueCalView(view) {
  view = view === 'week' ? 'week' : 'month';
  if (view === dueCalView) return;
  dueCalView = view;
  try { localStorage.setItem('sf_cal_view', view); } catch (e) {}
  // Land on whatever the student was looking at: the pinned day if any,
  // otherwise today.
  const anchor = dueCalSelectedDate ? dateFromKey(dueCalSelectedDate) : new Date();
  if (view === 'week') dueCalWeekStart = startOfWeek(anchor);
  else dueCalMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  renderDueCalendar();
}

function shiftDueCalWeek(delta) {
  dueCalWeekStart = new Date(dueCalWeekStart.getFullYear(), dueCalWeekStart.getMonth(), dueCalWeekStart.getDate() + delta * 7);
  dueCalMonth = new Date(dueCalWeekStart.getFullYear(), dueCalWeekStart.getMonth(), 1);
  renderDueCalendar();
}

/* ---- Drag and drop -------------------------------------------------------- */
const DND_SESSION = 'application/x-sf-session';
const DND_NEW = 'application/x-sf-new-block';

function initDueCalDnD() {
  const grid = document.getElementById('due-cal-grid');
  if (!grid || grid.dataset.dndBound) return;
  grid.dataset.dndBound = '1';
  const ours = e => e.dataTransfer && [...e.dataTransfer.types].some(t => t === DND_SESSION || t === DND_NEW);
  const clear = () => grid.querySelectorAll('.drop-target').forEach(c => c.classList.remove('drop-target'));
  grid.addEventListener('dragover', e => {
    if (!ours(e)) return;
    const cell = e.target.closest('.cal-day');
    if (!cell) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!cell.classList.contains('drop-target')) { clear(); cell.classList.add('drop-target'); }
  });
  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget)) clear();
  });
  grid.addEventListener('drop', e => {
    if (!ours(e)) return;
    const cell = e.target.closest('.cal-day');
    clear();
    if (!cell || !cell.dataset.key) return;
    e.preventDefault();
    const sessionId = e.dataTransfer.getData(DND_SESSION);
    if (sessionId) moveStudySession(sessionId, cell.dataset.key);
    else dropNewStudyBlock(cell.dataset.key);
  });
  // Sources are delegated at the document: study cards are re-rendered often.
  document.addEventListener('dragstart', e => {
    const card = e.target.closest && e.target.closest('[data-session-id]');
    const chip = e.target.closest && e.target.closest('#cal-drag-chip');
    if (card) { e.dataTransfer.setData(DND_SESSION, card.dataset.sessionId); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); }
    else if (chip) { e.dataTransfer.setData(DND_NEW, '1'); e.dataTransfer.effectAllowed = 'copy'; chip.classList.add('dragging'); }
  });
  document.addEventListener('dragend', e => {
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    clear();
  });
}

function fmtDayLabel(key) {
  return dateFromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

async function moveStudySession(id, key) {
  const s = cachedStudySessions.find(x => String(x.id) === String(id));
  if (!s || s.session_date === key) return;
  const old = s.session_date;
  s.session_date = key;
  dueCalSelectedDate = key;
  dueCalPinned = true;
  renderDueCalendar();
  renderStudyTab();
  renderHome();
  showReward(`Moved to ${fmtDayLabel(key)}.`, 'calendar');
  try {
    const { ok } = await sbFetchWithRetry(`/rest/v1/study_sessions?id=eq.${id}`, 'PATCH', { session_date: key }, true);
    if (!ok) throw new Error('save failed');
  } catch (e) {
    s.session_date = old;
    renderDueCalendar(); renderStudyTab(); renderHome();
    showReward("Couldn't move that - it's back where it was.", 'error');
  }
}

// A new block dropped on a day: select the day and open the schedule form
// there, so title/time are filled in the normal way.
function dropNewStudyBlock(key) {
  dueCalSelectedDate = key;
  dueCalPinned = true;
  renderDueCalendar();
  const form = document.getElementById('study-form');
  if (form && form.style.display === 'none') toggleStudyForm();
  const input = document.getElementById('study-form-title');
  if (input) { input.focus({ preventScroll: false }); input.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
