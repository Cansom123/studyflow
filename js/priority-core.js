/* ===========================
   PRIORITY SCORING (pure functions, no app state)
   Twelfth module in the multi-file split, and outside coco.1 for the first
   time -- the Priority tab's actual ranking algorithm, split out of
   renderPriority the same way the coco.1 context builders were: the
   scoring/sorting/text-generation logic is pure given the right inputs,
   only the DOM rendering around it isn't.
=========================== */


// First concrete step toward priority that actually accounts for grades, not
// just due dates: a class you're barely passing gets nudged up the list even
// when its next deadline isn't the closest one. Capped well below the
// overdue baseline (1000+) so overdue work always still wins regardless of
// grade, and small enough to reorder among similarly-urgent items rather
// than bury something due today under something due next week.
function priorityGradeRiskBoost(course, cachedGrades) {
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
function computePriorityScores(assignments, today, userGoals, priorityGoalBoost, cachedGrades) {
  const active = assignments.filter(a => {
    if (!a.due_date || a.completed) return false;
    const d = dayDiff(a.due_date, today);
    return d >= -7;
  });
  // Goals are resolved to real classes once (js/goals-core.js) -- the same
  // resolution the Goals tab and coco.1 use, so all three agree.
  const resolved = resolveGoals(userGoals, assignments, cachedGrades);
  return active.map(a => {
    const d = dayDiff(a.due_date, today);
    let score = d < 0 ? 1000 + Math.abs(d) : 100 - d;
    const goal = goalForAssignment(a, resolved);
    if (goal) {
      score += priorityGoalBoost;
      // Further below the goal's target = a little more pull, capped so it
      // nudges within the goal boost's scale rather than swamping deadlines.
      if (goal.gap) score += Math.min(priorityGoalBoost * 0.5, goal.gap * 2);
    }
    score += priorityGradeRiskBoost(a.course, cachedGrades);
    return { ...a, score, d, goal: goal ? goal.goal : null };
  }).sort((a, b) => b.score - a.score);
}

// The one-line "why this is your top priority" text under the ranked list.
function priorityAiText(top, userGoals, cachedGrades) {
  const matchingGoal = top.goal;
  const gradeAtRisk = priorityGradeRiskBoost(top.course, cachedGrades) > 0;
  if (matchingGoal && top.d < 0) return `"${top.title}" is overdue, and it's in the class tied to your goal "${matchingGoal}". Take care of it first.`;
  if (matchingGoal) return `"${top.title}" is your top priority - it's in the class tied to your goal "${matchingGoal}". Start here.`;
  if (top.d < 0) return `"${top.title}" is overdue. Take care of that first.`;
  if (top.d <= 1) return `"${top.title}" is due ${top.d === 0 ? 'today' : 'tomorrow'} - that's your top priority.`;
  if (gradeAtRisk) return `"${top.title}" is your top priority - your grade in ${top.course} could use the attention.`;
  return `Your most urgent assignment is "${top.title}", due in ${top.d} days. Start there.`;
}

// Body HTML for the Priority tab: the top-5 ranked cards (numbered, with a
// due-text derived from the scored item's precomputed `d` day-diff), plus a
// "Completed today" section with undo buttons when there's anything in it.
// scored is the computePriorityScores() result; completedToday is plain
// assignment objects.
function priorityListHTML(scored, completedToday) {
  const colors = ['p1', 'p2', 'p3', 'p4', 'p5'];
  let html = scored.slice(0, 5).map((a, i) => {
    const [bc, bl] = getBadge(a.assignment_type, a.title);
    const dueText = a.d < 0 ? `<span style="color:var(--error-color);">${Math.abs(a.d)}d overdue</span>`
      : a.d === 0 ? `<span style="color:var(--error-color);">due today</span>`
      : a.d === 1 ? `<span style="color:var(--error-color);">due tomorrow</span>`
      : `due ${new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `<div class="priority-card" data-assignment-id="${a.id}">
      <button class="priority-check" onclick="markPriorityDone('${a.id}')" title="Mark as done">✓</button>
      <div class="priority-num ${colors[i] || 'p5'}">${i + 1}</div>
      <div class="priority-info">
        <div class="card-row"><div class="card-title">${a.title}</div><span class="badge ${bc}">${bl}</span></div>
        <div class="card-sub" style="margin-top:3px;">${a.course || ''} · ${dueText}</div>
        ${a.goal ? `<div class="priority-goal-tag" title="Ranked higher because of this goal"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/></svg>${escapeHtml(a.goal)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  if (completedToday.length > 0) {
    html += `<div class="priority-completed-section">
      <div class="priority-completed-label">Completed today</div>
      ${completedToday.map(a => {
        const [bc, bl] = getBadge(a.assignment_type, a.title);
        return `<div class="priority-card completed-card" data-assignment-id="${a.id}">
          <button class="priority-check" style="border-color:var(--green);color:var(--green);" onclick="undoPriorityDone('${a.id}')" title="Undo">✓</button>
          <div class="priority-num p5" style="opacity:0.5;">✓</div>
          <div class="priority-info">
            <div class="card-row"><div class="card-title">${a.title}</div><span class="badge ${bc}">${bl}</span></div>
            <div class="card-sub" style="margin-top:3px;">${a.course || ''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  return html;
}
