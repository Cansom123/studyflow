/* ===========================
   STUDY SESSION UTILITIES (pure functions, no app state)
   Seventh module in the multi-file split.
=========================== */


function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// A session's exact study time in seconds. Rows saved by the seconds-aware
// timer carry seconds_studied; older rows (or databases without that column)
// only have whole minutes, which stand in at 60 seconds each.
function studySessionSec(s) {
  const sec = Number(s.seconds_studied) || 0;
  return sec > 0 ? sec : (Number(s.minutes_studied) || 0) * 60;
}

// "40s", "12m 40s", "12m", "2h 15m": exact under an hour, hours and minutes
// above that (seconds on a 2-hour total are just noise).
function fmtDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec || 0));
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function studySessionCardHTML(s) {
  const timeRange = s.start_time
    ? `${fmtTime12(s.start_time)}${s.end_time ? ' – ' + fmtTime12(s.end_time) : ''}`
    : '';
  const studied = studySessionSec(s);
  const meta = [s.course, timeRange, studied > 0 ? `${fmtDuration(studied)} studied` : ''].filter(Boolean).join(' · ');
  return `<div class="study-session-card${s.completed ? ' done' : ''}" draggable="true" data-session-id="${s.id}" title="Drag onto another day to move it">
    <button class="done-check${s.completed ? ' checked' : ''}" onclick="toggleStudySessionDone('${s.id}',this)" title="Mark as done"><span class="done-check-icon">✓</span></button>
    <div class="study-session-info">
      <div class="study-session-title">${escapeHtml(s.title)}</div>
      ${meta ? `<div class="study-session-meta">${escapeHtml(meta)}</div>` : ''}
    </div>
    ${!s.completed ? `<button class="study-session-start" onclick="${s.session_type === 'deep_work' ? `openDeepWorkTimer('${s.id}')` : `openFocusTimer('${s.id}')`}" title="Start ${s.session_type === 'deep_work' ? 'deep work' : 'focus'} timer">▶ Start</button>` : ''}
    <button class="study-session-del" onclick="deleteStudySession('${s.id}')" title="Remove">✕</button>
  </div>`;
}

function startOfWeek(d) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  return start;
}

function fmtHoursMinutes(totalMin) {
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Totals, goal progress, and today's session list for the Study tab.
// userPrefs and today are passed in explicitly rather than read as globals.
function computeStudyStats(cachedStudySessions, userPrefs, today) {
  const ref = today || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const todayKey = ymd(ref);
  const weekStart = startOfWeek(ref);

  // Everything is summed in seconds and only turned into minutes for display
  // and for the minute-based goals.
  let todaySec = 0, weekSec = 0, totalSec = 0, deepSec = 0;
  cachedStudySessions.forEach(s => {
    const sec = studySessionSec(s);
    totalSec += sec;
    if (s.session_type === 'deep_work') deepSec += sec;
    if (!s.session_date) return;
    const d = new Date(s.session_date + 'T00:00:00');
    if (s.session_date === todayKey) todaySec += sec;
    if (d >= weekStart) weekSec += sec;
  });
  const todayMin = Math.floor(todaySec / 60), weekMin = Math.floor(weekSec / 60);
  const totalMin = Math.floor(totalSec / 60), deepWorkTotalMin = Math.floor(deepSec / 60);

  const dailyGoal = userPrefs.studyGoalDailyMin ?? 60;
  const weeklyGoal = userPrefs.studyGoalWeeklyMin ?? 300;
  const todayPct = dailyGoal > 0 ? Math.min(100, (todaySec / (dailyGoal * 60)) * 100) : 0;
  const weekPct = weeklyGoal > 0 ? Math.min(100, (weekSec / (weeklyGoal * 60)) * 100) : 0;
  const todayGoalMet = dailyGoal > 0 && todaySec >= dailyGoal * 60;
  const weekGoalMet = weeklyGoal > 0 && weekSec >= weeklyGoal * 60;

  let nudgeText = '';
  if (todayGoalMet) {
    nudgeText = "🎉 You've hit today's study goal - anything more is a bonus.";
  } else if (dailyGoal > 0) {
    nudgeText = `${fmtDuration(dailyGoal * 60 - todaySec)} left to hit today's goal.`;
  }

  const todayItems = cachedStudySessions.filter(s => s.session_date === todayKey);

  return {
    todayMin, weekMin, totalMin, deepWorkTotalMin,
    todaySec, weekSec, totalSec, deepWorkTotalSec: deepSec,
    todayFmt: fmtDuration(todaySec), weekFmt: fmtDuration(weekSec), totalFmt: fmtDuration(totalSec),
    deepWorkTotalFmt: fmtDuration(deepSec),
    dailyGoal, weeklyGoal, todayPct, weekPct, todayGoalMet, weekGoalMet,
    nudgeText, todayItems,
  };
}
