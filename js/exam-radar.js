/* ===========================
   EXAM RADAR (Home)
   Exams in the next 30 days: real Canvas exams (strict, see exam-core.js),
   plus ones the student adds for exams announced in class. Each shows how
   far away it is and, with one tap, plans study sessions on the days
   before it (added to the calendar like any study block). Full sync also
   shows what it's worth; Quick start gets a glimpse of that.
   A reminder the day before, through the existing browser notifications.
=========================== */

let cachedExams = [];
let examsLoaded = false;
let examFormOpen = false;
let examFormPrefill = null; // { title, course } when dating an exam Canvas already knows about

async function loadExams() {
  const { ok, data } = await sbFetchWithRetry(`/rest/v1/exams?user_id=eq.${USER_ID}&select=*&order=exam_date.asc`);
  cachedExams = ok && Array.isArray(data) ? data : [];
  examsLoaded = true;
  renderExamRadar();
}

// Open work plus graded work (Full sync), so each exam's share of the
// grade is worked out from its whole category.
const examAllAssignments = () => [...(cachedAssignments || []), ...(cachedGradedAssignments || [])];

function examRadarList() {
  return collectExams({
    assignments: cachedAssignments || [],
    allAssignments: examAllAssignments(),
    manual: cachedExams,
    hidden: (userPrefs && userPrefs.examRadarHidden) || [],
  });
}

function examUndatedList() {
  return undatedExams({
    assignments: cachedAssignments || [],
    allAssignments: examAllAssignments(),
    manual: cachedExams,
    hidden: (userPrefs && userPrefs.examRadarHidden) || [],
  });
}

// Classes the student has, for the "Add exam" picker.
function examCourseOptions() {
  const names = new Set();
  (cachedAssignments || []).forEach(a => a.course && names.add(a.course));
  (cachedGrades || []).forEach(g => g.course_name && names.add(g.course_name));
  return [...names].sort((a, b) => cleanCourseName(a).localeCompare(cleanCourseName(b)));
}

