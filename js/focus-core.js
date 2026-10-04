
// Focus timer view-model builders: derive what the doc title / mini-bar /
// full timer body should show from focusState, without touching the DOM.
// focusState is passed in explicitly (it's already just one object the
// classic script reads) rather than closed over as a global, so these are
// testable without a document.

function computeFocusDocTitle(focusState, focusOriginalTitle) {
  if (focusState.awaiting) return focusOriginalTitle || 'StudyFlow';
  const label = focusState.phase === 'study' ? 'Studying' : 'Break';
  return focusState.paused
    ? `⏸ ${fmtClock(focusState.remainingSec)} - StudyFlow`
    : `${fmtClock(focusState.remainingSec)} · ${label} - StudyFlow`;
}

function computeFocusMiniBarView(focusState) {
  if (!focusState || !focusState.minimized) return { visible: false };
  const isStudy = focusState.phase === 'study';
  const label = focusState.awaiting
    ? 'Round done - tap to continue'
    : focusState.paused
      ? `Paused · ${isStudy ? 'focus' : 'break'}`
      : (isStudy ? `Focus · ${focusState.sessionTitle}` : 'Break');
  return {
    visible: true,
    isPaused: !!focusState.paused,
    label,
    time: focusState.awaiting ? '' : fmtClock(focusState.remainingSec),
    pauseBtnVisible: !focusState.awaiting,
    pauseBtnLabel: focusState.paused ? '▶' : '❚❚',
    pauseBtnTitle: focusState.paused ? 'Resume' : 'Pause',
  };
}

/* ---- Timer ring (shared by the focus and deep work timers) ----------------
   A ring that drains as time runs out, with the countdown in the middle.
   Built once per phase; each second only the number and the arc move
   (updateTimerRing), so the drain animates smoothly instead of the whole
   screen being rebuilt every tick. variant: 'focus' | 'break' | 'deep'. */
const TIMER_RING_R = 88;
const TIMER_RING_C = 2 * Math.PI * TIMER_RING_R;
const TIMER_ICONS = {
  pause: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5.5" y="4.5" width="3.2" height="11" rx="1"/><rect x="11.3" y="4.5" width="3.2" height="11" rx="1"/></svg>',
  play: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M7 4.8v10.4l8.2-5.2z"/></svg>',
  stop: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="2"/></svg>',
};

function timerRingHTML(remaining, total, variant, paused) {
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return `
    <div class="ft-ring ft-${variant}${paused ? ' is-paused' : ''}">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle class="ft-track" cx="100" cy="100" r="${TIMER_RING_R}"/>
        <circle class="ft-arc" cx="100" cy="100" r="${TIMER_RING_R}" style="stroke-dasharray:${TIMER_RING_C};stroke-dashoffset:${TIMER_RING_C * (1 - frac)}"/>
      </svg>
      <div class="ft-center">
        <div class="ft-time" role="timer">${fmtClock(remaining)}</div>
        <div class="ft-of">${paused ? 'Paused' : `of ${fmtClock(total)}`}</div>
      </div>
    </div>`;
}

function updateTimerRing(root, remaining, total) {
  const time = root && root.querySelector('.ft-time');
  const arc = root && root.querySelector('.ft-arc');
  if (!time || !arc) return false;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  time.textContent = fmtClock(remaining);
  arc.style.strokeDashoffset = String(TIMER_RING_C * (1 - frac));
  return true;
}

// Which full layout is showing; when it hasn't changed, a tick only needs
// updateTimerRing.
function focusTimerKey(focusState) {
  return `${focusState.phase}|${focusState.paused ? 1 : 0}|${focusState.round}`;
}

