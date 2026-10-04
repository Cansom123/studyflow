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


/* ---- Goal → class resolution ----------------------------------------------
   One shared answer to "which of my classes is this goal about, and what am
   I aiming for?" -- used by the Goals tab's action plans, Priority's ranking
   and coco.1's planning context, so all three agree. Before this, Priority
   matched on a goal's FIRST WORD ("Raise Biology above 70%" -> "raise"),
   which matched nothing, so goals almost never moved the list. */
const GOAL_STOPWORDS = new Set([
  'raise', 'improve', 'get', 'keep', 'reach', 'earn', 'boost', 'bring', 'pull', 'up', 'stay', 'maintain',
  'my', 'grade', 'grades', 'score', 'class', 'classes', 'course', 'in', 'to', 'an', 'a', 'the', 'at',
  'least', 'above', 'over', 'below', 'under', 'by', 'end', 'of', 'semester', 'year', 'term', 'and',
  'or', 'for', 'on', 'be', 'better', 'higher', 'more', 'all', 'pass', 'passing', 'finish', 'final',
  'this', 'next', 'i', 'want', 'need', 'should', 'with', 'from', 'percent', 'point', 'points',
  'ap', 'ib', 'honors', 'h',
]);
// Everyday ways of naming a subject -> words that show up in course names.
const GOAL_SUBJECT_ALIASES = {
  math: ['math', 'mathematics', 'calculus', 'calc', 'algebra', 'geometry', 'precalculus', 'precalc', 'statistics', 'stats', 'trigonometry', 'trig'],
  maths: ['math', 'mathematics', 'calculus', 'calc', 'algebra', 'geometry', 'precalculus', 'precalc', 'statistics', 'stats'],
  calc: ['calculus', 'calc'], stats: ['statistics', 'stats'], trig: ['trigonometry', 'trig'],
  bio: ['biology', 'bio'], chem: ['chemistry', 'chem'], phys: ['physics'],
  science: ['science', 'biology', 'chemistry', 'physics', 'environmental', 'earth', 'anatomy'],
  english: ['english', 'literature', 'lit', 'language', 'composition', 'writing'],
  lit: ['literature', 'lit', 'english'], writing: ['writing', 'composition', 'english'],
  history: ['history', 'government', 'gov', 'civics'], gov: ['government', 'gov', 'civics'],
  econ: ['economics', 'econ'], cs: ['computer', 'programming', 'cs'], coding: ['computer', 'programming'],
  pe: ['pe', 'physical'], gym: ['pe', 'physical'],
};
const GOAL_LETTER_PCT = { 'A+': 97, A: 93, 'A-': 90, 'B+': 87, B: 83, 'B-': 80, 'C+': 77, C: 73, 'C-': 70, 'D+': 67, D: 63, 'D-': 60 };

