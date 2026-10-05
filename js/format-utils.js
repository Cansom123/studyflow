/* ===========================
   FORMATTING / DISPLAY UTILITIES (pure functions, no app state)
   Third module in the multi-file split. escapeHtml and escapeRegex in
   particular are used across nearly the whole app (search, highlighting,
   every rendered card) -- not coco- or checklist-specific -- which is why
   they get their own module rather than living inside either of those.
=========================== */

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Turns a bare http(s) URL match into a clickable link, trimming trailing
// sentence punctuation (periods, commas, closing parens) that's almost
// never actually part of the URL. Expects already-escaped text in, so a
// matched URL is the HTML-escaped form (e.g. "&amp;" for "&"), which is
// exactly what a browser expects inside an href attribute too.
function linkifyBareUrls(escaped) {
  return escaped.replace(/\bhttps?:\/\/[^\s<]+/g, url => {
    const trailing = url.match(/[.,;:!?)\]]+$/);
    const clean = trailing ? url.slice(0, -trailing[0].length) : url;
    const tail = trailing ? trailing[0] : '';
    if (!clean) return url;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
  });
}

// Escapes text and makes any bare URL in it clickable -- written for synced
// syllabi, where a professor often pastes a raw Zoom/Drive/form link as
// plain text (Canvas doesn't always auto-linkify it), leaving students to
// carefully select and copy the whole thing by hand instead of tapping it.
function linkifyText(str) {
  return linkifyBareUrls(escapeHtml(str));
}

function cleanCourseName(name) {
  // Strip common Canvas administrative suffixes, preserve the actual course title.
  // Handles formats like:
  //   "English 12 H - S2 - TEACHER, F | section -- SPR26 - P01"  → "English 12 H"
  //   "MATH 101 - Fall 2025 | 12345"                              → "MATH 101 - Fall 2025"
  //   "AP Calculus AB"                                            → "AP Calculus AB"
  return (name || '')
    // Strip " | anything" (section/ID separator used by many schools)
    .replace(/\s*\|.*$/, '')
    // Strip " -- anything" (double-dash separator)
    .replace(/\s*--.*$/, '')
    // Strip " - S1/S2/Sem1/Sem2 - anything" (semester section indicator followed by teacher)
    .replace(/\s*-\s*(?:S[12]|Sem\s*[12])\s*-.*$/i, '')
    .trim();
}

// Calendar-day difference between a due date and a reference date (defaults to
// today), normalizing the due date to its own local midnight first. A raw
// timestamp diff makes a due time later today (e.g. 11:59pm) round up to
// "1 day away" and get mislabeled "due tomorrow" — this always answers 0 for
// anything still due today, no matter what time it's due.
function dayDiff(due_date, ref) {
  const today = ref || (() => { const t = new Date(); t.setHours(0,0,0,0); return t; })();
  // A bare "YYYY-MM-DD" (no time) is parsed as UTC midnight by the Date
  // constructor; reinterpreting that instant in local time can silently
  // shift the calendar day back by one for anyone west of UTC -- the exact
  // bug class that once showed a Sunday-night deadline as due Monday.
  // Every real due_date is a full timestamp and is unaffected by this; this
  // guards a caller that ever passes a bare date instead.
  const isDateOnly = typeof due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due_date);
  const dueMidnight = new Date(isDateOnly ? due_date + 'T00:00:00' : due_date);
  dueMidnight.setHours(0,0,0,0);
  return Math.round((dueMidnight - today) / (1000*60*60*24));
}

// `type` is Canvas's submission type (online_upload, online_quiz,
// discussion_topic, on_paper...), which says how work is handed in, not what
// it is -- a file upload can be an essay, a lab or homework. So the title
// decides first, and the submission type only fills in the two cases it
// reliably identifies (quizzes and discussions).
function getBadge(type, title) {
  const n = (title || '').toLowerCase();
  if (/\bquiz/.test(n)) return ['badge-quiz','Quiz'];
  if (/\b(test|exam|midterm)s?\b/.test(n)) return ['badge-test','Test'];
  if (/\b(essay|paper|thesis)s?\b/.test(n)) return ['badge-essay','Essay'];
  if (/\b(discussion|forum)s?\b/.test(n)) return ['badge-discussion','Discussion'];
  const t = (type || '').toLowerCase();
  if (t.includes('quiz')) return ['badge-quiz','Quiz'];
  if (t.includes('discussion')) return ['badge-discussion','Discussion'];
  return ['badge-hw','Homework'];
}

