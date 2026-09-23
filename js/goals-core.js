/* ===========================
   GOAL ACTION-PLAN LOGIC (pure function, no implicit app state)
   Fourteenth module in the multi-file split. Matches a student's own
   stated goal ("raise my math grade") against their real assignments and
   grades to build a short, concrete action plan -- no model involved, just
   keyword matching against real data. This is the rule-based foundation
   the user's stated long-term vision (having coco.1 itself manage this)
   would build on top of, so it's worth having as real, testable code
   rather than logic buried in a render function.
=========================== */

import { cleanCourseName, dayDiff } from './format-utils.js';

export function buildActionPlan(goalText, cachedAssignments, cachedGrades) {
  const steps = [];
  const text = goalText.toLowerCase();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Extract a subject keyword from the goal
  const subjects = [
    'english', 'math', 'science', 'history', 'biology', 'chemistry', 'physics',
    'spanish', 'french', 'art', 'pe', 'health', 'economics', 'econ', 'data',
    'sports', 'algebra', 'calculus', 'stats', 'statistics', 'writing', 'reading'
  ];
  const matchedSubject = subjects.find(s => text.includes(s));

  // Match assignments to the subject keyword
  const matchingAssignments = cachedAssignments.filter(a =>
    !a.completed && a.due_date && matchedSubject &&
    ((a.course || '').toLowerCase().includes(matchedSubject) || a.title.toLowerCase().includes(matchedSubject))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  // Match grade to the subject keyword
  const matchingGrade = matchedSubject
    ? cachedGrades.find(g => cleanCourseName(g.course_name).toLowerCase().includes(matchedSubject))
    : null;

  // Step 1: current grade if found
  if (matchingGrade) {
    const score = matchingGrade.current_score != null ? parseFloat(matchingGrade.current_score) : null;
    const letter = matchingGrade.current_grade || matchingGrade.final_grade || '';
    const cn = cleanCourseName(matchingGrade.course_name);
    steps.push(`Currently at ${score != null ? score.toFixed(1) + '% ' : ''}${letter ? '(' + letter + ')' : ''} in ${cn}`);
  }

  // Step 2: overdue assignments
  const overdue = matchingAssignments.filter(a => new Date(a.due_date) < today);
  if (overdue.length) {
    steps.push(`Complete ${overdue.length} overdue item${overdue.length > 1 ? 's' : ''} - start with "${overdue[0].title}"`);
  }

  // Step 3: next upcoming assignments (up to 3)
  const upcoming = matchingAssignments.filter(a => new Date(a.due_date) >= today).slice(0, 3);
  for (const a of upcoming) {
    const d = dayDiff(a.due_date, today);
    const dueStr = d === 0 ? 'today' : d === 1 ? 'tomorrow'
      : new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    steps.push(`Prepare "${a.title}" - due ${dueStr}`);
  }

  // Fallback generic advice
  if (steps.length === 0) {
    if (text.includes('raise') || text.includes('improve') || text.includes('better')) {
      steps.push('Sync Canvas to pull your latest assignments');
      steps.push('Check Assignments for any overdue items');
      steps.push('Mark assignments done as you finish them to track progress');
    } else if (text.includes('miss') || text.includes('deadline') || text.includes('on top')) {
      steps.push('Check Upcoming daily for what\'s coming up');
      steps.push('Use Priority tab to focus on the most urgent work first');
    } else {
      steps.push('Sync Canvas in Settings to see your latest assignments');
      steps.push('Check the Priority tab for what to tackle first');
    }
  }

  return steps;
}
