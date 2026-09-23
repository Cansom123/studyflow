/* ===========================
   GRADE BREAKDOWN CORE LOGIC (pure function, no implicit app state)
   Ninth module in the multi-file split, and the first one that required a
   real (small) refactor rather than a pure cut-and-paste: this used to read
   cachedGradedAssignments and cachedAssignments directly. Every call site
   now passes them in explicitly -- the same "read live state at the call
   site, compute from a plain parameter" split already used by
   cocoVerifyPlanning/cocoVerifyGradeTips in coco-verify.js.

   "What's affecting this grade" -- built from per-assignment scores synced
   from Canvas (cachedGradedAssignments), separate from the course-level
   current_score/final_score already in cachedGrades. Also the data source
   for the coco.1 grade-tips ask box.
=========================== */

export function gradeBreakdownForCourse(courseName, cachedGradedAssignments, cachedAssignments) {
  const norm = s => (s || '').trim().toLowerCase();
  const rows = cachedGradedAssignments.filter(a => norm(a.course) === norm(courseName));
  const graded = rows.filter(a => a.score != null && a.points_possible);
  const missing = rows.filter(a => a.is_missing && !a.is_excused);
  const lowPerformers = graded
    .map(a => ({ ...a, pct: (a.score / a.points_possible) * 100, lost: a.points_possible - a.score }))
    .filter(a => a.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 6);
  // "Open and gradable" = not done, and not locked -- a due-but-not-yet-graded
  // item is still open; a past-due locked one is not, regardless of whether
  // the student ever submitted it.
  const openWork = cachedAssignments.filter(a =>
    norm(a.course) === norm(courseName) && !a.completed && !a.is_locked
  );
  return { graded, missing, lowPerformers, openWork, allClosed: openWork.length === 0 };
}