function goalTokens(goal) {
  return (goal || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w && !GOAL_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// The grade the goal is aiming for, as a percent: "above 70%", "get an A",
// "keep a B+". null when the goal doesn't name one.
function goalTargetPct(goal) {
  const text = goal || '';
  const pct = /(\d{2,3}(?:\.\d+)?)\s*%/.exec(text);
  if (pct) return Math.min(100, parseFloat(pct[1]));
  // Letter grades must be capitals so the article "a" is never read as an A.
  const letter = /(?:^|\s)(?:[Gg]et|[Kk]eep|[Rr]each|[Ee]arn|[Tt]o|[Aa]n?|[Aa]bove|[Aa]t least|[Mm]aintain)\s+(?:an?\s+)?([ABCD][+-]?)(?=$|[\s.,!?])/.exec(text);
  return letter ? GOAL_LETTER_PCT[letter[1]] : null;
}

// Which of `courseNames` the goal mentions, by subject word or alias.
function goalCourses(goal, courseNames) {
  const tokens = goalTokens(goal);
  if (!tokens.length) return [];
  const wanted = new Set();
  tokens.forEach(t => (GOAL_SUBJECT_ALIASES[t] || [t]).forEach(w => wanted.add(w)));
  return (courseNames || []).filter(name => {
    const words = cleanCourseName(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    return words.some(w => [...wanted].some(t => w === t || (t.length >= 3 && w.startsWith(t))));
  });
}

// Every goal, resolved against the student's actual classes and grades.
function resolveGoals(userGoals, cachedAssignments, cachedGrades) {
  const norm = s => cleanCourseName(s || '').trim().toLowerCase();
  const names = new Map();
  (cachedGrades || []).forEach(g => { if (g.course_name) names.set(norm(g.course_name), g.course_name); });
  (cachedAssignments || []).forEach(a => { const c = a.course || a.course_name; if (c && !names.has(norm(c))) names.set(norm(c), c); });
  return (userGoals || []).filter(Boolean).map(goal => {
    const courses = goalCourses(goal, [...names.values()]);
    const target = goalTargetPct(goal);
    const g = courses.length ? (cachedGrades || []).find(x => courses.some(c => norm(c) === norm(x.course_name))) : null;
    const pct = g ? (g.current_score != null ? parseFloat(g.current_score) : g.final_score != null ? parseFloat(g.final_score) : null) : null;
    return {
      goal, courses, courseKeys: new Set(courses.map(norm)), target,
      grade: g ? { course: g.course_name, pct, letter: g.current_grade || g.final_grade || '' } : null,
      gap: target != null && pct != null ? Math.max(0, +(target - pct).toFixed(1)) : null,
    };
  });
}

// The first resolved goal an assignment serves, if any.
function goalForAssignment(a, resolved) {
  const key = cleanCourseName(a.course || a.course_name || '').trim().toLowerCase();
  return (resolved || []).find(r => r.courseKeys.has(key)) || null;
}

function buildActionPlan(goalText, cachedAssignments, cachedGrades) {
  const steps = [];
  const text = goalText.toLowerCase();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const r = resolveGoals([goalText], cachedAssignments, cachedGrades)[0];

  const matchingAssignments = cachedAssignments.filter(a =>
    !a.completed && a.due_date && r.courseKeys.has(cleanCourseName(a.course || a.course_name || '').trim().toLowerCase())
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  // Step 1: where the grade stands, and how far from the goal's target
  if (r.grade) {
    const { pct, letter } = r.grade;
    const cn = cleanCourseName(r.grade.course);
    let line = `Currently at ${pct != null ? pct.toFixed(1) + '% ' : ''}${letter ? '(' + letter + ') ' : ''}in ${cn}`;
    if (r.target != null && pct != null) {
      line += r.gap > 0 ? ` - ${r.gap} points below your ${r.target}% target` : ` - already at your ${r.target}% target, so keep it there`;
    }
    steps.push(line);
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

  // Say plainly that this goal is steering Priority, so the two tabs read
  // as one system instead of separate lists.
  if (matchingAssignments.length) {
    steps.push(`Ranked higher on your Priority list: ${matchingAssignments.length} ${cleanCourseName(r.courses[0])} assignment${matchingAssignments.length > 1 ? 's' : ''}`);
  }

  // Couldn't tie the goal to a class: say how to fix that rather than
  // falling back to advice that ignores it.
  if (!r.courses.length && (cachedGrades.length || cachedAssignments.length)) {
    steps.push('Name a class in this goal (like "Biology" or "Calculus") so StudyFlow can link it to your work and Priority list');
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

// Card list for the Goals tab: one card per goal, with its action plan
// (from buildActionPlan) rendered underneath when it has steps.
function goalsListHTML(userGoals, cachedAssignments, cachedGrades) {
  const colors = ['#d85a30', '#007aff', '#3b6d11', '#854f0b', '#534ab7'];
  return userGoals.map((g, i) => {
    const plan = buildActionPlan(g, cachedAssignments, cachedGrades);
    const stepsHtml = plan.map(s =>
      `<div class="goal-step"><span class="goal-step-arrow">→</span>${escapeHtml(s)}</div>`
    ).join('');
    const r = resolveGoals([g], cachedAssignments, cachedGrades)[0];
    const linked = r.courses.length
      ? `<div class="goal-linked">Linked to ${r.courses.map(c => `<span>${escapeHtml(cleanCourseName(c))}</span>`).join('')}</div>`
      : '';
    return `<div class="goal-card">
      <div class="goal-row">
        <div class="goal-dot" style="background:${colors[i % colors.length]};"></div>
        <div class="goal-text">${escapeHtml(g)}${linked}</div>
        <button class="goal-remove" onclick="removeGoalMain(${i})">×</button>
      </div>
      ${stepsHtml ? `<div class="goal-plan">${stepsHtml}</div>` : ''}
    </div>`;
  }).join('');
}