// Older syncs cut HTML tags short when an attribute contained ">", so some
// stored descriptions start with leftover tag text such as
// '*]:pointer-events-auto ... data-turn="assistant">'. Any line that ends in
// an HTML attribute followed by ">" is that kind of leftover; drop it.
function cleanSyncedText(text) {
  if (!text) return text;
  return text
    .split('\n')
    .filter(line => !/[\w:-]+=(?:"[^"]*"|'[^']*')\s*\/?>\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Canvas has closed this assignment: it is locked because the window to
// submit is over (not "not open yet"). Older synced rows have no lock_reason,
// so a locked assignment whose due date has passed counts as closed.
function isSubmissionClosed(a, now = new Date()) {
  if (!a || !a.is_locked || a.completed) return false;
  if (a.lock_reason === 'closed') return true;
  if (a.lock_reason === 'unavailable') return false;
  return !!(a.due_date && new Date(a.due_date) < now);
}

function getDueText(due_date, isOverdue, isLocked, lockReason) {
  // Canvas's "locked" covers two opposite situations: the deadline already
  // passed (closed -- can't submit) and the assignment isn't available yet
  // (a future unlock date or an unmet module prerequisite -- can't submit
  // YET, but will be able to). Telling a student "can no longer submit" on
  // something they simply haven't unlocked would be its own false alarm, so
  // these need different messages, not one blanket "locked" label.
  if (isLocked) {
    const dateStr = due_date
      ? ` (was due ${new Date(due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
      : '';
    if (lockReason === 'unavailable' || (!lockReason && !(due_date && new Date(due_date) < new Date()))) {
      return `<div class="due-locked">🔒 Not yet available - check Canvas for requirements</div>`;
    }
    return `<div class="due-locked">🔒 Locked${dateStr} - can no longer submit</div>`;
  }
  if (!due_date) return `<div class="due-ok">No due date</div>`;
  const due = new Date(due_date);
  const d = dayDiff(due_date);
  if (isOverdue) return `<div class="due-soon">${Math.abs(d)} day${Math.abs(d)!==1?'s':''} overdue</div>`;
  if (d === 0) return `<div class="due-soon">Due today</div>`;
  if (d === 1) return `<div class="due-soon">Due tomorrow</div>`;
  return `<div class="due-ok">Due ${due.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>`;
}

// encodeURIComponent leaves ' unescaped (it's an RFC3986 "unreserved" char), which breaks
// out of the single-quoted onclick="toggleDone('${key}',this)" JS string for any title/course
// with an apostrophe -- silently killing the click handler. %27 round-trips through
// decodeURIComponent fine, so escape it too.
function doneKey(a) { return encodeURIComponent(`${a.title}||${a.course}`).replace(/'/g, '%27'); }

// Canvas course names encode the section as "... | SECTION -- ..."; pulls
// just the section token so a concluded course's selection can be
// carried over to its current-semester equivalent by matching sections.
function extractSectionCode(name) {
  if (!name) return null;
  const m = name.match(/\|\s*(\S+)\s+--/);
  return m ? m[1] : null;
}

// Strips characters that are illegal (or awkward) in a downloaded filename.
function safeFileName(name) {
  return (name || 'Syllabus').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtClock(totalSec) {
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// CSS class for a letter grade's A/B/C/other color coding. Shared by the
// Grades tab's course cards and Home's mini grade list (previously
// duplicated verbatim between them).
function letterGradeClass(letter) {
  if (letter.startsWith('A')) return 'grade-a';
  if (letter.startsWith('B')) return 'grade-b';
  if (letter.startsWith('C')) return 'grade-c';
  return 'grade-df';
}
