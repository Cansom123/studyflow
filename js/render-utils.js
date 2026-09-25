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

import { escapeHtml, escapeRegex, cleanCourseName, getBadge, getDueText, doneKey, letterGradeClass } from './format-utils.js';
import { linkIconHTML } from './link-utils.js';
import { classifyAssignmentWork } from './checklist-core.js';

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

// Card list for the syllabus tab: one card per course, showing whether a
// syllabus was found on Canvas, added manually, or not found yet, with a
// short content preview. cachedSyllabi is passed in explicitly rather than
// looked up per course via a global.
export function syllabusListHTML(syllabusCourses, cachedSyllabi) {
  return syllabusCourses.map(c => {
    const s = cachedSyllabi.find(x => String(x.course_id) === String(c.id));
    const name = escapeHtml(cleanCourseName(c.name));
    let badge, badgeClass, sub;
    if (s && s.content) {
      badge = s.source === 'canvas' ? 'Found on Canvas' : 'Added by you';
      badgeClass = s.source === 'canvas' ? 'badge-hw' : 'badge-essay';
      sub = escapeHtml(s.content).slice(0, 110) + (s.content.length > 110 ? '…' : '');
    } else {
      badge = 'Not found yet';
      badgeClass = 'badge-test';
      sub = 'Tap to add it yourself';
    }
    return `<div class="card syllabus-card" onclick="openSyllabus('${c.id}')">
      <div class="card-row"><div class="card-title">${name}</div><span class="badge ${badgeClass}">${badge}</span></div>
      <div class="card-sub syllabus-preview">${sub}</div>
    </div>`;
  }).join('');
}

// Body HTML for the assignment-detail overlay: due date, badge, locked
// notice, description (or its placeholder), and the action row. The
// done-button's own label/state and the checklist section are filled in
// separately by the caller (updateAssignmentDetailDoneButton,
// renderChecklistSection), since those depend on live state this function
// doesn't need.
export function assignmentDetailBodyHTML(a) {
  const [bc, bl] = getBadge(a.assignment_type);
  const dueStr = a.due_date
    ? new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'No due date';
  const lockedNotice = a.is_locked
    ? (a.lock_reason === 'unavailable'
        ? `<div class="due-locked" style="margin-top:6px;">🔒 Not yet available - check Canvas for what's required to unlock it.</div>`
        : `<div class="due-locked" style="margin-top:6px;">🔒 Locked - Canvas is no longer accepting submissions for this assignment.</div>`)
    : '';
  const canvasBtn = a.assignment_url
    ? `<a href="${a.assignment_url}" target="_blank" rel="noopener noreferrer" class="sync-btn" style="width:auto;flex:1;text-decoration:none;text-align:center;display:inline-block;">Open in Canvas →</a>`
    : '';
  return `
    <div class="card-row" style="margin-bottom:14px;">
      <div>
        <div class="card-sub">${escapeHtml(a.course || '')} · Due ${dueStr}</div>
        ${lockedNotice}
      </div>
      <span class="badge ${bc}">${bl}</span>
    </div>
    ${a.description
      ? `<div class="syllabus-text">${escapeHtml(a.description)}</div>`
      : `<div class="card-sub">No description was provided for this assignment.</div>`}
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
      ${canvasBtn}
      <button class="sync-btn" id="a-detail-done-btn" style="width:auto;flex:1;" onclick="toggleDoneFromDetail('${a.id}')"></button>
    </div>
    <div id="a-checklist-section"></div>
  `;
}

