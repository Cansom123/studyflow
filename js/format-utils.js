/* ===========================
   FORMATTING / DISPLAY UTILITIES (pure functions, no app state)
   Third module in the multi-file split. escapeHtml and escapeRegex in
   particular are used across nearly the whole app (search, highlighting,
   every rendered card) -- not coco- or checklist-specific -- which is why
   they get their own module rather than living inside either of those.
=========================== */

export function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function cleanCourseName(name) {
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
export function dayDiff(due_date, ref) {
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

export function getBadge(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('quiz')) return ['badge-quiz','Quiz'];
  if (t.includes('online_upload')||t.includes('test')||t.includes('exam')) return ['badge-test','Test'];
  if (t.includes('essay')||t.includes('paper')) return ['badge-essay','Essay'];
  if (t.includes('discussion')) return ['badge-discussion','Discussion'];
  return ['badge-hw','Homework'];
}

export function getDueText(due_date, isOverdue, isLocked, lockReason) {
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
    if (lockReason === 'unavailable') {
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
export function doneKey(a) { return encodeURIComponent(`${a.title}||${a.course}`).replace(/'/g, '%27'); }
