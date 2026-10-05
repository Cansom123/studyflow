/* ===========================
   STUDY TIME TRACKING (to the second)
   The rule: every real second a student studies is logged, however the
   session ends.

   - Studied time is measured from the clock (finished rounds + the part of
     the current round that has run, pauses excluded).
   - It is saved as an ABSOLUTE total for the session row
     (seconds_studied = what the row held at the start + what this timer has
     measured), so saving again any number of times never double counts.
   - minutes_studied is kept alongside as the rounded value, for older
     clients and anything still reading it.
   - Checkpoint saves happen once a minute while studying, on pause, and as
     the page is hidden or closed (a keep-alive request that survives the
     tab going away), so a crash loses at most the last minute and a normal
     close loses nothing.
   - Stopping early asks "I finished" vs "just log it" instead of dropping
     the time; either way the time is kept.
   - A session scheduled for another day that gets started today moves to
     today, because that is the day the studying happened.

   The seconds_studied column is added by a migration the owner runs
   (supabase/migrations/20261005000000_...). Until it exists the app detects
   that and saves rounded minutes exactly as before, so nothing breaks.
=========================== */

/* ---- Is the seconds column there? --------------------------------------------- */
let studySecondsColumn = null;   // null = not checked yet, then true / false
async function detectStudySecondsColumn() {
  if (studySecondsColumn !== null) return studySecondsColumn;
  const { ok } = await sbFetchWithRetry(`/rest/v1/study_sessions?user_id=eq.${USER_ID}&select=seconds_studied&limit=1`);
  studySecondsColumn = !!ok;
  return studySecondsColumn;
}

/* ---- Measurement -------------------------------------------------------------- */
function focusStudiedSec() {
  const st = focusState;
  if (!st) return 0;
  let sec = st.studiedSecDone || 0;
  if (st.phase === 'study' && !st.awaiting && st.totalSec) {
    const remaining = st.paused ? st.remainingSec : Math.max(0, (st.deadline - Date.now()) / 1000);
    sec += Math.max(0, st.totalSec - remaining);
  }
  return Math.round(sec);
}

function deepStudiedSec() {
  const st = deepWorkState;
  if (!st) return 0;
  const total = st.blockMin * 60;
  if (st.awaiting) return total;
  if (st.phase !== 'active') return 0;
  const remaining = st.paused ? st.remainingSec : Math.max(0, (st.deadline - Date.now()) / 1000);
  return Math.round(Math.max(0, Math.min(total, total - remaining)));
}

/* ---- Saving ------------------------------------------------------------------- */
function studyPatchFor(totalSec, markComplete) {
  const patch = { minutes_studied: Math.round(totalSec / 60) };
  if (studySecondsColumn) patch.seconds_studied = totalSec;
  if (markComplete) patch.completed = true;
  return patch;
}

// Writes the session's total (absolute) to the cache and the server.
async function applyStudySeconds(sessionId, baseSec, sec, markComplete) {
  const s = cachedStudySessions.find(x => String(x.id) === String(sessionId));
  if (!s) return null;
  const total = baseSec + sec;
  s.seconds_studied = total;
  s.minutes_studied = Math.round(total / 60);
  if (markComplete) s.completed = true;
  renderStudySessionsForDay();
  renderStudyTab();
  renderHome();
  const url = `/rest/v1/study_sessions?id=eq.${sessionId}`;
  let res = await sbFetchWithRetry(url, 'PATCH', studyPatchFor(total, markComplete), true);
  // A failed save while using the seconds column may mean the column is gone
  // (or never was): re-check, and if so save minutes only rather than lose it.
  if (res && !res.ok && studySecondsColumn) {
    studySecondsColumn = null;
    await detectStudySecondsColumn();
    if (!studySecondsColumn) res = await sbFetchWithRetry(url, 'PATCH', studyPatchFor(total, markComplete), true);
  }
  return res;
}

