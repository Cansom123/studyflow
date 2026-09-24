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
