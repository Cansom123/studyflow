/* ===========================
   SETTINGS EXTRAS
   - Full data export: one JSON file with everything the student owns in
     StudyFlow, and a spreadsheet (CSV) of assignments and scores that opens
     in Excel / Google Sheets. Nothing here includes the Canvas token or
     password; it is only data already on screen, saved to a file on the
     student's own device.
   - Quiet hours: browser notifications (due-soon, new feedback) stay silent
     between two times, including overnight ranges. Timer alerts for a
     session the student started themselves still come through. Email
     reminders are sent by the server and are not affected.
=========================== */

/* ---- Export ---------------------------------------------------------------- */
function buildFullExport() {
  return {
    app: 'StudyFlow',
    exportedAt: new Date().toISOString(),
    account: { email: USER_EMAIL },
    assignments: cachedAssignments,
    gradedAssignments: cachedGradedAssignments,
    grades: cachedGrades,
    goals: userGoals,
    syllabi: cachedSyllabi,
    announcements: cachedAnnouncements,
    feedback: cachedFeedback,
    messages: cachedMessages,
    studySessions: cachedStudySessions,
    classNotes: typeof cachedClassNotes !== 'undefined' ? cachedClassNotes : [],
    checklists: typeof cachedChecklists !== 'undefined' ? cachedChecklists : [],
    doneMarks: [...doneSet],
    completedCount: getCompletedCount(),
    // Your own settings and what you saved: links, assignment notes, saved
    // updates, muted classes, study goals, hidden syllabus dates...
    preferences: userPrefs,
  };
}

function exportAllData() {
  downloadTextFile('StudyFlow Data Export.json', JSON.stringify(buildFullExport(), null, 2));
  showReward('Exported everything to a JSON file.', 'check');
}

// A cell safe to open in a spreadsheet: quoted, and defanged if it starts
// with a character a spreadsheet would treat as a formula.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildAssignmentsCsv() {
  const norm = s => (s || '').trim().toLowerCase();
  const gradeFor = course => {
    const g = (cachedGrades || []).find(x => norm(x.course_name) === norm(course));
    return g ? (g.current_score != null ? g.current_score : g.final_score) : '';
  };
  // The graded list has every assignment with its score; the open list adds
  // completion state.
  const openByKey = new Map((cachedAssignments || []).map(a => [`${norm(a.title)}|${norm(a.course)}`, a]));
  const rows = (cachedGradedAssignments && cachedGradedAssignments.length ? cachedGradedAssignments : cachedAssignments || []);
  const header = ['Class', 'Assignment', 'Type', 'Due date', 'Points possible', 'Score', 'Percent', 'Status', 'Class grade %'];
  const lines = [header.map(csvCell).join(',')];
  rows.slice().sort((a, b) => (a.course || '').localeCompare(b.course || '') || new Date(a.due_date || 0) - new Date(b.due_date || 0)).forEach(a => {
    const open = openByKey.get(`${norm(a.title)}|${norm(a.course)}`);
    const done = open && (open.completed || doneSet.has(decodeURIComponent(doneKey(open))));
    const status = a.score != null ? 'Graded' : a.is_missing && !a.is_excused ? 'Missing' : a.is_excused ? 'Excused' : done ? 'Done' : 'Open';
    const pct = a.score != null && a.points_possible ? ((a.score / a.points_possible) * 100).toFixed(1) : '';
    lines.push([
      cleanCourseName(a.course || ''), a.title, getBadge(a.assignment_type, a.title)[1],
      a.due_date ? new Date(a.due_date).toISOString().slice(0, 10) : '',
      a.points_possible ?? '', a.score ?? '', pct, status, gradeFor(a.course),
    ].map(csvCell).join(','));
  });
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads accents correctly
}

function exportAssignmentsCsv() {
  const csv = buildAssignmentsCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'StudyFlow Assignments.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showReward('Saved a spreadsheet of your assignments.', 'check');
}

/* ---- Quiet hours ------------------------------------------------------------ */
const QUIET_DEFAULT = { enabled: false, start: '22:00', end: '07:00' };
function quietHours() { return { ...QUIET_DEFAULT, ...(userPrefs.quietHours || {}) }; }

function timeToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// True when `now` falls inside the quiet window. Handles windows that cross
// midnight (22:00 to 07:00). Equal start and end means no window.
function isWithinQuietHours(q, now) {
  if (!q.enabled) return false;
  const s = timeToMinutes(q.start), e = timeToMinutes(q.end);
  if (s == null || e == null || s === e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

function inQuietHours() { return isWithinQuietHours(quietHours(), new Date()); }

function onQuietHoursToggle(on) {
  userPrefs.quietHours = { ...quietHours(), enabled: !!on };
  saveUserPrefs();
  syncQuietHoursUI();
}
function onQuietHoursTime(which, value) {
  if (!timeToMinutes(value)) return;
  userPrefs.quietHours = { ...quietHours(), [which]: value };
  saveUserPrefs();
  syncQuietHoursUI();
}

function syncQuietHoursUI() {
  const q = quietHours();
  const sw = document.getElementById('pref-quiet-hours'); if (sw) sw.checked = !!q.enabled;
  const row = document.getElementById('quiet-hours-row'); if (row) row.style.display = q.enabled ? 'flex' : 'none';
  const s = document.getElementById('pref-quiet-start'); if (s && s.value !== q.start) s.value = q.start;
  const e = document.getElementById('pref-quiet-end'); if (e && e.value !== q.end) e.value = q.end;
  const note = document.getElementById('quiet-hours-note');
  if (note) {
    const same = timeToMinutes(q.start) === timeToMinutes(q.end);
    note.textContent = !q.enabled ? '' : same ? 'Pick two different times.' : inQuietHours() ? 'Quiet right now.' : 'Notifications are on right now.';
  }
}
