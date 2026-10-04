/* ===========================
   STUDY TIME TRACKING
   The rule: every real minute a student studies is logged, however the
   session ends. Before, the focus timer only logged FINISHED rounds, so
   stopping 12 minutes into a 20-minute round (or finishing the homework
   early) logged nothing, and closing the tab mid-session lost everything.

   How it works now:
   - Studied time is measured (finished rounds + the part of the current
     round that has actually run, pauses excluded), not inferred.
   - It is saved as an ABSOLUTE total for the session row
     (minutes_studied = what the row held at the start + what this timer has
     measured), so saving it again any number of times never double counts.
   - A checkpoint save happens each time another minute is studied, when the
     timer pauses, and as the page is hidden or closed (a keep-alive request
     that survives the tab going away).
   - Stopping early asks "I finished" vs "just log it" instead of dropping
     the time; either way the minutes are kept.
   - A session scheduled for another day that gets started today moves to
     today, because that is the day the studying actually happened.
=========================== */

/* ---- Measurement -------------------------------------------------------------- */
function focusStudiedSec() {
  const st = focusState;
  if (!st) return 0;
  let sec = st.studiedSecDone || 0;
  if (st.phase === 'study' && !st.awaiting && st.totalSec) {
    const remaining = st.paused ? st.remainingSec : Math.max(0, (st.deadline - Date.now()) / 1000);
    sec += Math.max(0, st.totalSec - remaining);
  }
  return sec;
}
function focusStudiedMin() { return Math.round(focusStudiedSec() / 60); }

function deepStudiedSec() {
  const st = deepWorkState;
  if (!st) return 0;
  const total = st.blockMin * 60;
  if (st.awaiting) return total;
  if (st.phase !== 'active') return 0;
  const remaining = st.paused ? st.remainingSec : Math.max(0, (st.deadline - Date.now()) / 1000);
  return Math.max(0, Math.min(total, total - remaining));
}
function deepStudiedMin() { return Math.round(deepStudiedSec() / 60); }

function fmtStudyMinutes(min) {
  return min >= 60 ? fmtHoursMinutes(min) : `${min} min`;
}

/* ---- Saving ------------------------------------------------------------------- */
// Writes the session's total minutes (absolute) to the cache and the server.
function applyStudyMinutes(sessionId, baseMin, minutes, markComplete) {
  const s = cachedStudySessions.find(x => String(x.id) === String(sessionId));
  if (!s) return Promise.resolve(null);
  s.minutes_studied = baseMin + minutes;
  if (markComplete) s.completed = true;
  renderStudySessionsForDay();
  renderStudyTab();
  renderHome();
  const patch = { minutes_studied: s.minutes_studied };
  if (markComplete) patch.completed = true;
  return sbFetchWithRetry(`/rest/v1/study_sessions?id=eq.${sessionId}`, 'PATCH', patch, true);
}

function focusCheckpoint() {
  const st = focusState;
  if (!st) return;
  const m = focusStudiedMin();
  if (m <= (st.loggedMin || 0)) return;
  st.loggedMin = m;
  applyStudyMinutes(st.sessionId, st.baseMin || 0, m, false);
}
function deepCheckpoint() {
  const st = deepWorkState;
  if (!st) return;
  const m = deepStudiedMin();
  if (m <= (st.loggedMin || 0)) return;
  st.loggedMin = m;
  applyStudyMinutes(st.sessionId, st.baseMin || 0, m, false);
}

// Called when a timer is opened on a session: it should count for today.
function adoptSessionForToday(s) {
  const today = ymd(new Date());
  if (!s || s.session_date === today) return;
  s.session_date = today;
  renderDueCalendar();
  sbFetchWithRetry(`/rest/v1/study_sessions?id=eq.${s.id}`, 'PATCH', { session_date: today }, true);
}

// The page is going away or being hidden: send the latest total with a
// keep-alive request, which the browser finishes even as the tab closes.
function flushStudyOnExit() {
  const sends = [];
  if (typeof focusState !== 'undefined' && focusState) {
    const m = focusStudiedMin();
    if (m > (focusState.loggedMin || 0)) { focusState.loggedMin = m; sends.push([focusState.sessionId, (focusState.baseMin || 0) + m]); }
  }
  if (typeof deepWorkState !== 'undefined' && deepWorkState) {
    const m = deepStudiedMin();
    if (m > (deepWorkState.loggedMin || 0)) { deepWorkState.loggedMin = m; sends.push([deepWorkState.sessionId, (deepWorkState.baseMin || 0) + m]); }
  }
  sends.forEach(([id, total]) => {
    const s = cachedStudySessions.find(x => String(x.id) === String(id));
    if (s) s.minutes_studied = total;
    try {
      fetch(`${SB_URL}/rest/v1/study_sessions?id=eq.${id}`, {
        method: 'PATCH', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify({ minutes_studied: total }),
      });
    } catch (e) { /* nothing more can be done as the page closes */ }
  });
}
window.addEventListener('pagehide', flushStudyOnExit);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushStudyOnExit(); });

