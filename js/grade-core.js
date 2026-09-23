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

import { assignmentDescriptionExcerpt } from './coco-core.js';

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

// The structured, real-data-only context coco.1's grade-tips feature reads
// from and is verified against (see cocoVerifyGradeTips in coco-verify.js).
// Same refactor as gradeBreakdownForCourse above: used to read cachedGrades
// directly, now every dependency is a plain parameter.
export function cocoGradeContext(courseName, cachedGrades, cachedGradedAssignments, cachedAssignments) {
  const norm = s => (s || '').trim().toLowerCase();
  const grade = cachedGrades.find(g => norm(g.course_name) === norm(courseName));
  const pct = grade ? (grade.current_score != null ? grade.current_score : grade.final_score) : null;
  const letter = grade ? (grade.current_grade || grade.final_grade || '') : '';
  const { graded, missing, lowPerformers, openWork, allClosed } = gradeBreakdownForCourse(courseName, cachedGradedAssignments, cachedAssignments);

  let text = `Course: ${courseName}\n`;
  text += `Current grade: ${pct != null ? pct + '%' : 'not posted'}${letter ? ' (' + letter + ')' : ''}\n\n`;

  if (lowPerformers.length) {
    text += `Graded work that lost the most points:\n` +
      lowPerformers.map(a => `- ${a.title}: ${a.score}/${a.points_possible} pts (lost ${a.lost.toFixed(1)})`).join('\n') + '\n\n';
  }
  if (missing.length) {
    text += `Missing (never submitted, counts as 0):\n` +
      missing.map(a => `- ${a.title}${a.points_possible ? ' (' + a.points_possible + ' pts)' : ''}`).join('\n') + '\n\n';
  }
  // Soonest due first -- points value alone told a student to prioritize a
  // 104-point item that wasn't due for weeks over a 75-point item due much
  // sooner, which isn't actually useful: you can't get ahead on something by
  // being told it's worth more if there's nothing urgent to act on yet.
  // Due-date proximity is the real actionable signal ("get a jump on what's
  // coming up next"); points value is still worth mentioning, but only as
  // context, never as what decides the order. Only assignments with an
  // actual due date are candidates for "do this next" -- an open item with
  // no due date usually means the teacher hasn't scheduled or covered it
  // yet, so recommending it as the next thing to do is bad advice no matter
  // what it's worth. (Real incident: coco told a student to start a
  // not-yet-covered, ungraded section instead of the one they'd already
  // scored lowest on.)
  const now = Date.now();
  const openWorkRanked = [...openWork]
    .filter(a => a.due_date)
    .map(a => ({ ...a, descriptionExcerpt: assignmentDescriptionExcerpt(a, 240) }))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const undatedOpenWork = openWork.filter(a => !a.due_date);
  const undescribedOpenWork = openWorkRanked.filter(a => !a.descriptionExcerpt);

  if (allClosed) {
    text += `No open, gradable work remains in this course right now -- everything left is either submitted or past its deadline and locked.\n`;
  } else if (openWorkRanked.length) {
    text += `Still open, gradable, and actually due (ordered by due date, soonest first -- this is what "next" should mean, since getting a jump on the nearest deadline is the only genuinely actionable move; points value is extra context you can mention but should never override due-date order. There is no real difficulty rating either, so judge actual difficulty ONLY from each item's description below when one is given; when a description is missing, do not guess difficulty at all):\n` +
      openWorkRanked.slice(0, 6).map(a => {
        const daysOut = Math.round((new Date(a.due_date).getTime() - now) / 86400000);
        const dueLabel = daysOut <= 0 ? 'due today or already passed' : daysOut === 1 ? 'due in 1 day' : `due in ${daysOut} days`;
        const desc = a.descriptionExcerpt
          ? `\n  Description: "${a.descriptionExcerpt}"`
          : `\n  (No description synced for this one -- difficulty is genuinely unknown, only its point value is a real signal.)`;
        return `- ${a.title}${a.points_possible ? ', ' + a.points_possible + ' pts' : ''}${a.assignment_type ? ', ' + a.assignment_type : ''}, ${dueLabel}${desc}`;
      }).join('\n') + '\n';
  }
  if (undatedOpenWork.length) {
    text += `Also on Canvas but with no due date scheduled yet, so likely not yet covered by the teacher -- do NOT recommend starting these, only the dated items above:\n` +
      undatedOpenWork.map(a => `- ${a.title}`).join('\n') + '\n';
  }

  return {
    text, courseName, pct, letter, allClosed, lowPerformers, missing,
    openWork: openWorkRanked, undatedOpenWork, undescribedOpenWork,
    hasData: graded.length > 0 || missing.length > 0,
  };
}
