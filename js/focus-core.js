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
