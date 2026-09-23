/* ===========================
   coco.1 CONTEXT BUILDERS (grade tips + planning mode)
   Ninth/eleventh modules in the multi-file split, and the ones that
   required a real (small) refactor rather than a pure cut-and-paste: these
   used to read cachedGradedAssignments/cachedAssignments/cachedGrades/
   doneSet/userGoals/cachedStudySessions directly. Every call site now
   passes them in explicitly -- the same "read live state at the call site,
   compute from a plain parameter" split already used by
   cocoVerifyPlanning/cocoVerifyGradeTips in coco-verify.js. Both builders
   here read live app state and produce a plain context object; the actual
   verification/generation that reads THAT object stays in coco-verify.js.

   gradeBreakdownForCourse/cocoGradeContext: "what's affecting this grade" --
   built from per-assignment scores synced from Canvas, separate from the
   course-level current_score/final_score already in cachedGrades.

   cocoPlanningContext: a structured summary of what's actually due, so
   coco.1 can't invent assignments, courses, or dates that aren't real.
=========================== */

import { assignmentDescriptionExcerpt } from './coco-core.js';
import { dayDiff, doneKey } from './format-utils.js';
import { fmtTime12 } from './study-utils.js';

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

// Structured summary of what's actually due, so coco.1 can't invent assignments,
// courses, or dates that aren't real. Capped so a heavy course load doesn't
// blow the small model's context window.
export function cocoPlanningContext(cachedAssignments, doneSet, cachedGrades, userGoals, cachedStudySessions, limit = 20) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const active = cachedAssignments.filter(a => !a.completed && !doneSet.has(decodeURIComponent(doneKey(a))));
  const sorted = [...active].sort((a, b) => {
    const ad = a.due_date ? new Date(a.due_date) : new Date('9999-01-01');
    const bd = b.due_date ? new Date(b.due_date) : new Date('9999-01-01');
    return ad - bd;
  }).slice(0, limit);

  // Overdue work gets its own labeled block. A single date-sorted list blends it in
  // next to "due today" and the model consistently fails to treat it as more urgent —
  // a dedicated, explicitly-labeled section fixes that in testing.
  const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  // Spell the weekday out rather than making the model derive it from a date.
  // Asked to compute "2026-09-02 -> Wednesday" it answered Friday often enough
  // to matter; given the word, it just copies it.
  // Overdue work is spelled out the long way ("was due Monday, now 1 day LATE").
  // A/B tested against the terser "1d overdue": the short form got described as
  // still-upcoming in ~37% of generations, the explicit form in 0 of 26.
  const fmtLine = a => {
    const d = a.due_date ? dayDiff(a.due_date, today) : null;
    const dow = a.due_date ? DOW[new Date(a.due_date).getDay()] : '';
    const points = a.points_possible ? `, ${a.points_possible} pts` : '';
    let dueStr;
    if (d === null) dueStr = 'no due date';
    else if (d < 0) {
      const n = Math.abs(d);
      dueStr = `was due ${dow}, now ${n} day${n !== 1 ? 's' : ''} LATE (deadline passed, not submitted)`;
    }
    else if (d === 0) dueStr = `due today (${dow})`;
    else if (d === 1) dueStr = `due tomorrow (${dow})`;
    else dueStr = `due in ${d} days (${dow})`;
    return `- ${a.title} (${a.course || 'unknown course'}, ${a.assignment_type || 'assignment'}${points}) — ${dueStr}`;
  };
  const overdue = sorted.filter(a => a.due_date && new Date(a.due_date) < today);
  const upcoming = sorted.filter(a => !a.due_date || new Date(a.due_date) >= today);

  let text = '';
  if (overdue.length) text += `OVERDUE — ALREADY LATE, the deadline has PASSED (handle these first):\n${overdue.map(fmtLine).join('\n')}\n\n`;
  if (upcoming.length) text += `Upcoming:\n${upcoming.map(fmtLine).join('\n')}`;

  // Current grades and stated goals -- without this, "which class needs the
  // most attention" was pure guesswork from due dates alone. A class you're
  // already at 95% in and a class you're failing can have the same due date
  // this week; only the grade tells you which one actually needs the time.
  const gradedCourses = (cachedGrades || [])
    .filter(g => g.current_score != null || g.final_score != null || g.current_grade || g.final_grade);
  const gradeLines = gradedCourses
    .map(g => {
      const pct = g.current_score != null ? g.current_score : g.final_score;
      const letter = g.current_grade || g.final_grade || '';
      const bits = [pct != null ? `${pct}%` : '', letter].filter(Boolean).join(' / ');
      return `- ${g.course_name}: ${bits || 'no grade posted yet'}`;
    });
  if (gradeLines.length) text += `\n\nCurrent grades:\n${gradeLines.join('\n')}`;

  const goalLines = (userGoals || []).filter(Boolean);
  if (goalLines.length) text += `\n\nStudent's stated goals this semester:\n${goalLines.map(g => `- ${g}`).join('\n')}`;

  const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
  const studyLines = cachedStudySessions.filter(s => {
    const sd = new Date(s.session_date + 'T00:00:00');
    return sd >= today && sd <= weekOut;
  }).map(s => {
    const sd = new Date(s.session_date + 'T00:00:00');
    return `- Study block: ${s.title}${s.course ? ' (' + s.course + ')' : ''} on ${DOW[sd.getDay()]} ${s.session_date}${s.start_time ? ' at ' + fmtTime12(s.start_time) : ''}`;
  });

  if (studyLines.length) text += `\n\nAlready scheduled study time this week:\n${studyLines.join('\n')}`;

  // Every weekday the student actually has something on. The model likes to
  // translate dates into weekday names and gets them wrong ("Chem review on
  // Friday" for a Thursday block), so the verifier needs the real set.
  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const validWeekdays = new Set();
  // itemDays lets the verifier check not just that a weekday exists somewhere,
  // but that it's attached to the right thing.
  const itemDays = [];
  sorted.forEach(a => {
    if (!a.due_date || !a.title) return;
    const day = DAY_NAMES[new Date(a.due_date).getDay()];
    validWeekdays.add(day);
    itemDays.push({ title: a.title, day });
  });
  cachedStudySessions.forEach(s => {
    if (!s.session_date) return;
    const sd = new Date(s.session_date + 'T00:00:00');
    if (sd < today || sd > weekOut) return;
    const day = DAY_NAMES[sd.getDay()];
    validWeekdays.add(day);
    if (s.title) itemDays.push({ title: s.title, day });
  });

  return { text, count: sorted.length, overdue, upcoming, today, validWeekdays, itemDays, grades: gradedCourses };
}