function focusTimerBodyHTML(focusState) {
  const isStudy = focusState.phase === 'study';
  const total = focusState.totalSec || (isStudy ? focusState.studyMin : focusState.nextBreakMin) * 60;
  // One dot per round: finished ones filled, the current one pulsing.
  const rounds = Math.max(focusState.round, focusState.completedStudyRounds);
  const dots = Array.from({ length: rounds }, (_, i) =>
    `<span class="ft-dot${i < focusState.completedStudyRounds ? ' done' : ''}${isStudy && i === focusState.round - 1 ? ' now' : ''}"></span>`).join('');
  return `
    <div class="ft" data-key="${focusTimerKey(focusState)}">
      <div class="focus-phase-label">${isStudy ? `Round ${focusState.round} · focus` : 'Break'}</div>
      <div class="focus-title ft-title">${escapeHtml(focusState.sessionTitle)}</div>
      ${timerRingHTML(focusState.remainingSec, total, isStudy ? 'focus' : 'break', focusState.paused)}
      <div class="ft-rounds" aria-label="${focusState.completedStudyRounds} rounds done">${dots}</div>
      ${!isStudy && focusState.breakActivity ? `<div class="focus-sub ft-note">You said you'd: "${escapeHtml(focusState.breakActivity)}"</div>` : ''}
      <div class="ft-controls">
        <button class="ft-btn ft-main" onclick="toggleFocusPause()" aria-label="${focusState.paused ? 'Resume' : 'Pause'}" title="${focusState.paused ? 'Resume' : 'Pause'}">${focusState.paused ? TIMER_ICONS.play : TIMER_ICONS.pause}</button>
        <button class="ft-btn" onclick="focusEndEarly()" aria-label="End session" title="End session">${TIMER_ICONS.stop}</button>
      </div>
      <div class="focus-sub ft-hint">Close this to keep the timer running while you use the app.</div>
    </div>
  `;
}

// The focus timer's setup screen: pick a study length and break length
// before starting. studyDurations/breakDurations are passed in rather
// than hardcoded, since they're the classic script's FOCUS_STUDY_DURATIONS/
// FOCUS_BREAK_DURATIONS constants.
function focusSetupHTML(focusState, studyDurations, breakDurations) {
  return `
    <div class="focus-title">Ready to study?</div>
    <div class="focus-sub">${escapeHtml(focusState.sessionTitle)}</div>
    <div class="focus-phase-label">Focus length</div>
    <div class="focus-duration-row">
      ${studyDurations.map(m => `<button class="focus-duration-btn${m === focusState.studyMin ? ' active' : ''}" onclick="focusPickDuration('study',${m})">${m} min</button>`).join('')}
    </div>
    <div class="focus-phase-label">Break length</div>
    <div class="focus-duration-row">
      ${breakDurations.map(m => `<button class="focus-duration-btn${m === focusState.breakMin ? ' active' : ''}" onclick="focusPickDuration('break',${m})">${m} min</button>`).join('')}
    </div>
    <button class="settings-btn" onclick="focusGoToCommit()">Continue</button>
  `;
}

// The "name your break activity" prompt shown between setup and starting
// the timer.
function focusCommitHTML(focusState) {
  return `
    <div class="focus-title">One more thing</div>
    <div class="focus-sub">What will you actually do on your ${focusState.breakMin}-minute break? Naming it now makes it easier to stick to it later.</div>
    <input class="settings-input" id="focus-break-activity" placeholder='e.g. "stretch, grab water"' style="text-align:center;" onkeydown="if(event.key==='Enter'){focusStartStudy();}" />
    <button class="settings-btn" onclick="focusStartStudy()">Start studying</button>
  `;
}

// Shown when a study round finishes: offers the break earned so far, or
// escalates it by studying another round. escalatedBreak grows by
// breakMin each time nextBreakMin carries over uncollected.
function focusStudyCompleteHTML(focusState) {
  const offeredBreak = focusState.nextBreakMin;
  const escalatedBreak = focusState.nextBreakMin + focusState.breakMin;
  return `
    <div class="focus-title">Nice work!</div>
    <div class="focus-sub">You focused for ${focusState.studyMin} minutes. Take your ${offeredBreak}-minute break now, or keep studying ${focusState.studyMin} more minutes and get a ${escalatedBreak}-minute break after.</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="focusTakeBreak()">Take ${offeredBreak} min break now</button>
      <button class="sync-btn" onclick="focusKeepStudying()">Keep studying - get ${escalatedBreak} min break after</button>
    </div>
  `;
}

// Shown when a break finishes: another round, or call it done. Static --
// doesn't depend on focusState.
function focusBreakCompleteHTML() {
  return `
    <div class="focus-title">Break's over</div>
    <div class="focus-sub">Ready for another round, or done for now?</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="focusAnotherRound()">Another round</button>
      <button class="sync-btn" onclick="focusFinish()">I'm done - mark as complete</button>
    </div>
  `;
}
