/* ===========================
   PRIORITY SCORING (pure functions, no app state)
   Twelfth module in the multi-file split, and outside coco.1 for the first
   time -- the Priority tab's actual ranking algorithm, split out of
   renderPriority the same way the coco.1 context builders were: the
   scoring/sorting/text-generation logic is pure given the right inputs,
   only the DOM rendering around it isn't.
=========================== */

import { dayDiff } from './format-utils.js';

// First concrete step toward priority that actually accounts for grades, not
// just due dates: a class you're barely passing gets nudged up the list even
// when its next deadline isn't the closest one. Capped well below the
// overdue baseline (1000+) so overdue work always still wins regardless of
// grade, and small enough to reorder among similarly-urgent items rather
// than bury something due today under something due next week.
export function priorityGradeRiskBoost(course, cachedGrades) {
  if (!course) return 0;
  const norm = s => (s || '').trim().toLowerCase();
  const g = cachedGrades.find(x => norm(x.course_name) === norm(course));
  if (!g) return 0;
  const pct = g.current_score != null ? g.current_score : g.final_score;
  if (pct == null || pct >= 70) return 0;
  return Math.min(35, (70 - pct) * 1.2);
}

// The actual ranking: overdue work always scores highest (1000+, growing
// with how late it is), otherwise sooner-due beats later-due, with goal
// matches and grade risk nudging things up within that.
export function computePriorityScores(assignments, today, userGoals, priorityGoalBoost, cachedGrades) {
  const active = assignments.filter(a => {
    if (!a.due_date || a.completed) return false;
    const d = dayDiff(a.due_date, today);
    return d >= -7;
  });
  return active.map(a => {
    const d = dayDiff(a.due_date, today);
    let score = d < 0 ? 1000 + Math.abs(d) : 100 - d;
    for (const goal of userGoals) {
      const g = goal.toLowerCase().split(' ')[0];
      if ((a.course || '').toLowerCase().includes(g) || a.title.toLowerCase().includes(g)) score += priorityGoalBoost;
    }
    score += priorityGradeRiskBoost(a.course, cachedGrades);
    return { ...a, score, d };
  }).sort((a, b) => b.score - a.score);
}

// The one-line "why this is your top priority" text under the ranked list.
export function priorityAiText(top, userGoals, cachedGrades) {
  const matchingGoal = userGoals.find(g => (top.course || '').toLowerCase().includes(g.toLowerCase().split(' ')[0]));
  const gradeAtRisk = priorityGradeRiskBoost(top.course, cachedGrades) > 0;
  if (matchingGoal) return `"${top.title}" is your top priority - and it's in a class tied to your goal: "${matchingGoal}". Start here.`;
  if (top.d < 0) return `"${top.title}" is overdue. Take care of that first.`;
  if (top.d <= 1) return `"${top.title}" is due ${top.d === 0 ? 'today' : 'tomorrow'} - that's your top priority.`;
  if (gradeAtRisk) return `"${top.title}" is your top priority - your grade in ${top.course} could use the attention.`;
  return `Your most urgent assignment is "${top.title}", due in ${top.d} days. Start there.`;
}
