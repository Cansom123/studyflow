/* ===========================
   STUDY EXTRAS
   - Last 7 days chart on the Study tab: minutes per day against your daily
     goal, with the change from the week before.
   - Calm background sound for focus and deep work timers. The sounds are
     generated in the browser with the Web Audio API (no audio files to load
     or ship, so it works offline and from file://), play only while a
     study timer is actually running, and fade out when you pause or finish.
=========================== */

/* ---- Weekly chart ---------------------------------------------------------- */
function studySecondsForDays(sessions, endDate, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(endDate); d.setDate(endDate.getDate() - i);
    const key = ymd(d);
    const sec = sessions.reduce((sum, s) => s.session_date === key ? sum + studySessionSec(s) : sum, 0);
    out.push({ key, date: d, sec, min: sec / 60 });
  }
  return out;
}

function renderStudyChart() {
  const host = document.getElementById('study-chart');
  if (!host) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const week = studySecondsForDays(cachedStudySessions || [], today, 7);
  const prevEnd = new Date(today); prevEnd.setDate(today.getDate() - 7);
  const prevTotal = studySecondsForDays(cachedStudySessions || [], prevEnd, 7).reduce((a, d) => a + d.sec, 0);
  const total = week.reduce((a, d) => a + d.sec, 0);
  const goal = userPrefs.studyGoalDailyMin ?? 60;
  const sig = JSON.stringify([week.map(d => d.sec), prevTotal, goal]);
  if (host.dataset.sig === sig) return; // unchanged: do not replay the bars rising
  host.dataset.sig = sig;

  const max = Math.max(goal, ...week.map(d => d.min), 30);
  const delta = total - prevTotal;
  const deltaHTML = prevTotal === 0 && total === 0 ? '<span class="sc-delta">No study logged yet this week</span>'
    : delta === 0 ? '<span class="sc-delta">Same as the week before</span>'
    : `<span class="sc-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${fmtDuration(Math.abs(delta))} vs the week before</span>`;
  host.innerHTML = `
    <div class="sc-head">
      <div class="sc-total"><b>${fmtDuration(total)}</b><span>last 7 days</span></div>
      ${deltaHTML}
    </div>
    <div class="sc-plot">
      ${goal > 0 ? `<div class="sc-goal" style="bottom:${(goal / max) * 100}%"><span>${goal}m goal</span></div>` : ''}
      <div class="sc-cols">
        ${week.map((d, i) => {
          const isToday = i === week.length - 1;
          const met = goal > 0 && d.sec >= goal * 60;
          const label = d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          return `<div class="sc-col${isToday ? ' today' : ''}${met ? ' met' : ''}" title="${label}: ${fmtDuration(d.sec)}">
            <div class="sc-val">${d.sec ? (d.sec < 60 ? d.sec + 's' : Math.round(d.min)) : ''}</div>
            <div class="sc-track"><div class="sc-bar" style="height:${d.sec ? Math.max(4, (d.min / max) * 100) : 0}%;--i:${i}"></div></div>
            <div class="sc-day">${isToday ? 'Today' : DOW_SHORT[d.date.getDay()]}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ---- Background sound ------------------------------------------------------ */
const FOCUS_SOUNDS = [
  { id: 'off', label: 'Off' },
  { id: 'rain', label: 'Rain' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'brown', label: 'Brown' },
  { id: 'white', label: 'White' },
];

const focusAudio = { ctx: null, master: null, node: null, nodeId: null, buffers: {}, fadeTimer: 0 };

function focusSoundId() {
  let id = 'off';
  try { id = localStorage.getItem('sf_focus_sound') || 'off'; } catch (e) {}
  return FOCUS_SOUNDS.some(s => s.id === id) ? id : 'off';
}
function focusSoundVolume() {
  let v = 40;
  try { v = parseInt(localStorage.getItem('sf_focus_sound_vol') || '40', 10); } catch (e) {}
  return Math.max(0, Math.min(100, isNaN(v) ? 40 : v));
}

function focusAudioCtx() {
  if (focusAudio.ctx) return focusAudio.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  focusAudio.ctx = new AC();
  focusAudio.master = focusAudio.ctx.createGain();
  focusAudio.master.gain.value = 0;
  focusAudio.master.connect(focusAudio.ctx.destination);
  return focusAudio.ctx;
}

function noiseBuffer(ctx, kind) {
  if (focusAudio.buffers[kind]) return focusAudio.buffers[kind];
  const len = ctx.sampleRate * 6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; }
  } else if (kind === 'pink') {
    // Paul Kellet's economy pink-noise filter.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (kind === 'patter' || kind === 'patter2' || kind === 'plinks') {
    // Individual raindrops: each is a tiny pitched "tick" with a fast decay.
    // patter / patter2 are dense fine drops (one per ear); plinks are the
    // rarer, bigger, lower drops that hit puddles and leaves.
    const big = kind === 'plinks';
    const perSec = big ? 7 : 70;
    const count = Math.round(perSec * 6);
    for (let n = 0; n < count; n++) {
      const start = Math.floor(Math.random() * (len - 2400));
      const freq = big ? 700 + Math.random() * 1600 : 2200 + Math.random() * 4800;
      const tau = (big ? 0.004 + Math.random() * 0.006 : 0.0007 + Math.random() * 0.0016) * ctx.sampleRate;
      const amp = Math.pow(Math.random(), big ? 1.2 : 2.2) * (big ? 0.9 : 1);
      const span = Math.min(Math.floor(tau * 6), len - start);
      for (let k = 0; k < span; k++) {
        const env = Math.exp(-k / tau);
        data[start + k] += amp * env * (0.7 * Math.sin(2 * Math.PI * freq * k / ctx.sampleRate) + 0.5 * (Math.random() * 2 - 1));
      }
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  focusAudio.buffers[kind] = buf;
  return buf;
}

function loopSource(ctx, kind) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  return src;
}

