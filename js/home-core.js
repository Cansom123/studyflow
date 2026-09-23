/* ===========================
   HOME DASHBOARD COMPUTATION (pure functions, no app state)
   Thirteenth module in the multi-file split. This is where a real bug
   lived earlier this session: the hero stat, "Up next" card, and "This
   week" list all failed to exclude completed assignments, so a checked-off
   item could keep showing as the featured card. Pulling the computation
   out of renderHome and into a pure, independently testable function is
   exactly the kind of thing that would have caught that bug in a unit
   test instead of a user screenshot.
=========================== */

import { doneKey } from './format-utils.js';

// The one canonical "is this actually done" check, used everywhere
// completion state matters -- completion can come from either a.completed
// (server-synced) or the local doneSet, and BOTH have to be checked or a
// card checked one way but not the other silently keeps showing as active.
export function isAssignmentChecked(a, doneSet) {
  return a.completed || doneSet.has(decodeURIComponent(doneKey(a)));
}

export function greetingWord(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Everything the Home dashboard's hero stat, "Up next" card, and "This
// week" list are computed from. today must already be normalized to local
// midnight (same convention as every other date computation in this app).
export function computeHomeDashboard(cachedAssignments, doneSet, completedCount, today) {
  const weekFromNow = new Date(today); weekFromNow.setDate(today.getDate() + 7);
  const isChecked = a => isAssignmentChecked(a, doneSet);

  let overdueCount = 0;
  const soon = [];
  cachedAssignments.forEach(a => {
    if (!a.due_date || isChecked(a)) return;
    const due = new Date(a.due_date); due.setHours(0, 0, 0, 0);
    if (due < today) overdueCount++;
    else if (due <= weekFromNow) soon.push(a);
  });

  // One dominant number instead of a three-box KPI row -- whichever count is
  // most urgent leads (overdue, then due-this-week, then a calm caught-up
  // state), with everything else folded into a quiet sentence underneath.
  let heroValue, heroLabel, heroClass = '';
  const subParts = [];
  if (overdueCount > 0) {
    heroValue = String(overdueCount);
    heroLabel = overdueCount === 1 ? 'assignment overdue' : 'assignments overdue';
    heroClass = 'hero-overdue';
    subParts.push(soon.length > 0 ? `${soon.length} more due this week` : 'nothing else due this week');
  } else if (soon.length > 0) {
    heroValue = String(soon.length);
    heroLabel = soon.length === 1 ? 'thing due this week' : 'things due this week';
    subParts.push('nothing overdue');
  } else {
    heroValue = '✓';
    heroLabel = 'all caught up';
    heroClass = 'hero-calm';
  }
  if (completedCount > 0) subParts.push(`${completedCount} completed`);

  const withDate = cachedAssignments
    .filter(a => a.due_date && !isChecked(a))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  return { overdueCount, soon, withDate, heroValue, heroLabel, heroClass, subParts };
}