// Saves when a full minute has been studied since the last save (or always,
// with force: pauses and round ends).
function focusCheckpoint(force) {
  const st = focusState;
  if (!st) return;
  const sec = focusStudiedSec();
  if (sec <= (st.loggedSec || 0) || (!force && sec - (st.loggedSec || 0) < 60)) return;
  st.loggedSec = sec;
  applyStudySeconds(st.sessionId, st.baseSec || 0, sec, false);
}
function deepCheckpoint(force) {
  const st = deepWorkState;
  if (!st) return;
  const sec = deepStudiedSec();
  if (sec <= (st.loggedSec || 0) || (!force && sec - (st.loggedSec || 0) < 60)) return;
  st.loggedSec = sec;
  applyStudySeconds(st.sessionId, st.baseSec || 0, sec, false);
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
    const sec = focusStudiedSec();
    if (sec > (focusState.loggedSec || 0)) { focusState.loggedSec = sec; sends.push([focusState.sessionId, (focusState.baseSec || 0) + sec]); }
  }
  if (typeof deepWorkState !== 'undefined' && deepWorkState) {
    const sec = deepStudiedSec();
    if (sec > (deepWorkState.loggedSec || 0)) { deepWorkState.loggedSec = sec; sends.push([deepWorkState.sessionId, (deepWorkState.baseSec || 0) + sec]); }
  }
  sends.forEach(([id, total]) => {
    const s = cachedStudySessions.find(x => String(x.id) === String(id));
    if (s) { s.seconds_studied = total; s.minutes_studied = Math.round(total / 60); }
    try {
      fetch(`${SB_URL}/rest/v1/study_sessions?id=eq.${id}`, {
        method: 'PATCH', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${ACCESS_TOKEN}` },
        body: JSON.stringify(studyPatchFor(total, false)),
      });
    } catch (e) { /* nothing more can be done as the page closes */ }
  });
}
window.addEventListener('pagehide', flushStudyOnExit);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushStudyOnExit(); });

/* ---- The "done" toast, for study time ----------------------------------------- */
// Same toast as checking off an assignment: today's study total rolls up
// from what it was before this session, with a bar toward the daily goal.
// Reaching the goal with this session gets the big version and confetti.
function celebrateStudyDone(sec, markDone, kind) {
  if (!(sec > 0) || typeof showDoneToast !== 'function') return;
  const st = computeStudyStats(cachedStudySessions, userPrefs, new Date());
  const after = st.todaySec, before = Math.max(0, after - sec);
  const goalSec = (st.dailyGoal || 0) * 60;
  const hitGoal = goalSec > 0 && after >= goalSec && before < goalSec;
  const what = kind === 'deep' ? 'deep work' : 'focus';
  const message = hitGoal ? "That's today's study goal. Great work."
    : markDone ? `Session done - ${fmtDuration(sec)} of ${what}.`
    : `${fmtDuration(sec)} of ${what} logged. Pick it up any time.`;
  const bar = goalSec > 0
    ? { from: Math.min(1, before / goalSec), to: Math.min(1, after / goalSec), text: `${fmtDuration(Math.min(after, goalSec))} of ${fmtDuration(goalSec)} goal` }
    : null;
  const toast = showDoneToast(fmtDuration(before), fmtDuration(after), null, message, hitGoal, { label: 'studied today', bar, study: true });
  if (!hitGoal || (typeof prefersReducedMotion === 'function' && prefersReducedMotion())) return;
  setTimeout(() => {
    const r = toast.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    celebrateUpward(r.left + r.width / 2, midY, r.width * 0.8, -Math.PI / 2, 1.7, 34);
    celebrateUpward(16, midY, 30, -Math.PI / 2 + 0.55, 1.1, 20);
    celebrateUpward(window.innerWidth - 16, midY, 30, -Math.PI / 2 - 0.55, 1.1, 20);
  }, 250);
}

/* ---- Focus timer: ending ------------------------------------------------------ */
// Stop button: if any time has been studied, ask how to wrap up (the timer
// keeps running until a choice is made); if none, just close.
function focusEndPrompt() {
  if (!focusState) return;
  const sec = focusStudiedSec();
  if (sec < 1) { focusEndEarly(false); return; }
  document.getElementById('focus-body').innerHTML = `
    <div class="focus-title">Wrap up?</div>
    <div class="focus-sub">You have focused for ${fmtDuration(sec)} so far. It all counts, whichever you pick.</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="focusEndEarly(true)">I finished - log it and mark it done</button>
      <button class="sync-btn" onclick="focusEndEarly(false)">Log ${fmtDuration(sec)}, I will finish later</button>
      <button class="help-toggle-btn" onclick="renderFocusTimer()"><span style="font-size:13px;color:var(--text2);">Keep going</span></button>
    </div>`;
}

async function focusEndEarly(markDone) {
  if (!focusState) return;
  const sec = focusStudiedSec();
  const { sessionId, baseSec } = focusState;
  closeFocusTimer();
  if (sec > 0 || markDone) {
    await applyStudySeconds(sessionId, baseSec || 0, sec, !!markDone);
    if (sec > 0) bumpStudyStreak();
    if (sec > 0) celebrateStudyDone(sec, !!markDone, 'focus');
    else showReward('Marked done.', 'focus');
  }
}

// "I'm done - mark as complete" after a break.
async function focusFinish() {
  if (!focusState) return;
  const sec = focusStudiedSec();
  const { sessionId, baseSec } = focusState;
  closeFocusTimer();
  await applyStudySeconds(sessionId, baseSec || 0, sec, true);
  if (sec > 0) bumpStudyStreak();
  if (sec > 0) celebrateStudyDone(sec, true, 'focus');
  else showReward('Session marked done.', 'focus');
}

/* ---- Deep work: ending -------------------------------------------------------- */
function deepWorkEndPrompt() {
  if (!deepWorkState) return;
  const sec = deepStudiedSec();
  if (sec < 1) { deepWorkEndEarly(false); return; }
  document.getElementById('deepwork-body').innerHTML = `
    <div class="focus-title">Wrap up?</div>
    <div class="focus-sub">You have done ${fmtDuration(sec)} of deep work so far. It all counts, whichever you pick.</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="deepWorkEndEarly(true)">I finished - log it and mark it done</button>
      <button class="sync-btn" onclick="deepWorkEndEarly(false)">Log ${fmtDuration(sec)}, I will finish later</button>
      <button class="help-toggle-btn" onclick="renderDeepWorkActive()"><span style="font-size:13px;color:var(--text2);">Keep going</span></button>
    </div>`;
}

async function deepWorkEndEarly(markDone) {
  if (!deepWorkState) return;
  const sec = deepStudiedSec();
  const { sessionId, baseSec } = deepWorkState;
  closeDeepWorkTimer();
  if (sec > 0 || markDone) {
    await applyStudySeconds(sessionId, baseSec || 0, sec, !!markDone);
    if (sec > 0) bumpStudyStreak();
    if (sec > 0) celebrateStudyDone(sec, !!markDone, 'deep');
    else showReward('Marked done.', 'focus');
  }
}

// The block ran to the end: "Finish" on the completion screen.
async function deepWorkFinish() {
  if (!deepWorkState) return;
  const sec = deepStudiedSec();
  const { sessionId, baseSec } = deepWorkState;
  closeDeepWorkTimer();
  await applyStudySeconds(sessionId, baseSec || 0, sec, true);
  if (sec > 0) celebrateStudyDone(sec, true, 'deep');
  else showReward('Session marked done.', 'focus');
}