// Builds one sound's node graph into master and returns a stop function.
function buildFocusSound(ctx, id) {
  const sources = [];
  const nodes = [];
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(focusAudio.master);
  const lfo = (freq, depth, target) => {
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target); sources.push(o); nodes.push(g); // started with the rest below
  };
  if (id === 'rain') {
    // Body: a soft, low-passed wash like rain on a roof far away.
    const body = loopSource(ctx, 'pink');
    const bodyLp = ctx.createBiquadFilter(); bodyLp.type = 'lowpass'; bodyLp.frequency.value = 1400; bodyLp.Q.value = 0.4;
    const bodyGain = ctx.createGain(); bodyGain.gain.value = 0.55;
    body.connect(bodyLp); bodyLp.connect(bodyGain); bodyGain.connect(out);
    // Hiss: the airy sizzle of thousands of tiny drops, kept gentle.
    const hiss = loopSource(ctx, 'white');
    const hissHp = ctx.createBiquadFilter(); hissHp.type = 'highpass'; hissHp.frequency.value = 3500;
    const hissLp = ctx.createBiquadFilter(); hissLp.type = 'lowpass'; hissLp.frequency.value = 9000;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.16;
    hiss.connect(hissHp); hissHp.connect(hissLp); hissLp.connect(hissGain); hissGain.connect(out);
    // Drops: fine patter in each ear, plus the occasional big plink.
    const layers = [['patter', -0.6, 0.55], ['patter2', 0.6, 0.55], ['plinks', 0.15, 0.45]];
    layers.forEach(([kind, pan, level]) => {
      const src = loopSource(ctx, kind);
      src.playbackRate.value = 0.97 + Math.random() * 0.06;   // so the loops never line up
      const g = ctx.createGain(); g.gain.value = level;
      if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = pan; src.connect(g); g.connect(pn); pn.connect(out); nodes.push(pn); }
      else { src.connect(g); g.connect(out); }
      sources.push(src); nodes.push(g);
    });
    lfo(0.13, 0.12, bodyGain.gain);   // the rain swells and eases a little
    sources.push(body, hiss); nodes.push(bodyLp, bodyGain, hissHp, hissLp, hissGain);
  } else if (id === 'ocean') {
    const src = loopSource(ctx, 'brown');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const swell = ctx.createGain(); swell.gain.value = 0.55;
    src.connect(lp); lp.connect(swell); swell.connect(out);
    lfo(0.09, 0.4, swell.gain);   // a slow wave roughly every eleven seconds
    sources.push(src); nodes.push(lp, swell);
  } else if (id === 'brown') {
    const src = loopSource(ctx, 'brown');
    src.connect(out); sources.push(src);
  } else {
    const src = loopSource(ctx, 'white');
    // Softer white noise: rolled off earlier, a touch of the harsh top
    // trimmed, and quieter overall.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; lp.Q.value = 0.4;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 2500; shelf.gain.value = -6;
    const soft = ctx.createGain(); soft.gain.value = 0.55;
    src.connect(lp); lp.connect(shelf); shelf.connect(soft); soft.connect(out);
    sources.push(src); nodes.push(lp, shelf, soft);
  }
  sources.forEach(s => s.start());
  return () => {
    sources.forEach(s => { try { s.stop(); } catch (e) {} });
    [...sources, ...nodes, out].forEach(n => { try { n.disconnect(); } catch (e) {} });
  };
}

function fadeFocusMaster(target, seconds) {
  const ctx = focusAudio.ctx; if (!ctx || !focusAudio.master) return;
  const g = focusAudio.master.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(target, ctx.currentTime + seconds);
}

