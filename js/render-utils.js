/* ===========================
   HTML RENDERING HELPERS (pure functions, no app state)
   Sixth module in the multi-file split. Each of these takes plain data
   (an answer + confidence level, an announcement object, a timestamp) and
   returns an HTML string -- no reads from cachedAssignments/cachedGrades/
   the DOM, no side effects. That's what separates these from their
   siblings left in the classic script (e.g. checklistStepCardHTML, which
   reads the module-level editingChecklistStepId, or schoolAIBannerHTML,
   which reads live model-ready state) -- both of those stay put because
   they genuinely aren't pure.
=========================== */

import { escapeHtml, cleanCourseName, getBadge, getDueText, doneKey } from './format-utils.js';

// Deliberately NOT the same binding as index.html's classic-script `months`
// (which is called synchronously at page load, before any module runs, so
// it has to stay put) -- a tiny duplicated data array is far safer than a
// load-order dependency between a module and the classic script.
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function announcementTimeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const daysAgo = Math.floor(hrs / 24);
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const d = new Date(iso);
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function announcementCardHTML(a) {
  const expanded = a._expanded ? ' expanded' : '';
  const unread = !a.read ? ' unread' : '';
  const readCls = a.read ? ' read' : '';
  const body = a._expanded
    ? `<div class="announcement-body">${escapeHtml(a.message || 'No additional details.')}</div>
       ${a.announcement_url ? `<a href="${a.announcement_url}" target="_blank" rel="noopener noreferrer" class="canvas-link" onclick="event.stopPropagation()">Open in Canvas →</a>` : ''}`
    : '';
  return `<div class="announcement-card${expanded}${unread}${readCls}" onclick="toggleAnnouncement('${a.id}')">
    <div class="announcement-unread-dot"></div>
    <div class="announcement-main">
      <div class="announcement-course">${escapeHtml(cleanCourseName(a.course_name))}</div>
      <div class="announcement-title">${escapeHtml(a.title)}</div>
      <div class="announcement-meta">${announcementTimeAgo(a.posted_at)}${a.author_name ? ` · ${escapeHtml(a.author_name)}` : ''}</div>
      ${body}
    </div>
    ${a.read ? `<button class="announcement-dismiss" title="Done with this, remove it" onclick="dismissAnnouncement('${a.id}', event)">✕</button>` : ''}
  </div>`;
}

