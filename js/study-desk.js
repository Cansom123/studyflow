/* ===========================
   STUDY DESK (the Study page's new layout)
   - The focus timer card: pick a length (the timer's own options), the big
     clock shows it, and Start opens the focus timer already set to it
     (quickStartFocus). The choice is remembered on this device.
   - A 7-day chain under today's goals: a ✕ for every day that counted
     toward the chain, today ringed.
   - "Deep work block" jumps to the deep work card and its name box.
   - The deep work mark on the month calendar (highlighter or bold ✕) is a
     display setting: setDeepWorkMark, applied as data-dwmark on <html>.
=========================== */

let studyDeskMin = (() => {
  let v = 0;
  try { v = parseInt(localStorage.getItem('sf_focus_len'), 10); } catch (e) {}
  return FOCUS_STUDY_DURATIONS.includes(v) ? v : 20;
})();

function setStudyDeskMin(min) {
  if (!FOCUS_STUDY_DURATIONS.includes(min)) return;
  studyDeskMin = min;
  try { localStorage.setItem('sf_focus_len', String(min)); } catch (e) {}
  renderStudyDesk();
}

function renderStudyDesk() {
  const clock = document.getElementById('sd-clock');
  if (clock) clock.textContent = `${studyDeskMin}:00`;
  const lens = document.getElementById('sd-lens');
  if (lens) lens.innerHTML = FOCUS_STUDY_DURATIONS.map(m =>
    `<button type="button" role="radio" aria-checked="${m === studyDeskMin}" class="${m === studyDeskMin ? 'on' : ''}" onclick="setStudyDeskMin(${m})">${m} min</button>`).join('');

  const chain = document.getElementById('sd-chain7');
  if (chain) {
    const byDate = studyChainDayTotals();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const e = byDate[ymd(d)];
      const total = e ? e.studyMin + e.deepMin : 0;
      const counted = total >= STUDY_CHAIN_THRESHOLD_MIN;
      const label = i === 0 ? 'TODAY' : DOW_SHORT[d.getDay()].toUpperCase();
      cells.push(`<span class="${counted ? 'x' : ''}${i === 0 ? ' t' : ''}" title="${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ${total ? fmtDuration(Math.round(total * 60)) : 'nothing logged'}"><i>${counted ? '✕' : ''}</i>${label}</span>`);
    }
    chain.innerHTML = cells.join('');
  }
}

function studyGoDeepWork() {
  const card = document.getElementById('sd-deep');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => document.getElementById('quick-deepwork-title')?.focus({ preventScroll: true }), 250);
}

/* ---- Deep work mark (a display setting, synced like the theme) ---------- */
const DEEP_WORK_MARKS = ['highlight', 'bold'];

function applyDeepWorkMark(mark) {
  const m = DEEP_WORK_MARKS.includes(mark) ? mark : 'highlight';
  document.documentElement.setAttribute('data-dwmark', m);
  document.querySelectorAll('#tweak-dwmark .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.dwmark === m));
}

function setDeepWorkMark(mark) {
  if (!DEEP_WORK_MARKS.includes(mark)) return;
  saveTweak('dwMark', mark);
  applyDeepWorkMark(mark);
}

(function initStudyDesk() {
  let saved = null;
  try { saved = localStorage.getItem('sf_tweak_dwMark'); } catch (e) {}
  applyDeepWorkMark(saved);
  renderStudyDesk();
  const orig = window.renderStudyTab;
  if (typeof orig === 'function') {
    window.renderStudyTab = function () {
      const r = orig.apply(this, arguments);
      try { renderStudyDesk(); } catch (e) { console.warn('[study desk]', e); }
      return r;
    };
  }
})();
