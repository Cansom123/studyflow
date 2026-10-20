/* ===========================
   TODAY'S 3 + TIME ESTIMATES (pure functions, no app state)
   - estimateMinutes(): how long an assignment will likely take. Starts from
     a plain default for its kind (a quiz ~30 min, an essay ~2 h) and learns
     from the student's own study timer: sessions are named after the
     assignment they were for (title + class), so past work of the same
     kind shows how long that kind actually takes this student.
   - pickToday3(): the three things that matter today, from the Priority
     ranking, kept stable through the day once picked.
   Tested by tests/today-core.test.js.
=========================== */

// What kind of work it is, from the title first (teachers name things
// "Quiz 3", "Essay Draft") and Canvas's submission type second.
function assignmentKind(a) {
  const t = String((a && a.title) || '').toLowerCase();
  const type = String((a && a.assignment_type) || '').toLowerCase();
  if (/\bquiz|inquizitive/.test(t) || type.includes('quiz')) return 'quiz';
  // "Midterm Feedback Survey" mentions an exam without being one.
  if (/\b(test|exam|midterm|final)s?\b/.test(t) && !/\b(survey|feedback|review|drafts?|practice|reflection)\b|\bfinal\s+(project|paper|essay|presentation|portfolio|report)/.test(t)) return 'test';
  if (/\b(essay|paper|thesis|report)s?\b/.test(t)) return 'essay';
  if (/\b(presentation|speech|slides)s?\b/.test(t)) return 'presentation';
  if (/\b(project)s?\b/.test(t)) return 'project';
  if (/\b(lab)s?\b/.test(t)) return 'lab';
  if (/\b(discussion|forum|reply|post)s?\b/.test(t) || type.includes('discussion')) return 'discussion';
  if (/\b(reading|read|chapter|ch\.)\b/.test(t)) return 'reading';
  return 'homework';
}

const KIND_DEFAULT_MIN = {
  quiz: 30, test: 90, essay: 120, presentation: 90, project: 120,
  lab: 60, discussion: 25, reading: 40, homework: 45,
};
const KIND_LABEL = {
  quiz: 'quizzes', test: 'tests', essay: 'essays', presentation: 'presentations', project: 'projects',
  lab: 'labs', discussion: 'discussion posts', reading: 'readings', homework: 'homework',
};

const normKey = s => String(s || '').trim().toLowerCase();
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round5 = m => Math.max(5, Math.round(m / 5) * 5);

// Minutes studied per assignment, from timer sessions named after it.
// sessionSec(s) -> seconds for one session; cleanCourse(name) -> the same
// cleaned class name the timer saves with the session.
function studiedMinutesByAssignment(sessions, sessionSec, cleanCourse) {
  const byKey = new Map();
  (sessions || []).forEach(s => {
    if (!s || s.session_type === 'deep_work' || !s.title) return;
    const sec = sessionSec(s);
    if (!sec) return;
    const key = `${normKey(s.title)}||${normKey(s.course)}`;
    byKey.set(key, (byKey.get(key) || 0) + sec / 60);
  });
  return byKey;
}

// a: the assignment. history: past assignments (any state) to learn from.
// studied: studiedMinutesByAssignment() result. Returns
// { minutes, left, source, samples } where `left` subtracts time already
// spent on this assignment.
function estimateMinutes(a, history, studied, cleanCourse) {
  const kind = assignmentKind(a);
  const course = normKey(cleanCourse(a.course || ''));
  const keyOf = x => `${normKey(String(x.title || '').slice(0, 80))}||${normKey(cleanCourse(x.course || ''))}`;
  const sameCourse = [], anyCourse = [];
  const seen = new Set();
  (history || []).forEach(h => {
    const k = keyOf(h);
    if (seen.has(k) || k === keyOf(a)) return;
    seen.add(k);
    const min = studied.get(k);
    if (!min || min < 5 || assignmentKind(h) !== kind) return; // a few minutes isn't a real sitting
    anyCourse.push(min);
    if (normKey(cleanCourse(h.course || '')) === course) sameCourse.push(min);
  });
  let minutes, source, samples;
  if (sameCourse.length >= 2) { minutes = median(sameCourse); source = 'class'; samples = sameCourse.length; }
  else if (anyCourse.length >= 3) { minutes = median(anyCourse); source = 'kind'; samples = anyCourse.length; }
  else { minutes = KIND_DEFAULT_MIN[kind]; source = 'default'; samples = 0; }
  minutes = round5(Math.min(minutes, 6 * 60));
  const spent = studied.get(keyOf(a)) || 0;
  const left = spent > 0 ? round5(Math.max(10, minutes - spent)) : minutes;
  return { minutes, left, spent: Math.round(spent), source, samples, kind };
}

// Plain words for where an estimate came from (shown on hover / tap).
function estimateSourceText(est) {
  const label = KIND_LABEL[est.kind] || 'work like this';
  if (est.source === 'class') return `Based on ${est.samples} ${label} you timed in this class.`;
  if (est.source === 'kind') return `Based on ${est.samples} ${label} you timed.`;
  return `A typical time for ${label}. It gets more accurate as you use the study timer.`;
}

function fmtEstimate(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ranked: computePriorityScores() output (already excludes completed).
// keyOf(a): stable key (title||course). saved: keys picked earlier today,
// or null. isDone(a): checked off. Returns the 3 to show, keeping today's
// earlier picks (done or not) so the list doesn't reshuffle every render,
// and filling any empty slot from the ranking.
function pickToday3(ranked, allAssignments, keyOf, saved, isDone) {
  const byKey = new Map((allAssignments || []).map(a => [keyOf(a), a]));
  const picks = [];
  (saved || []).forEach(k => { const a = byKey.get(k); if (a && picks.length < 3) picks.push(a); });
  for (const a of ranked || []) {
    if (picks.length >= 3) break;
    if (isDone(a) || picks.some(p => keyOf(p) === keyOf(a))) continue;
    picks.push(a);
  }
  return picks;
}

if (typeof module !== 'undefined') {
  module.exports = { assignmentKind, estimateMinutes, studiedMinutesByAssignment, estimateSourceText, fmtEstimate, pickToday3, KIND_DEFAULT_MIN };
}
