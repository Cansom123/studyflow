/* ===========================
   CLOSED WORK -> coco.1 SUGGESTIONS
   Assignments Canvas has closed (locked after the deadline, not turned in)
   can't be submitted anymore, so they no longer sit in the to-do lists,
   Priority ranking or overdue counts (see loadAssignments). They show up
   here instead, each with one thing coco.1 suggests doing about it:
   - recent, worth a lot, or in a class that needs the points: ask the
     teacher about late credit (with a ready-to-paste message);
   - otherwise: review what it covered, then clear it.
   "Clear" is remembered per account (prefs.handledClosed).
=========================== */

const CLOSED_HOME_LIMIT = 2;

function closedHandledSet() {
  return new Set((userPrefs.handledClosed || []).map(String));
}

function closedDaysAgo(a) {
  if (!a.due_date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(a.due_date).getTime()) / 864e5));
}

function closedGradePct(a) {
  const g = (cachedGrades || []).find(x => gradeNormName(x.course_name) === gradeNormName(a.course));
  if (!g) return null;
  const pct = g.current_score != null ? g.current_score : g.final_score;
  return pct != null ? Math.round(pct * 10) / 10 : null;
}

// Whether asking the teacher is worth it: it closed recently, it was worth
// a lot, or the class grade could use the points.
function closedWorthAsking(a) {
  const days = closedDaysAgo(a);
  const pct = closedGradePct(a);
  return (days !== null && days <= 7) || (a.points_possible || 0) >= 30 || (pct !== null && pct < 80);
}

// Closed work still waiting for the student to deal with, most worth
// acting on first. Also passed to coco.1's planning context.
function closedSuggestionList() {
  const handled = closedHandledSet();
  return (cachedClosedAssignments || [])
    .filter(a => !handled.has(String(a.id)) && !doneSet.has(decodeURIComponent(doneKey(a))))
    .sort((a, b) => (closedWorthAsking(b) - closedWorthAsking(a)) || ((b.points_possible || 0) - (a.points_possible || 0)));
}

function closedWhen(a) {
  const d = closedDaysAgo(a);
  if (d === null) return 'recently';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function closedSuggestionText(a) {
  if (closedWorthAsking(a)) {
    const pct = closedGradePct(a);
    const worth = a.points_possible
      ? ` It was worth ${a.points_possible} points${pct !== null ? `, and you're at ${pct}% in this class` : ''}.`
      : '';
    return `Canvas closed this ${closedWhen(a)}.${worth} Send your teacher a short message asking if they'll take it late or offer a make-up. Asking soon gives you the best chance.`;
  }
  return `This closed ${closedWhen(a)}, so late credit is unlikely. Skim what it covered so it doesn't catch you on a quiz, then clear it.`;
}

function closedTeacherMessage(a) {
  return `Hi, I missed the deadline for "${a.title}"${a.course ? ` in ${cleanCourseName ? cleanCourseName(a.course) : a.course}` : ''} and Canvas has closed the submission. Is there any way I could still turn it in for partial credit, or make it up? Thank you for your time.`;
}

function closedItemHTML(a) {
  const ask = closedWorthAsking(a);
  const id = escapeHtml(String(a.id));
  const due = a.due_date ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return `
    <div class="closed-item" data-closed-id="${id}">
      <div class="closed-item-head">
        <button type="button" class="closed-item-title" onclick="openAssignmentDetail('${id}')">${escapeHtml(a.title || 'Untitled')}</button>
        <span class="closed-item-tag">${ask ? 'Ask teacher' : 'Review'}</span>
      </div>
      <div class="closed-item-meta">${escapeHtml(cleanCourseName ? cleanCourseName(a.course || '') : (a.course || ''))}${due ? ` · was due ${due}` : ''}${a.points_possible ? ` · ${a.points_possible} pts` : ''}</div>
      <div class="closed-item-text">${escapeHtml(closedSuggestionText(a))}</div>
      <div class="closed-item-actions">
        ${ask ? `<button type="button" class="closed-btn primary" onclick="copyClosedTeacherMessage('${id}')">Copy message to teacher</button>` : ''}
        ${a.assignment_url ? `<a class="closed-btn" href="${escapeHtml(a.assignment_url)}" target="_blank" rel="noopener noreferrer">Open in Canvas</a>` : ''}
        <button type="button" class="closed-btn" onclick="clearClosedSuggestion('${id}')">${ask ? 'Handled' : 'Clear'}</button>
      </div>
    </div>`;
}

function closedCardHTML(list, limit) {
  const shown = limit ? list.slice(0, limit) : list;
  const more = list.length - shown.length;
  return `
    <div class="card glass closed-suggest">
      <div class="closed-suggest-head">
        <span class="school-ai-badge">✨ coco.1 suggests</span>
        <span class="closed-suggest-count">${list.length} can't be submitted anymore</span>
      </div>
      <div class="closed-suggest-sub">Canvas isn't accepting these, so they're off your to-do list. Here's what's still worth doing.</div>
      ${shown.map(closedItemHTML).join('')}
      ${more > 0 ? `<button type="button" class="closed-see-all" onclick="jumpTo('priority')">See all ${list.length} in Priority ›</button>` : ''}
    </div>`;
}

function renderClosedSuggestions() {
  const list = closedSuggestionList();
  const spots = [
    ['closed-suggest-home', CLOSED_HOME_LIMIT],
    ['closed-suggest-priority', 0],
    ['closed-suggest-allwork', CLOSED_HOME_LIMIT],
  ];
  spots.forEach(([id, limit]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = list.length ? closedCardHTML(list, limit) : '';
  });
}

async function copyClosedTeacherMessage(id) {
  const a = (cachedClosedAssignments || []).find(x => String(x.id) === String(id));
  if (!a) return;
  const text = closedTeacherMessage(a);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
  showReward(ok ? 'Message copied. Paste it into Canvas Inbox to your teacher.' : 'Could not copy. Open it in Canvas to message your teacher.', ok ? 'check' : 'error');
}

function clearClosedSuggestion(id) {
  const ids = (userPrefs.handledClosed || []).map(String);
  if (!ids.includes(String(id))) ids.push(String(id));
  userPrefs.handledClosed = ids.slice(-300);
  const item = document.querySelector(`.closed-item[data-closed-id="${CSS.escape(String(id))}"]`);
  const finish = () => renderClosedSuggestions();
  if (item && !(typeof prefersReducedMotion === 'function' && prefersReducedMotion())) {
    item.classList.add('closed-leaving');
    setTimeout(finish, 260);
  } else finish();
  saveUserPrefs();
}

// Re-render alongside the views that hold a spot for it.
(function hookClosedSuggestions() {
  ['renderHome', 'renderPriority', 'renderAllWork'].forEach(name => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      try { renderClosedSuggestions(); } catch (e) { console.warn('[closed suggestions]', e); }
      return r;
    };
  });
})();
