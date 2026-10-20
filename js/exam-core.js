/* ===========================
   EXAM RADAR (pure functions, no app state)
   Which assignments are real exams, what's coming up, and when to study.
   Strict on purpose: real Canvas data is full of "Midterm Feedback Survey",
   "Essay Final Draft" and music titles with "Finale" in them, and a radar
   that cries wolf gets ignored. With Full sync, the assignment's grade
   category ("Exams", "Tests") settles it whatever the assignment is named.
   Tested by tests/exam-core.test.js.
=========================== */

const EXAM_WORD = /\b(exams?|midterms?|finals?|tests?)\b/i;
// Things that mention an exam without being one.
const NOT_AN_EXAM = /\b(drafts?|survey|feedback|review|study guide|practice|reflections?|wrapper|corrections?|sign[- ]?ups?|registration|prep|preparation|pre-?test|post-?test|retake request|make-?up request|syllabus)\b/i;
const NOT_A_FINAL = /\bfinal\s+(projects?|papers?|essays?|presentations?|portfolios?|reports?|videos?|submissions?|versions?|copy|reflections?|grades?)\b/i;
const NOT_A_TEST = /\btests?\s+(your|submission|run|page)\b|\b(speed|personality|typing|placement)\s+tests?\b/i;
const EXAM_GROUP = /\b(exams?|tests?|midterms?|finals?)\b/i;

// Returns 'title' or 'group' (why it counts), or null when it isn't an exam.
// A category worth 0% ("Final Grade", a placeholder) is never an exam category.
function examSignal(a) {
  const title = String((a && a.title) || '');
  if (!title || NOT_AN_EXAM.test(title) || NOT_A_FINAL.test(title) || NOT_A_TEST.test(title)) return null;
  const zeroWeight = a.group_weight != null && Number(a.group_weight) === 0;
  if (a.assignment_group && EXAM_GROUP.test(a.assignment_group) && !/final\s+grade/i.test(a.assignment_group) && !zeroWeight) return 'group';
  if (zeroWeight) return null;
  return EXAM_WORD.test(title) ? 'title' : null;
}

const sameItem = (a, b) => String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase()
  && String(a.course || '').trim().toLowerCase() === String(b.course || '').trim().toLowerCase();

// Share of the final grade, when the class weights its categories: the
// category's weight split by points across everything in that category.
// Three 70-point exams in a 60% "Exams" category -> each about 20%.
function gradeShare(exam, allAssignments) {
  if (!exam.weight || !exam.group || !exam.points) return null;
  const seen = new Set();
  let total = 0;
  (allAssignments || []).forEach(a => {
    if (a.assignment_group !== exam.group || String(a.course || '') !== String(exam.course || '')) return;
    const k = `${a.title}||${a.course}`;
    if (seen.has(k) || a.points_possible == null) return;
    seen.add(k);
    total += Number(a.points_possible) || 0;
  });
  if (!total) return null;
  return Math.round((exam.weight * exam.points / total) * 10) / 10;
}

const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysBetween = (from, to) => Math.round((dayStart(to) - dayStart(from)) / 86400000);
const isoDay = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// Everything on the radar from today through `horizonDays` ahead, soonest
// first. assignments: open Canvas work. manual: rows from the exams table
// ({ id, title, course, exam_date 'YYYY-MM-DD', exam_time 'HH:MM' }).
// hidden: keys the student marked "Not an exam".
// allAssignments (optional): every assignment, graded ones included, so a
// share of the grade can be worked out from the whole category.
function collectExams({ assignments, allAssignments, manual, hidden, now = new Date(), horizonDays = 30 }) {
  const hide = new Set(hidden || []);
  const everything = allAssignments || assignments || [];
  const canvasFields = a => ({
    points: a.points_possible != null ? Number(a.points_possible) : null,
    group: a.assignment_group || null,
    weight: a.group_weight != null ? Number(a.group_weight) : null,
  });
  const out = [];
  (assignments || []).forEach(a => {
    if (!a.due_date || a.completed) return;
    const why = examSignal(a);
    if (!why) return;
    const key = `a:${a.title}||${a.course}`;
    if (hide.has(key)) return;
    out.push({ key, source: 'canvas', why, id: a.id || null, title: a.title, course: a.course || '', date: new Date(a.due_date), hasTime: true, ...canvasFields(a) });
  });
  (manual || []).forEach(m => {
    if (!m.exam_date) return;
    const [y, mo, d] = String(m.exam_date).split('-').map(Number);
    const [h, mi] = String(m.exam_time || '').split(':').map(Number);
    const date = new Date(y, mo - 1, d, Number.isFinite(h) ? h : 9, Number.isFinite(mi) ? mi : 0);
    // A date added for an exam Canvas knows about (but had no date for)
    // keeps that exam's points and weight.
    const twin = everything.find(a => sameItem(a, m));
    out.push({ key: `m:${m.id}`, source: 'manual', why: 'manual', id: m.id, title: m.title, course: m.course || '', date, hasTime: !!m.exam_time,
      ...(twin ? canvasFields(twin) : { points: null, group: null, weight: null }) });
  });
  return out
    .map(e => ({ ...e, daysUntil: daysBetween(now, e.date), share: gradeShare(e, everything) }))
    .filter(e => e.daysUntil >= 0 && e.daysUntil <= horizonDays)
    .sort((x, y) => x.date - y.date);
}