// Body HTML for the All Work tab: buckets assignments into
// overdue/due-soon(within 7 days)/upcoming (skipping anything done),
// sorts each bucket undone-first then soonest-due-first, and renders each
// with aCard. Falls back to an empty-state box when nothing's left to show.
export function allWorkBodyHTML(assignments, doneSet, today) {
  const ref = today || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const weekFromNow = new Date(ref); weekFromNow.setDate(ref.getDate() + 7);
  const overdue = [], soon = [], upcoming = [];
  assignments.forEach(a => {
    if (a.completed || doneSet.has(decodeURIComponent(doneKey(a)))) return;
    if (!a.due_date) { upcoming.push(a); return; }
    const due = new Date(a.due_date); due.setHours(0, 0, 0, 0);
    if (due < ref) overdue.push(a);
    else if (due <= weekFromNow) soon.push(a);
    else upcoming.push(a);
  });
  const sortGroup = arr => [...arr].sort((a, b) => {
    const aDone = doneSet.has(decodeURIComponent(doneKey(a))) ? 1 : 0;
    const bDone = doneSet.has(decodeURIComponent(doneKey(b))) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aD = a.due_date ? new Date(a.due_date) : new Date('9999');
    const bD = b.due_date ? new Date(b.due_date) : new Date('9999');
    return aD - bD;
  });

  let html = '';
  if (overdue.length) {
    html += `<div class="section-label" style="color:var(--error-color);">Overdue</div>`;
    html += sortGroup(overdue).map(a => aCard(a, true, true, doneSet)).join('');
  }
  if (soon.length) {
    html += `<div class="section-label">Due Soon</div>`;
    html += sortGroup(soon).map(a => aCard(a, false, false, doneSet)).join('');
  }
  if (upcoming.length) {
    html += `<div class="section-label">Upcoming</div>`;
    html += sortGroup(upcoming).map(a => aCard(a, false, false, doneSet)).join('');
  }
  return html || '<div class="empty-box"><div class="empty-title">No assignments</div></div>';
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

// Body HTML for the plain-text syllabus search results: for each syllabus
// containing a literal (case-insensitive) match, a short snippet around
// the first occurrence with the match highlighted. query should already
// be trimmed and lowercased by the caller.
export function syllabusSearchResultsHTML(cachedSyllabi, syllabusCourses, query) {
  const rx = new RegExp(escapeRegex(query), 'ig');
  const matches = [];
  cachedSyllabi.forEach(s => {
    if (!s.content) return;
    const idx = s.content.toLowerCase().indexOf(query);
    if (idx === -1) return;
    const start = Math.max(0, idx - 40);
    const end = Math.min(s.content.length, idx + query.length + 60);
    let snippet = s.content.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < s.content.length) snippet += '…';
    const course = syllabusCourses.find(c => String(c.id) === String(s.course_id));
    matches.push({ courseId: s.course_id, name: course ? cleanCourseName(course.name) : (s.course_name || 'Course'), snippet });
  });

  if (matches.length === 0) {
    return `<div class="empty-box"><div class="empty-title">No matches</div><div class="empty-sub">Try a different word - like "office hours," "late policy," or "grading."</div></div>`;
  }

  return matches.map(m => {
    const highlighted = escapeHtml(m.snippet).replace(rx, match => `<mark>${match}</mark>`);
    return `<div class="card syllabus-card" onclick="openSyllabus('${m.courseId}')">
      <div class="card-title">${escapeHtml(m.name)}</div>
      <div class="card-sub syllabus-preview">${highlighted}</div>
    </div>`;
  }).join('');
}

