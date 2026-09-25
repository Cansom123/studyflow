import { fmtClock } from './format-utils.js';
import { escapeHtml } from './format-utils.js';

// Focus timer view-model builders: derive what the doc title / mini-bar /
// full timer body should show from focusState, without touching the DOM.
// focusState is passed in explicitly (it's already just one object the
// classic script reads) rather than closed over as a global, so these are
// testable without a document.

export function computeFocusDocTitle(focusState, focusOriginalTitle) {
  if (focusState.awaiting) return focusOriginalTitle || 'StudyFlow';
  const label = focusState.phase === 'study' ? 'Studying' : 'Break';
  return focusState.paused
    ? `⏸ ${fmtClock(focusState.remainingSec)} - StudyFlow`
    : `${fmtClock(focusState.remainingSec)} · ${label} - StudyFlow`;
}

export function computeFocusMiniBarView(focusState) {
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

export function focusTimerBodyHTML(focusState) {
  const isStudy = focusState.phase === 'study';
  return `
    <div class="focus-phase-label">${isStudy ? `Round ${focusState.round} - focus` : 'Break'}${focusState.paused ? ' · paused' : ''}</div>
    <div class="focus-title" style="margin-bottom:0;">${escapeHtml(focusState.sessionTitle)}</div>
    <div class="focus-timer-display">${fmtClock(focusState.remainingSec)}</div>
    ${!isStudy && focusState.breakActivity ? `<div class="focus-sub">You said you'd: "${escapeHtml(focusState.breakActivity)}"</div>` : ''}
    <div class="focus-sub" style="margin-bottom:14px;">Close this to keep the timer running while you use the app.</div>
    <div class="focus-btn-row">
      <button class="sync-btn" style="width:auto;margin-bottom:0;" onclick="toggleFocusPause()">${focusState.paused ? 'Resume' : 'Pause'}</button>
      <button class="sync-btn" style="width:auto;margin-bottom:0;" onclick="focusEndEarly()">End session</button>
    </div>
  `;
}

// The focus timer's setup screen: pick a study length and break length
// before starting. studyDurations/breakDurations are passed in rather
// than hardcoded, since they're the classic script's FOCUS_STUDY_DURATIONS/
// FOCUS_BREAK_DURATIONS constants.
export function focusSetupHTML(focusState, studyDurations, breakDurations) {
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
export function focusCommitHTML(focusState) {
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
export function focusStudyCompleteHTML(focusState) {
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
export function focusBreakCompleteHTML() {
  return `
    <div class="focus-title">Break's over</div>
    <div class="focus-sub">Ready for another round, or done for now?</div>
    <div class="focus-btn-row stack">
      <button class="settings-btn" onclick="focusAnotherRound()">Another round</button>
      <button class="sync-btn" onclick="focusFinish()">I'm done - mark as complete</button>
    </div>
  `;
}