// Exams Canvas knows about but has no date for (often given in class), not
// taken yet and not already dated by the student. Full sync mostly: the
// grade category is what finds them.
function undatedExams({ assignments, allAssignments, manual, hidden }) {
  const hide = new Set(hidden || []);
  const everything = allAssignments || assignments || [];
  const seen = new Set();
  return everything.filter(a => {
    if (a.due_date || a.completed || a.score != null || !examSignal(a)) return false;
    const k = `a:${a.title}||${a.course}`;
    if (hide.has(k) || seen.has(k)) return false;
    seen.add(k);
    return !(manual || []).some(m => sameItem(m, a));
  }).map(a => {
    const e = { key: `a:${a.title}||${a.course}`, title: a.title, course: a.course || '',
      points: a.points_possible != null ? Number(a.points_possible) : null, group: a.assignment_group || null,
      weight: a.group_weight != null ? Number(a.group_weight) : null };
    return { ...e, share: gradeShare(e, everything) };
  });
}

// How many study sessions to plan, and on which days: the last one the day
// before, the rest spread back toward today (never before it).
function planStudyDays(exam, now = new Date()) {
  const d = daysBetween(now, exam.date);
  const n = d >= 7 ? 4 : d >= 4 ? 3 : d >= 2 ? 2 : d === 1 ? 1 : 0;
  if (!n) return [];
  const step = Math.max(1, Math.ceil(d / n));
  const days = [];
  for (let i = 0; i < n; i++) {
    const back = Math.min(d, 1 + i * step);
    const day = new Date(dayStart(exam.date).getTime() - back * 86400000);
    const s = isoDay(day);
    if (!days.includes(s)) days.push(s);
  }
  return days.sort();
}

const examStudyTitle = exam => `Study for ${exam.title}`.slice(0, 80);

// How many sessions are already planned for this exam.
function plannedSessionCount(exam, sessions) {
  const title = examStudyTitle(exam).toLowerCase();
  return (sessions || []).filter(s => String(s.title || '').toLowerCase() === title).length;
}

function examWhenText(exam) {
  if (exam.daysUntil === 0) return 'Today';
  if (exam.daysUntil === 1) return 'Tomorrow';
  return `In ${exam.daysUntil} days`;
}

// "70 pts · about 20% of your grade" (Full sync only). Falls back to the
// category's weight when the share can't be worked out.
function examWorthText(exam) {
  const parts = [];
  if (exam.points) parts.push(`${Number.isInteger(exam.points) ? exam.points : exam.points.toFixed(1)} pts`);
  if (exam.share) parts.push(`about ${exam.share % 1 ? exam.share.toFixed(1) : exam.share}% of your grade`);
  else if (exam.weight && exam.group) parts.push(`${exam.group} are ${Math.round(exam.weight)}% of your grade`);
  return parts.join(' · ');
}

if (typeof module !== 'undefined') {
  module.exports = { examSignal, collectExams, undatedExams, gradeShare, planStudyDays, examStudyTitle, plannedSessionCount, examWhenText, examWorthText };
}
