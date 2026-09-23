/* ===========================
   STUDY SESSION UTILITIES (pure functions, no app state)
   Seventh module in the multi-file split.
=========================== */

import { escapeHtml } from './format-utils.js';

export function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

export function studySessionCardHTML(s) {
  const timeRange = s.start_time
    ? `${fmtTime12(s.start_time)}${s.end_time ? ' – ' + fmtTime12(s.end_time) : ''}`
    : '';
  const meta = [s.course, timeRange].filter(Boolean).join(' · ');
  return `<div class="study-session-card${s.completed ? ' done' : ''}">
    <button class="done-check${s.completed ? ' checked' : ''}" onclick="toggleStudySessionDone('${s.id}',this)" title="Mark as done"><span class="done-check-icon">✓</span></button>
    <div class="study-session-info">
      <div class="study-session-title">${escapeHtml(s.title)}</div>
      ${meta ? `<div class="study-session-meta">${escapeHtml(meta)}</div>` : ''}
    </div>
    ${!s.completed ? `<button class="study-session-start" onclick="openFocusTimer('${s.id}')" title="Start focus timer">▶ Start</button>` : ''}
    <button class="study-session-del" onclick="deleteStudySession('${s.id}')" title="Remove">✕</button>
  </div>`;
}

export function startOfWeek(d) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  return start;
}

export function fmtHoursMinutes(totalMin) {
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