function stopFocusSound() {
  if (!focusAudio.ctx || !focusAudio.stop) return;
  fadeFocusMaster(0, 0.6);
  const stop = focusAudio.stop;
  focusAudio.stop = null; focusAudio.nodeId = null;
  clearTimeout(focusAudio.fadeTimer);
  focusAudio.fadeTimer = setTimeout(stop, 700);
}

function startFocusSound(id) {
  const ctx = focusAudioCtx();
  if (!ctx || id === 'off') return;
  if (ctx.state === 'suspended') ctx.resume();
  if (focusAudio.nodeId === id) { fadeFocusMaster(focusSoundVolume() / 100 * 0.5, 0.8); return; }
  if (focusAudio.stop) { const old = focusAudio.stop; focusAudio.stop = null; clearTimeout(focusAudio.fadeTimer); old(); }
  focusAudio.stop = buildFocusSound(ctx, id);
  focusAudio.nodeId = id;
  focusAudio.master.gain.setValueAtTime(0, ctx.currentTime);
  fadeFocusMaster(focusSoundVolume() / 100 * 0.5, 1.2);
}

// Sound should be playing exactly when a study timer is running unpaused:
// a focus round (not a break) or a deep work block.
function focusSoundWanted() {
  if (focusSoundId() === 'off') return false;
  if (typeof focusState !== 'undefined' && focusState && focusState.phase === 'study' && !focusState.paused && !focusState.awaiting) return true;
  if (typeof deepWorkState !== 'undefined' && deepWorkState && deepWorkState.phase === 'active' && !deepWorkState.paused && !deepWorkState.awaiting) return true;
  return false;
}

function syncFocusSound() {
  const wanted = focusSoundWanted();
  if (wanted) {
    if (!focusAudio.ctx || focusAudio.ctx.state !== 'running') { if (focusAudio.ctx) focusAudio.ctx.resume(); return; }
    if (focusAudio.nodeId !== focusSoundId()) startFocusSound(focusSoundId());
    else if (focusAudio.master.gain.value < 0.001) fadeFocusMaster(focusSoundVolume() / 100 * 0.5, 0.8);
  } else if (focusAudio.stop && Date.now() > (focusAudio.previewUntil || 0)) {
    stopFocusSound();
  }
}

// Browsers only let audio start from a click or key press, so the first
// click anywhere "unlocks" it (cheap and silent until a timer needs it).
function unlockFocusAudio() {
  if (focusSoundId() === 'off') return;
  const ctx = focusAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
document.addEventListener('click', unlockFocusAudio, true);
document.addEventListener('keydown', unlockFocusAudio, true);
setInterval(syncFocusSound, 500);

function setFocusSound(id) {
  if (!FOCUS_SOUNDS.some(s => s.id === id)) return;
  try { localStorage.setItem('sf_focus_sound', id); } catch (e) {}
  document.querySelectorAll('.ft-sound-btn').forEach(b => {
    const on = b.dataset.sound === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const vol = document.querySelector('.ft-sound-vol'); if (vol) vol.style.display = id === 'off' ? 'none' : '';
  if (id === 'off') { stopFocusSound(); return; }
  focusAudioCtx();               // created here, inside the click that chose it
  // Play it straight away so the choice is audible even on the setup screen;
  // the sync loop leaves a preview alone for a few seconds, then plays or
  // stops it according to whether a study timer is actually running.
  focusAudio.previewUntil = Date.now() + 3000;
  startFocusSound(id);
}

function setFocusSoundVolume(v) {
  try { localStorage.setItem('sf_focus_sound_vol', String(v)); } catch (e) {}
  if (focusAudio.stop) fadeFocusMaster(v / 100 * 0.5, 0.15);
}

const SOUND_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8v4h3l4 3.5v-11L6.5 8z"/><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.5 6.5 0 0 1 0 9"/></svg>';

function focusSoundPickerHTML() {
  const cur = focusSoundId();
  return `<div class="ft-sound" role="group" aria-label="Background sound">
    <span class="ft-sound-icon">${SOUND_ICON}</span>
    ${FOCUS_SOUNDS.map(s => `<button type="button" class="ft-sound-btn${s.id === cur ? ' active' : ''}" data-sound="${s.id}" aria-pressed="${s.id === cur}" onclick="setFocusSound('${s.id}')">${s.label}</button>`).join('')}
    <input type="range" class="ft-sound-vol" min="5" max="100" value="${focusSoundVolume()}" aria-label="Sound volume" style="${cur === 'off' ? 'display:none' : ''}" oninput="setFocusSoundVolume(this.value)">
  </div>`;
}