function renderExamRadar() {
  const main = document.querySelector('#page-home .home-col-main');
  if (!main) return;
  let host = document.getElementById('home-exams');
  if (!host) {
    host = document.createElement('section');
    host.id = 'home-exams';
    host.className = 'exam-radar';
    host.setAttribute('aria-labelledby', 'exam-radar-title');
    const after = document.getElementById('home-today3');
    main.insertBefore(host, after ? after.nextSibling : main.firstChild);
  }
  const exams = examRadarList();
  const fmtDate = e => e.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + (e.hasTime && e.source === 'manual' ? ' · ' + e.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
  const rows = exams.map(e => {
    const planned = plannedSessionCount(e, cachedStudySessions);
    const days = planStudyDays(e);
    const worth = examWorthText(e);
    const urgent = e.daysUntil <= 2;
    return `<li class="er-item${urgent ? ' soon' : ''}">
      <div class="er-when"><b>${e.daysUntil === 0 ? 'Today' : e.daysUntil}</b>${e.daysUntil === 0 ? '' : `<span>day${e.daysUntil === 1 ? '' : 's'}</span>`}</div>
      <div class="er-body">
        <div class="er-title">${escapeHtml(e.title)}</div>
        <div class="er-meta">${escapeHtml(cleanCourseName(e.course))} · ${fmtDate(e)}${e.source === 'manual' ? ' · <span class="er-tag">Added by you</span>' : ''}</div>
        ${worth ? `<div class="er-worth">${escapeHtml(worth)}</div>` : ''}
        <div class="er-actions">
          ${planned ? `<span class="er-planned">✓ ${planned} study session${planned === 1 ? '' : 's'} planned</span>`
            : days.length ? `<button type="button" class="er-plan" onclick="planExamStudy('${encodeURIComponent(e.key)}', this)">Plan ${days.length} study session${days.length === 1 ? '' : 's'}</button>`
            : `<span class="er-planned">Good luck today</span>`}
          ${e.source === 'manual'
            ? `<button type="button" class="er-link" onclick="removeExam('${e.id}')">Remove</button>`
            : `<button type="button" class="er-link" onclick="hideExam('${encodeURIComponent(e.key)}')" title="Hide this from the radar">Not an exam</button>`}
        </div>
      </div>
    </li>`;
  }).join('');

  // Exams Canvas knows about but has no date for (given in class): one tap
  // to date them, then they join the countdown and study planning.
  const undated = examFormOpen ? [] : examUndatedList();
  const undatedHTML = undated.length ? `
    <div class="er-undated-head">No date in Canvas yet</div>
    <ul class="er-undated">${undated.map(e => {
      const worth = examWorthText(e);
      return `<li>
        <div class="er-body"><div class="er-title">${escapeHtml(e.title)}</div>
          <div class="er-meta">${escapeHtml(cleanCourseName(e.course))}${worth ? ` · <b>${escapeHtml(worth)}</b>` : ''}</div></div>
        <button type="button" class="er-add" onclick="toggleExamForm(true, '${encodeURIComponent(e.key)}')">Add date</button>
      </li>`;
    }).join('')}</ul>` : '';

  const courses = examCourseOptions();
  const pre = examFormPrefill || {};
  if (pre.course && !courses.includes(pre.course)) courses.unshift(pre.course);
  const form = examFormOpen ? `
    <form class="er-form" onsubmit="event.preventDefault(); saveExam();">
      <label class="er-field"><span>Exam</span><input id="er-title" type="text" maxlength="120" placeholder="e.g. Midterm 2" required value="${escapeHtml(pre.title || '')}"></label>
      <label class="er-field"><span>Class</span>
        <select id="er-course">${courses.map(c => `<option value="${escapeHtml(c)}"${c === pre.course ? ' selected' : ''}>${escapeHtml(cleanCourseName(c))}</option>`).join('')}<option value="">Other / not listed</option></select>
      </label>
      <div class="er-row">
        <label class="er-field"><span>Date</span><input id="er-date" type="date" required min="${ymd(new Date())}"></label>
        <label class="er-field"><span>Time (optional)</span><input id="er-time" type="time"></label>
      </div>
      <div id="er-msg"></div>
      <div class="er-form-actions"><button type="submit" class="er-save">Add exam</button><button type="button" class="er-link" onclick="toggleExamForm(false)">Cancel</button></div>
    </form>` : '';

  const glimpse = canvasMode === 'feed' && exams.some(e => e.source === 'canvas')
    ? `<button type="button" class="er-glimpse" onclick="openFullSyncUpgrade()">🔒 See how much each exam counts toward your grade</button>` : '';

  host.innerHTML = `
    <div class="er-head">
      <div><h2 class="er-heading" id="exam-radar-title">Exam radar</h2>
        <div class="er-sub">${exams.length ? `${exams.length} in the next 30 days` : 'Nothing in the next 30 days'}</div></div>
      ${examFormOpen ? '' : `<button type="button" class="er-add" onclick="toggleExamForm(true)">+ Add exam</button>`}
    </div>
    ${form}
    ${exams.length ? `<ol class="er-list">${rows}</ol>` : examFormOpen || undated.length ? '' : `<div class="er-empty">No exams found in Canvas. If a teacher announced one in class, add it so StudyFlow can plan around it.</div>`}
    ${undatedHTML}
    ${glimpse}`;
  remindExamsTomorrow(exams);
}

// encKey: an undated Canvas exam to date (fills in its name and class).
function toggleExamForm(open, encKey) {
  examFormOpen = open;
  examFormPrefill = null;
  if (open && encKey) {
    const e = examUndatedList().find(x => x.key === decodeURIComponent(encKey));
    if (e) examFormPrefill = { title: e.title, course: e.course };
  }
  renderExamRadar();
  if (open) setTimeout(() => document.getElementById(examFormPrefill ? 'er-date' : 'er-title')?.focus(), 30);
}

async function saveExam() {
  const title = document.getElementById('er-title').value.trim();
  const course = document.getElementById('er-course').value;
  const date = document.getElementById('er-date').value;
  const time = document.getElementById('er-time').value;
  const msg = document.getElementById('er-msg');
  if (!title || !date) { msg.innerHTML = '<div class="msg-error">Add the exam name and date.</div>'; return; }
  const { ok, data } = await sbFetchWithRetry('/rest/v1/exams', 'POST',
    { user_id: USER_ID, title, course: course || null, exam_date: date, exam_time: time || null }, true, { 'Prefer': 'return=representation' });
  if (!ok) { msg.innerHTML = '<div class="msg-error">Couldn\'t save that exam. Try again.</div>'; return; }
  if (Array.isArray(data) && data[0]) cachedExams.push(data[0]);
  examFormOpen = false;
  examFormPrefill = null;
  renderExamRadar();
  if (typeof showReward === 'function') showReward('Exam added to your radar.', 'calendar');
}

async function removeExam(id) {
  cachedExams = cachedExams.filter(e => String(e.id) !== String(id));
  renderExamRadar();
  await sbFetchWithRetry(`/rest/v1/exams?id=eq.${id}&user_id=eq.${USER_ID}`, 'DELETE');
}

function hideExam(encKey) {
  const key = decodeURIComponent(encKey);
  userPrefs.examRadarHidden = [...new Set([...(userPrefs.examRadarHidden || []), key])];
  saveUserPrefs();
  renderExamRadar();
}

// Study sessions on the days before the exam, on the calendar like any
// study block; each opens the focus timer when it's time.
async function planExamStudy(encKey, btn) {
  const exam = examRadarList().find(e => e.key === decodeURIComponent(encKey));
  if (!exam) return;
  const days = planStudyDays(exam);
  if (!days.length) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Planning…'; }
  const rows = days.map(d => ({
    user_id: USER_ID, title: examStudyTitle(exam), course: cleanCourseName(exam.course) || null,
    session_date: d, completed: false,
  }));
  const { ok } = await sbFetchWithRetry('/rest/v1/study_sessions', 'POST', rows, true);
  if (!ok) { if (btn) { btn.disabled = false; btn.textContent = 'Try again'; } return; }
  await loadStudySessions();
  renderExamRadar();
  const when = days.map(d => new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })).join(', ');
  if (typeof showReward === 'function') showReward(`Study sessions planned: ${when}.`, 'calendar');
}

// The evening-before nudge, once per exam, when browser notifications are on.
function remindExamsTomorrow(exams) {
  exams.filter(e => e.daysUntil === 1).forEach(e => {
    const k = `sf_exam_reminded_${USER_ID}_${e.key}`;
    try { if (localStorage.getItem(k)) return; } catch (err) { return; }
    const sent = notifyBrowser(`Exam tomorrow: ${e.title}`, { body: cleanCourseName(e.course) || 'StudyFlow', tag: 'sf-exam-' + e.key });
    if (sent !== 'quiet' && userPrefs.browserNotificationsEnabled) { try { localStorage.setItem(k, '1'); } catch (err) {} }
  });
}

(function hookExamRadar() {
  const orig = window.renderHome;
  if (typeof orig !== 'function') return;
  window.renderHome = function () {
    const r = orig.apply(this, arguments);
    try {
      if (!examsLoaded && typeof USER_ID !== 'undefined' && USER_ID) { examsLoaded = true; loadExams(); }
      else if (!examFormOpen) renderExamRadar(); // never wipe a half-typed exam
    } catch (e) { console.warn('[exam radar]', e); }
    return r;
  };
})();