/* ---- Focus timer: ending ------------------------------------------------------ */
// Stop button: if any time has been studied, ask how to wrap up (the timer
// keeps running until a choice is made); if none, just close.
function focusEndPrompt() {
  if (!focusState) return;
  if (focusStudiedMin() < 1) { focusEndEarly(false); return; }
  const min = focusStudiedMin();
  document.getElementById('focus-body').innerHTML = `
    <div class="focus-title">Wrap up?</div>
    <div class="focus-sub">You have focused for ${fmtStudyMinutes(min)} so far. It all counts, whichever you pick.</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="focusEndEarly(true)">I finished - log it and mark it done</button>
      <button class="sync-btn" onclick="focusEndEarly(false)">Log ${fmtStudyMinutes(min)}, I will finish later</button>
      <button class="help-toggle-btn" onclick="renderFocusTimer()"><span style="font-size:13px;color:var(--text2);">Keep going</span></button>
    </div>`;
}

async function focusEndEarly(markDone) {
  if (!focusState) return;
  const min = focusStudiedMin();
  const { sessionId, baseMin } = focusState;
  closeFocusTimer();
  if (min > 0 || markDone) {
    await applyStudyMinutes(sessionId, baseMin || 0, min, !!markDone);
    if (min > 0) bumpStudyStreak();
    showReward(markDone ? `Done - ${fmtStudyMinutes(min)} of focus logged.` : `Saved - ${fmtStudyMinutes(min)} of focus logged.`, 'focus');
  }
}

// "I'm done - mark as complete" after a break.
async function focusFinish() {
  if (!focusState) return;
  const min = focusStudiedMin();
  const { sessionId, baseMin } = focusState;
  closeFocusTimer();
  await applyStudyMinutes(sessionId, baseMin || 0, min, true);
  if (min > 0) bumpStudyStreak();
  showReward(`Session complete - ${fmtStudyMinutes(min)} of real focus.`, 'focus');
}

/* ---- Deep work: ending -------------------------------------------------------- */
function deepWorkEndPrompt() {
  if (!deepWorkState) return;
  if (deepStudiedMin() < 1) { deepWorkEndEarly(false); return; }
  const min = deepStudiedMin();
  document.getElementById('deepwork-body').innerHTML = `
    <div class="focus-title">Wrap up?</div>
    <div class="focus-sub">You have done ${fmtStudyMinutes(min)} of deep work so far. It all counts, whichever you pick.</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="deepWorkEndEarly(true)">I finished - log it and mark it done</button>
      <button class="sync-btn" onclick="deepWorkEndEarly(false)">Log ${fmtStudyMinutes(min)}, I will finish later</button>
      <button class="help-toggle-btn" onclick="renderDeepWorkActive()"><span style="font-size:13px;color:var(--text2);">Keep going</span></button>
    </div>`;
}

async function deepWorkEndEarly(markDone) {
  if (!deepWorkState) return;
  const min = deepStudiedMin();
  const { sessionId, baseMin } = deepWorkState;
  closeDeepWorkTimer();
  if (min > 0 || markDone) {
    await applyStudyMinutes(sessionId, baseMin || 0, min, !!markDone);
    if (min > 0) bumpStudyStreak();
    showReward(markDone ? `Done - ${fmtStudyMinutes(min)} of deep work logged.` : `Saved - ${fmtStudyMinutes(min)} of deep work logged.`, 'focus');
  }
}

// The block ran to the end: "Finish" on the completion screen.
async function deepWorkFinish() {
  if (!deepWorkState) return;
  const min = deepStudiedMin();
  const { sessionId, baseMin } = deepWorkState;
  closeDeepWorkTimer();
  await applyStudyMinutes(sessionId, baseMin || 0, min, true);
  showReward(`Deep work logged - ${fmtStudyMinutes(min)}.`, 'focus');
}
