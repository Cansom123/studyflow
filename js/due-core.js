import { doneKey } from './format-utils.js';

// Splits assignments into overdue / upcoming / no-due-date buckets for the
// Upcoming tab, skipping anything already done, and counts how many
// upcoming items fall within the next 7 days. doneSet and today are passed
// in explicitly rather than read as globals -- same pattern as
// computeHomeDashboard/computePriorityScores.
export function categorizeDueSoon(assignments, doneSet, today) {
  const ref = today || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const weekFromNow = new Date(ref); weekFromNow.setDate(ref.getDate() + 7);
  const overdue = [], upcoming = [], noDate = [];
  assignments.forEach(a => {
    if (a.completed || doneSet.has(decodeURIComponent(doneKey(a)))) return;
    if (!a.due_date) { noDate.push(a); return; }
    const due = new Date(a.due_date); due.setHours(0, 0, 0, 0);
    if (due < ref) overdue.push(a);
    else upcoming.push(a);
  });
  const soonCount = upcoming.filter(a => {
    const d = new Date(a.due_date); d.setHours(0, 0, 0, 0);
    return d <= weekFromNow;
  }).length;
  return { overdue, upcoming, noDate, soonCount };
}
