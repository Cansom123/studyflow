/* ===========================
   STUDY SESSION UTILITIES (pure functions, no app state)
   Seventh module in the multi-file split.
=========================== */

import { escapeHtml } from './format-utils.js';
import { ymd } from './checklist-core.js';

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
    ${!s.completed ? `<button class="study-session-start" onclick="${s.session_type === 'deep_work' ? `openDeepWorkTimer('${s.id}')` : `openFocusTimer('${s.id}')`}" title="Start ${s.session_type === 'deep_work' ? 'deep work' : 'focus'} timer">▶ Start</button>` : ''}
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

// Totals, goal progress, and today's session list for the Study tab.
// userPrefs and today are passed in explicitly rather than read as globals.
export function computeStudyStats(cachedStudySessions, userPrefs, today) {
  const ref = today || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const todayKey = ymd(ref);
  const weekStart = startOfWeek(ref);

  let todayMin = 0, weekMin = 0, totalMin = 0, deepWorkTotalMin = 0;
  cachedStudySessions.forEach(s => {
    const min = s.minutes_studied || 0;
    totalMin += min;
    if (s.session_type === 'deep_work') deepWorkTotalMin += min;
    if (!s.session_date) return;
    const d = new Date(s.session_date + 'T00:00:00');
    if (s.session_date === todayKey) todayMin += min;
    if (d >= weekStart) weekMin += min;
  });

  const dailyGoal = userPrefs.studyGoalDailyMin ?? 60;
  const weeklyGoal = userPrefs.studyGoalWeeklyMin ?? 300;
  const todayPct = dailyGoal > 0 ? Math.min(100, (todayMin / dailyGoal) * 100) : 0;
  const weekPct = weeklyGoal > 0 ? Math.min(100, (weekMin / weeklyGoal) * 100) : 0;
  const todayGoalMet = todayMin >= dailyGoal && dailyGoal > 0;
  const weekGoalMet = weekMin >= weeklyGoal && weeklyGoal > 0;

  let nudgeText = '';
  if (dailyGoal > 0 && todayMin >= dailyGoal) {
    nudgeText = "🎉 You've hit today's study goal - anything more is a bonus.";
  } else if (dailyGoal > 0) {
    nudgeText = `${dailyGoal - todayMin} minutes left to hit today's goal.`;
  }

  const todayItems = cachedStudySessions.filter(s => s.session_date === todayKey);

  return {
    todayMin, weekMin, totalMin, deepWorkTotalMin,
    todayFmt: fmtHoursMinutes(todayMin), weekFmt: fmtHoursMinutes(weekMin), totalFmt: fmtHoursMinutes(totalMin),
    deepWorkTotalFmt: fmtHoursMinutes(deepWorkTotalMin),
    dailyGoal, weeklyGoal, todayPct, weekPct, todayGoalMet, weekGoalMet,
    nudgeText, todayItems,
  };
}
