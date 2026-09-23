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

import { escapeHtml, cleanCourseName } from './format-utils.js';

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
