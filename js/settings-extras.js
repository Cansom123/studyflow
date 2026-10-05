/* ===========================
   SETTINGS EXTRAS
   - PDF report: a printable summary (grades, open and finished work,
     goals, study time) saved with the browser's "Save as PDF".
   - A spreadsheet (CSV) of assignments and scores for Excel / Google
     Sheets. Neither includes the Canvas token or password; it is only data
     already on screen, saved to a file on the student's own device.
   - Quiet hours: browser notifications (due-soon, new feedback) stay silent
     between two times, including overnight ranges. Timer alerts for a
     session the student started themselves still come through. Email
     reminders are sent by the server and are not affected.
=========================== */

/* ---- PDF report ------------------------------------------------------------ */
// A clean, printable summary (grades, open and finished work, goals, study
// time). It is built as a plain page and handed to the browser's print
// dialog, where "Save as PDF" makes the file, so no library is needed and it
// works when index.html is opened straight from disk.
function reportFmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
}

function buildReportHTML() {
  const esc = escapeHtml;
  const norm = s => (s || '').trim().toLowerCase();
  const isDone = a => a.completed || doneSet.has(decodeURIComponent(doneKey(a)));
  const name = (document.getElementById('home-greeting-name')?.textContent || '').trim();
  const today = new Date();

  const grades = (cachedGrades || []).filter(g => g.course_name).slice()
    .sort((x, y) => cleanCourseName(x.course_name).localeCompare(cleanCourseName(y.course_name)));
  const gradeRows = grades.map(g => {
    const pct = g.current_score != null ? g.current_score : g.final_score;
    return `<tr><td>${esc(cleanCourseName(g.course_name))}</td><td class="num">${pct != null ? esc(String(pct)) + '%' : '-'}</td><td class="num">${esc(g.current_grade || g.final_grade || '-')}</td></tr>`;
  }).join('');

  const all = cachedAssignments || [];
  const open = all.filter(a => !isDone(a))
    .sort((x, y) => new Date(x.due_date || '9999-01-01') - new Date(y.due_date || '9999-01-01'));
  const done = all.filter(isDone)
    .sort((x, y) => new Date(y.completed_at || y.due_date || 0) - new Date(x.completed_at || x.due_date || 0));
  const aRow = a => `<tr><td>${esc(cleanCourseName(a.course || ''))}</td><td>${esc(a.title || '')}</td><td>${reportFmtDate(a.due_date)}</td><td class="num">${a.points_possible ?? '-'}</td></tr>`;
  const closed = typeof closedSuggestionList === 'function' ? closedSuggestionList() : [];

  const goals = typeof resolveGoals === 'function' ? resolveGoals(userGoals, all, cachedGrades) : [];
  const goalRows = goals.map(r => `<tr><td>${esc(r.goal)}</td><td>${esc(r.courses.map(cleanCourseName).join(', ') || '-')}</td><td class="num">${r.grade && r.grade.pct != null ? r.grade.pct + '%' : '-'}</td><td class="num">${r.target != null ? r.target + '%' : '-'}</td><td>${r.target == null || !r.grade || r.grade.pct == null ? '-' : r.gap ? r.gap + ' points to go' : 'Met'}</td></tr>`).join('');

  const st = computeStudyStats(cachedStudySessions || [], userPrefs, (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })());

  const table = (head, rows, empty) => rows
    ? `<table><thead><tr>${head.map((h, i) => `<th${/pts|grade|%|now|target|letter/i.test(h) && i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">${empty}</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>StudyFlow Report - ${esc(today.toLocaleDateString('en-US'))}</title>
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; font-size: 11pt; line-height: 1.4; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-family: Georgia, "Times New Roman", serif; font-size: 22pt; font-weight: 700; letter-spacing: -0.5px; }
  .brand i { font-style: italic; }
  .who { text-align: right; font-size: 9.5pt; color: #444; }
  h2 { font-size: 12.5pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ccc; break-after: avoid; }
  .stats { display: flex; gap: 10px; }
  .stat { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; }
  .stat b { display: block; font-size: 14pt; }
  .stat span { font-size: 9pt; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 1px solid #999; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .empty { color: #666; font-style: italic; margin: 4px 0; }
  .note { font-size: 9pt; color: #555; margin: 0 0 6px; }
  footer { margin-top: 26px; font-size: 8.5pt; color: #777; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head><body>
<header>
  <div class="brand">Study<i>Flow</i></div>
  <div class="who">${name ? esc(name) + '<br>' : ''}${esc(USER_EMAIL || '')}<br>Report from ${esc(today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</div>
</header>

<h2>At a glance</h2>
<div class="stats">
  <div class="stat"><b>${open.length}</b><span>assignments still to do</span></div>
  <div class="stat"><b>${typeof getCompletedCount === 'function' ? getCompletedCount() : done.length}</b><span>assignments done in StudyFlow</span></div>
  <div class="stat"><b>${esc(st.weekFmt)}</b><span>studied in the last 7 days</span></div>
  <div class="stat"><b>${esc(st.totalFmt)}</b><span>studied in total</span></div>
</div>

<h2>Grades</h2>
${table(['Class', 'Grade %', 'Letter'], gradeRows, 'No grades published yet.')}

<h2>Still to do (${open.length})</h2>
${table(['Class', 'Assignment', 'Due', 'Pts'], open.map(aRow).join(''), 'Nothing open. Nice.')}

${closed.length ? `<h2>Can't be submitted anymore (${closed.length})</h2><p class="note">Canvas has closed these. Worth asking the teacher about late credit for recent or high-point ones.</p>${table(['Class', 'Assignment', 'Was due', 'Pts'], closed.map(aRow).join(''), '')}` : ''}

<h2>Done (${done.length})</h2>
${table(['Class', 'Assignment', 'Due', 'Pts'], done.slice(0, 60).map(aRow).join(''), 'Nothing marked done yet.')}
${done.length > 60 ? `<p class="note">Showing the 60 most recent.</p>` : ''}

<h2>Goals</h2>
${table(['Goal', 'Class', 'Now', 'Target', 'Status'], goalRows, 'No goals set yet.')}

<footer>Made with StudyFlow. Grades and assignments come from Canvas as of the last sync.</footer>
</body></html>`;
}

function exportPdfReport() {
  const html = buildReportHTML();
  document.getElementById('report-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'report-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  // Give the page a moment to lay out, then open the print dialog, where
  // "Save as PDF" is the destination that makes the file.
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (e) { showReward('Could not open the print dialog. Try again.', 'error'); }
    setTimeout(() => frame.remove(), 60000);
  }, 250);
  showReward('Choose "Save as PDF" in the print window.', 'check');
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
  showReward('Saved. Open it with Excel, or import it into Google Sheets.', 'check');
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

/* ---- Settings sub-tabs ----------------------------------------------------- */
// Settings is split into small panels (Display, Canvas, Notifications, Study,
// Account, Help) so it is never one long wall of options. The last panel
// opened is remembered on this device.
const SETTINGS_PANELS = ['display', 'canvas', 'alerts', 'study', 'account', 'help'];
function showSettingsPanel(id) {
  if (!SETTINGS_PANELS.includes(id)) id = 'display';
  document.querySelectorAll('#page-settings .settings-panel').forEach(p => {
    const on = p.dataset.panel === id;
    p.hidden = !on;
    if (on) { p.classList.remove('in'); void p.offsetWidth; p.classList.add('in'); }
  });
  document.querySelectorAll('#page-settings .settings-tab').forEach(t => {
    const on = t.dataset.panel === id;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
    if (on && t.scrollIntoView && t.parentElement.scrollWidth > t.parentElement.clientWidth) {
      t.parentElement.scrollTo({ left: t.offsetLeft - 16, behavior: 'smooth' });
    }
  });
  try { localStorage.setItem('sf_settings_panel', id); } catch (e) {}
}
(function initSettingsPanel() {
  let id = 'display';
  try { id = localStorage.getItem('sf_settings_panel') || 'display'; } catch (e) {}
  showSettingsPanel(id);
})();
// Arrow keys move between the sub-tabs, like any tab list.
document.addEventListener('keydown', e => {
  const t = e.target.closest && e.target.closest('.settings-tab');
  if (!t || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  const tabs = [...document.querySelectorAll('#page-settings .settings-tab')];
  const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  showSettingsPanel(next.dataset.panel); next.focus(); e.preventDefault();
});