// Renders an answer according to how much coco.1 actually trusts it. A 'quoted'
// result is a verbatim line from the syllabus, so it's labelled as a direct
// quote rather than dressed up as an AI answer — honest about what it is.
export function cocoAnswerHTML(answer, confidence) {
  if (confidence === 'none') {
    return `<div class="school-ai-badge">✨ coco.1</div>` +
           `<div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  if (confidence === 'quoted') {
    return `<div class="school-ai-badge">✨ coco.1</div>` +
           `<div class="school-ai-disclaimer" style="margin-top:0;">Quoting the syllabus directly:</div>` +
           `<div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  return `<div class="school-ai-badge">✨ coco.1</div>` +
         `<div class="ask-answer-text">${escapeHtml(answer)}</div>` +
         `<div class="school-ai-disclaimer">AI-generated - check it against the highlighted source.</div>`;
}

export function cocoPlanningAnswerHTML(answer, confidence) {
  if (confidence === 'none') {
    return `<div class="school-ai-badge">✨ coco.1</div><div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  // 'computed' means the generated answer failed verification and this plan was
  // built straight from the assignment rows instead. Label it as what it is
  // rather than dressing it up as an AI answer — same honesty rule as the
  // syllabus 'quoted' state.
  if (confidence === 'computed') {
    return `<div class="school-ai-badge">✨ coco.1</div>` +
      `<div class="school-ai-disclaimer" style="margin-top:0;">Straight from your assignment list:</div>` +
      `<div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  return `<div class="school-ai-badge">✨ coco.1</div>` +
    `<div class="ask-answer-text">${escapeHtml(answer)}</div>` +
    `<div class="school-ai-disclaimer">AI-generated planning advice based on your synced assignments - always double-check deadlines yourself.</div>`;
}

// Assignment card HTML used across Home, Upcoming, Priority, and All Work.
// doneSet (which assignments the user has checked off client-side, keyed by
// doneKey) is passed in explicitly rather than read as a global -- this is
// the same pattern used for isAssignmentChecked in home-core.js.
export function aCard(a, isOverdue, redTint = false, doneSet) {
  const [bc, bl] = getBadge(a.assignment_type);
  const key = doneKey(a);
  const isDone = a.completed || doneSet.has(decodeURIComponent(key));
  const cardClass = `card${isDone ? ' done' : ''}${redTint && !isDone ? ' overdue-card' : ''}`;
  const overdueTag = redTint && !isDone ? `<span class="overdue-pill">OVERDUE</span>` : '';
  const titleInner = a.id
    ? `<span class="card-title-link" onclick="event.stopPropagation();openAssignmentDetail('${a.id}')">${a.title}${overdueTag}</span>`
    : `${a.title}${overdueTag}`;
  const canvasLink = a.assignment_url
    ? `<a href="${a.assignment_url}" target="_blank" rel="noopener noreferrer" class="canvas-link" onclick="event.stopPropagation()">Open in Canvas →</a>`
    : '';
  return `<div class="${cardClass}" data-done-key="${key}">
    <div class="card-row" style="gap:10px;align-items:center;">
      <button class="done-check${isDone ? ' checked' : ''}" onclick="toggleDone('${key}',this)" title="Mark as done"><span class="done-check-icon">✓</span></button>
      <div style="flex:1;min-width:0;">
        <div class="card-row"><div style="flex:1;min-width:0;"><div class="card-title">${titleInner}</div><div class="card-sub">${a.course||''}</div></div><span class="badge ${bc}">${bl}</span></div>
        ${getDueText(a.due_date, isOverdue, a.is_locked, a.lock_reason)}
        ${canvasLink}
      </div>
    </div>
  </div>`;
}

// Renders one checklist step, or its inline edit form when it's the step
// currently being edited. editingChecklistStepId is passed in explicitly
// (same "push state-reads up to the caller" pattern as aCard's doneSet)
// rather than read as a global.
export function checklistStepCardHTML(s, editingChecklistStepId) {
  if (s.id === editingChecklistStepId) {
    return `<div class="study-session-card">
      <div class="study-session-info" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="text" id="checklist-edit-text-${s.id}" value="${escapeHtml(s.step_text)}" class="settings-input" style="flex:1;min-width:140px;margin-bottom:0;">
        <input type="date" id="checklist-edit-date-${s.id}" value="${s.target_date || ''}" class="settings-input" style="width:auto;margin-bottom:0;">
      </div>
      <button class="study-session-start" onclick="saveEditChecklistStep('${s.id}')" title="Save">✓</button>
      <button class="study-session-del" onclick="cancelEditChecklistStep('${s.id}')" title="Cancel">✕</button>
    </div>`;
  }
  const dateStr = s.target_date
    ? new Date(s.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  return `<div class="study-session-card${s.completed ? ' done' : ''}">
    <button class="done-check${s.completed ? ' checked' : ''}" onclick="toggleChecklistStep('${s.id}', this)" title="Mark as done"><span class="done-check-icon">✓</span></button>
    <div class="study-session-info">
      <div class="study-session-title">${escapeHtml(s.step_text)}</div>
      ${dateStr ? `<div class="study-session-meta">${dateStr}</div>` : ''}
    </div>
    <button class="study-session-start" onclick="startEditChecklistStep('${s.id}')" title="Edit">✏️</button>
    <button class="study-session-del" onclick="deleteChecklistStep('${s.id}')" title="Remove">✕</button>
  </div>`;
}

// Body HTML for the grade-detail overlay: points lost, missing work, and
// not-yet-graded work ranked soonest-due-first, plus the "ask coco.1"
// panel. grade and breakdown (the gradeBreakdownForCourse() result) are
// passed in already-computed rather than read from cached state here.
export function gradeDetailBodyHTML(courseName, grade, breakdown, bannerHTML) {
  const pct = grade ? (grade.current_score != null ? grade.current_score : grade.final_score) : null;
  const letter = grade ? (grade.current_grade || grade.final_grade || '') : '';
  const { graded, missing, lowPerformers, openWork, allClosed } = breakdown;
  // Soonest due first -- a higher point value doesn't help a student get
  // ahead of anything if it isn't due for weeks. Undated items (not yet
  // scheduled by the teacher) sort last since there's nothing to act on yet.
  const openWorkRanked = [...openWork]
    .sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    });

  let html = '';
  if (pct != null || letter) {
    html += `<div class="card-sub" style="margin-bottom:16px;">Current grade: <strong style="color:var(--text1);">${pct != null ? escapeHtml(String(pct)) + '%' : ''}${letter ? ' (' + escapeHtml(letter) + ')' : ''}</strong></div>`;
  }

  if (!lowPerformers.length && !missing.length && !openWorkRanked.length && !graded.length) {
    html += `<div class="empty-box"><div class="empty-title">No graded work synced yet</div><div class="empty-sub">Once a few assignments are graded in Canvas, this'll show what's pulling the grade up or down.</div></div>`;
  } else {
    if (lowPerformers.length) {
      html += `<div class="section-label" style="margin-top:0;">Points lost</div><div class="card" style="padding:4px 16px;">` +
        lowPerformers.map(a => {
          const cls = a.pct >= 90 ? 'good' : a.pct >= 70 ? 'warn' : 'bad';
          return `<div class="grade-row"><span class="grade-name">${escapeHtml(a.title)}</span><span class="grade-score ${cls}">${a.score}/${a.points_possible}</span></div>`;
        }).join('') + `</div>`;
    }
    if (graded.length) {
      html += `<button class="settings-btn" style="margin-top:8px;" data-course="${escapeHtml(courseName)}" onclick="openAllGraded(this.dataset.course)">See all graded work (${graded.length})</button>`;
    }
    if (missing.length) {
      html += `<div class="section-label">Missing (counted as 0)</div><div class="card" style="padding:4px 16px;">` +
        missing.map(a => `<div class="grade-row"><span class="grade-name">${escapeHtml(a.title)}</span><span class="grade-score bad">Missing</span></div>`).join('') +
        `</div>`;
    }
    if (openWorkRanked.length) {
      html += `<div class="section-label">Not yet graded <span style="font-weight:400;color:var(--text2);text-transform:none;">- soonest due first</span></div><div class="card" style="padding:4px 16px;">` +
        openWorkRanked.map(a => {
          const hasDesc = !!(a.description && a.description.trim());
          return `<div class="grade-open-row"><span class="grade-open-name">${escapeHtml(a.title)}</span><span style="display:flex;align-items:center;flex-shrink:0;">${a.points_possible ? `<span class="grade-open-pts">${a.points_possible} pts</span>` : ''}${hasDesc ? `<span class="effort-badge">has description</span>` : ''}</span></div>`;
        }).join('') + `</div>`;
    } else if (allClosed && (lowPerformers.length || missing.length)) {
      html += `<div class="section-label">Not yet graded</div><div class="card" style="padding:12px 16px;"><span style="font-size:13px;color:var(--text2);">Nothing open left in this class - everything's either submitted or past due.</span></div>`;
    }
  }

  const chip2 = allClosed
    ? `<button class="coco-suggest-chip" onclick="askCocoGradeTipsSuggested('Everything left in this class is closed -- what should I do now?')">Everything's closed — now what?</button>`
    : `<button class="coco-suggest-chip" onclick="askCocoGradeTipsSuggested('What should I focus on to raise this grade?')">What should I focus on?</button>`;

  html += `<div class="card grade-tips-box">
    <div class="section-label" style="margin-top:0;">Ask coco.1 for tips</div>
    <div id="grade-tips-banner-host">${bannerHTML}</div>
    <div class="study-form-row" style="margin-bottom:0;">
      <input class="settings-input" id="grade-tips-input" placeholder='e.g. "how do I bring this grade up?"' style="margin-bottom:0;" onkeydown="if(event.key==='Enter'){askCocoGradeTips();}" />
      <button class="goal-add-btn" onclick="askCocoGradeTips()">Ask</button>
    </div>
    <div class="coco-suggest-row">
      <button class="coco-suggest-chip" onclick="askCocoGradeTipsSuggested('What is bringing this grade down?')">What's bringing it down?</button>
      ${chip2}
    </div>
    <div id="grade-tips-result" style="margin-top:10px;"></div>
  </div>`;

  return html;
}

// Body HTML for the "all graded work" overlay, most recently graded first.
export function gradeAllBodyHTML(graded) {
  // Most recently graded first -- that's what a student checking back in
  // actually wants to see, not their oldest quiz from week one.
  const sorted = [...graded].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : -Infinity;
    return db - da;
  });

  let html = `<div class="card-sub" style="margin-bottom:14px;">${sorted.length} graded assignment${sorted.length !== 1 ? 's' : ''}</div>`;
  if (!sorted.length) {
    html += `<div class="empty-box"><div class="empty-title">Nothing graded yet</div><div class="empty-sub">Once Canvas grades something in this class, it'll show up here.</div></div>`;
  } else {
    html += `<div class="card" style="padding:4px 16px;">` +
      sorted.map(a => {
        const pct = (a.score / a.points_possible) * 100;
        const cls = pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad';
        const dateStr = a.due_date ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        return `<div class="grade-row"><span class="grade-name">${escapeHtml(a.title)}${dateStr ? ` <span style="color:var(--text2);font-weight:400;">(${dateStr})</span>` : ''}</span><span class="grade-score ${cls}">${a.score}/${a.points_possible} <span style="font-weight:400;color:var(--text2);">(${pct.toFixed(0)}%)</span></span></div>`;
      }).join('') + `</div>`;
  }

  return html;
}

export function cocoGradeTipsAnswerHTML(answer, confidence) {
  if (confidence === 'none') {
    return `<div class="school-ai-badge">✨ coco.1</div><div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  if (confidence === 'computed') {
    return `<div class="school-ai-badge">✨ coco.1</div>` +
      `<div class="school-ai-disclaimer" style="margin-top:0;">Straight from your grade data:</div>` +
      `<div class="ask-answer-text">${escapeHtml(answer)}</div>`;
  }
  return `<div class="school-ai-badge">✨ coco.1</div>` +
    `<div class="ask-answer-text">${escapeHtml(answer)}</div>` +
    `<div class="school-ai-disclaimer">AI-generated advice based on your synced grades - always confirm anything important with your teacher.</div>`;
}