// Card list for the Grades tab: one card per graded course, with a color
// bar (A/B/C/other) and either a percentage or a bare letter when only one
// is available. withGrades should already be filtered to courses that
// have a published grade.
export function gradeCardsHTML(withGrades) {
  const barColors = { 'grade-a': 'var(--green)', 'grade-b': 'var(--accent)', 'grade-c': 'var(--amber)', 'grade-df': 'var(--red)' };
  return withGrades.map(g => {
    const score = g.current_score != null ? parseFloat(g.current_score) : parseFloat(g.final_score);
    const letter = g.current_grade || g.final_grade || '';
    const cleanName = cleanCourseName(g.course_name);
    const letterClass = letterGradeClass(letter);
    const scoreText = !isNaN(score) ? `${score.toFixed(1)}%` : '';
    const barColor = barColors[letterClass] || 'var(--accent)';
    const barWidth = !isNaN(score) ? Math.min(Math.max(score, 0), 100) : 0;
    return `<div class="card grade-card" data-course="${escapeHtml(g.course_name)}" onclick="openGradeDetail(this.dataset.course)">
      <div class="grade-card-left">
        <div class="grade-card-name">${cleanName}</div>
        ${barWidth > 0 ? `<div class="grade-bar-wrap"><div class="grade-bar" style="--w:${barWidth}%;background:${barColor}"></div></div>` : ''}
        <div class="grade-breakdown-hint">Tap to see what's affecting this grade</div>
      </div>
      <div class="grade-card-right">
        <div class="grade-card-letter ${letterClass}">${letter || '-'}</div>
        ${scoreText ? `<div class="grade-card-pct">${scoreText}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Home's compact grade list: just name + letter, capped at `limit` courses,
// with the same empty-state message as the original.
export function homeGradesListHTML(cachedGrades, limit = 4) {
  const withGrades = cachedGrades.filter(g => g.current_score != null || g.final_score != null || g.current_grade || g.final_grade);
  if (withGrades.length === 0) {
    return `<div style="color:var(--text2);font-size:13px;">No grades published yet.</div>`;
  }
  return withGrades.slice(0, limit).map(g => {
    const letter = g.current_grade || g.final_grade || '';
    const letterClass = letterGradeClass(letter);
    return `<div class="grade-row"><span class="grade-name">${escapeHtml(cleanCourseName(g.course_name))}</span><span class="grade-letter ${letterClass}" style="background:transparent;">${escapeHtml(letter || '-')}</span></div>`;
  }).join('');
}

// Card list for the "what's new since your last visit" overlay. Uses its
// own small abbreviated month array rather than the classic script's
// `months` (full names) -- same "small local duplicate over a cross-file
// format mismatch" call as elsewhere in this module.
export function wsAssignmentListHTML(assignments) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return assignments.map(a => {
    const due = a.due_date ? new Date(a.due_date) : null;
    const dueStr = due ? `${monthNames[due.getMonth()]} ${due.getDate()}` : 'No due date';
    const wsLink = a.assignment_url
      ? `<a href="${a.assignment_url}" target="_blank" rel="noopener noreferrer" class="canvas-link">Open in Canvas →</a>`
      : '';
    return `<div class="ws-a-card">
      <div class="ws-a-title">${a.title}</div>
      <div class="ws-a-meta">${a.course || ''} · Due ${dueStr}</div>
      ${wsLink}
    </div>`;
  }).join('');
}

// Home's mini quick-links grid: an "add a link" prompt when there are none,
// otherwise the 4 most-recently-opened (never-opened links sort after,
// newest-added first).
export function homeCustomLinksHTML(links) {
  if (links.length === 0) {
    return `<button class="home-qlink" style="grid-column:1 / -1;" onclick="jumpTo('links')">
        <div class="home-qlink-icon">+</div>
        <span>Add a link</span>
      </button>`;
  }
  const recent = links
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0))
    .slice(0, 4);
  return recent.map(l => `
        <button class="home-qlink" onclick="openCustomLink(${l.i})">
          <div class="home-qlink-icon">${linkIconHTML(l.url)}</div>
          <span>${escapeHtml(l.label)}</span>
        </button>`).join('');
}

// The full Links tab list: newest-added first, each with a remove button.
export function linksTabListHTML(links) {
  if (links.length === 0) {
    return `<div class="empty-box"><div class="empty-icon"><svg viewBox="0 0 20 20" fill="none"><path d="M8.5 11.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div><div class="empty-title">No links yet</div><div class="empty-sub">Add a Google Doc, NotebookLM notebook, class site - anything you use for school - below.</div></div>`;
  }
  const ordered = links.map((l, i) => ({ ...l, i })).reverse();
  return ordered.map(l => `
        <div class="card link-card" style="display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="openCustomLink(${l.i})">
          <div class="home-qlink-icon" style="flex-shrink:0;">${linkIconHTML(l.url)}</div>
          <div style="flex:1;min-width:0;">
            <div class="card-title">${escapeHtml(l.label)}</div>
            <div class="card-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(l.url)}</div>
          </div>
          <button class="goal-remove" title="Remove" onclick="event.stopPropagation();removeCustomLink(${l.i}, this)">✕</button>
        </div>`).join('');
}

// The assignment detail overlay's "Study plan" checklist section: empty
// (assignment not eligible for a checklist), a "generate one" prompt when
// eligible but no steps exist yet, or the step cards plus their action
// buttons. steps should already be checklistForAssignment(a.id)'s result;
// bannerHTML is the caller's schoolAIBannerHTML('checklist-ai') output,
// passed in rather than called here since that reads live model-ready
// state and isn't pure.
export function checklistSectionHTML(a, steps, editingChecklistStepId, bannerHTML) {
  const workType = classifyAssignmentWork(a);
  const eligible = workType !== 'content' && !!a.due_date && !a.completed;
  if (!eligible) return '';

  if (steps.length === 0) {
    return `
      <div class="section-label" style="margin-top:20px;">Study plan</div>
      <div id="checklist-ai-banner-host">${bannerHTML}</div>
      <button class="settings-btn" onclick="handleGenerateChecklistClick('${a.id}', this)">🗓️ Generate a study checklist</button>
    `;
  }

  const stepsHTML = steps.map(s => checklistStepCardHTML(s, editingChecklistStepId)).join('');

  return `
    <div class="section-label" style="margin-top:20px;">Study plan</div>
    ${stepsHTML}
    <button class="settings-btn" style="margin-top:8px;" onclick="addManualChecklistStep('${a.id}')">+ Add a step</button>
    <button class="sync-btn" style="margin-top:8px;" onclick="addChecklistToCalendar('${a.id}')">📅 Add these to my calendar</button>
  `;
}

// Body HTML for the syllabus detail overlay: source label, the ask/search
// toggle + coco.1 banner + search box (when there's content to search),
// the syllabus text itself, and the edit/save/download/retry action row.
// s is the syllabusFor()-style record (or undefined/null when nothing's
// been found yet); bannerHTML is the caller's
// schoolAIBannerHTML('syl-ai') output, passed in for the same
// not-pure-so-push-it-up reason as checklistSectionHTML's banner.
export function syllabusDetailBodyHTML(s, sylSearchMode, courseId, bannerHTML) {
  const hasContent = !!(s && s.content);
  const sourceLabel = hasContent
    ? (s.source === 'canvas' ? 'Pulled automatically from Canvas' : 'Added manually')
    : "StudyFlow couldn't find this on Canvas. Paste it in yourself below.";
  return `
    <div class="card-sub" style="margin-bottom:14px;">${escapeHtml(sourceLabel)}</div>
    ${hasContent ? `
    <div class="seg-control" id="syl-mode-toggle" style="margin-bottom:10px;">
      <button class="seg-btn active" data-mode="ask" onclick="setSylSearchMode('ask')">✨ Ask</button>
      <button class="seg-btn" data-mode="literal" onclick="setSylSearchMode('literal')">Search</button>
    </div>
    <div id="syl-ai-banner-host">${bannerHTML}</div>
    <div class="syl-inline-search-row">
      <input class="settings-input" id="syl-inline-search" oninput="handleSylSearchInput()" onkeydown="if(event.key==='Enter'){searchWithinSyllabus();}" placeholder='Ask about this syllabus - "what is the grading policy?"' style="margin-bottom:0;flex:1;" />
      ${sylSearchMode === 'ask' ? `<button class="goal-add-btn" style="flex-shrink:0;" onclick="searchWithinSyllabus()">Ask</button>` : ''}
      <button class="detail-close" style="width:30px;height:30px;flex-shrink:0;" onclick="jumpSyllabusMatch(-1)" title="Previous match">‹</button>
      <button class="detail-close" style="width:30px;height:30px;flex-shrink:0;" onclick="jumpSyllabusMatch(1)" title="Next match">›</button>
    </div>
    <div id="syl-inline-counter" style="font-size:12px;color:var(--text2);margin:6px 0 10px;"></div>
    <div id="syl-ai-answer"></div>
    <div class="syllabus-text" id="syl-view">${escapeHtml(s.content)}</div>` : ''}
    <textarea class="syllabus-textarea" id="syl-edit-input" style="display:${hasContent ? 'none' : 'block'};margin-top:${hasContent ? '12px' : '0'};" placeholder="Paste your syllabus text here...">${hasContent ? escapeHtml(s.content) : ''}</textarea>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      ${hasContent ? `<button class="sync-btn" id="syl-edit-toggle-btn" style="width:auto;flex:1;" onclick="toggleSyllabusEdit()">Edit</button>` : ''}
      <button class="sync-btn" style="width:auto;flex:1;" onclick="saveSyllabusManual()">${hasContent ? 'Save changes' : 'Save'}</button>
      ${hasContent ? `<button class="change-courses-btn" style="width:auto;flex:1;margin-bottom:0;" onclick="downloadSyllabus('${courseId}')">Download</button>` : ''}
      <button class="change-courses-btn" style="width:auto;flex:1;margin-bottom:0;" onclick="retryAutoFetchSyllabus('${courseId}')">Try Canvas again</button>
    </div>
    <div id="syl-save-msg" style="margin-top:10px;"></div>
  `;
}

// Body HTML for the "completed assignments" overlay: everything marked
// done (either Canvas-completed or checked off in doneSet), most recently
// completed first, or the empty-state box.
export function completedAssignmentsBodyHTML(assignments, doneSet) {
  const done = assignments
    .filter(a => a.completed || doneSet.has(decodeURIComponent(doneKey(a))))
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
  return done.length
    ? done.map(a => aCard(a, false, false, doneSet)).join('')
    : `<div class="empty-box"><div class="empty-title">Nothing completed yet</div><div class="empty-sub">Assignments you check off will show up here.</div></div>`;
}
