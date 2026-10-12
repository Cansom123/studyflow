/* ===========================
   HOW IT WORKS: a pinned scroll story (below the sign-in screen)
   The section is tall and its stage sticks to the screen while the student
   scrolls through it. Scroll position (not a timer) drives one continuous
   scene, so it moves forward and backward with them:
     0. Every class, scattered: assignment cards strewn about, like tabs.
     1. Pulled into one list: they fly into a tidy list, by due date.
     2. Ranked, with reasons: the list re-sorts by priority and opens up
        under #1 to show why it's first.
     3. Then you focus: #1 becomes a running timer; the study chain grows.
   The scene follows the scroll through a spring (it catches up with a
   little weight instead of jumping), and only animates while on screen.
   Reduce motion: no pinning; the ranked list is shown as a still.
=========================== */

const STORY_CARDS = [
  // listed in due-date order (phase 1); rank is the Priority order (phase 2)
  { t: 'Problem Set 6',      c: 'AP Calculus', due: 'Mon', rank: 2, tone: 'b' },
  { t: 'Enzyme Lab Report',  c: 'AP Biology',  due: 'Tue', rank: 3, tone: 'g' },
  { t: 'Reading: Chapter 7', c: 'US History',  due: 'Wed', rank: 4, tone: 'o' },
  { t: 'Essay Draft',        c: 'English 101', due: 'Thu', rank: 1, tone: 'p' },
  { t: 'Quiz 3 Review',      c: 'Spanish II',  due: 'Fri', rank: 5, tone: 'r' },
  { t: 'Discussion Post',    c: 'Psychology',  due: 'Sun', rank: 6, tone: 'y' },
];
// Where each card lies in the "scattered" phase: [x, y] as fractions of the
// scene, and a tilt in degrees.
const STORY_SCATTER = [[0.04, 0.30, 7], [0.50, 0.56, -4], [0.10, 0.74, 11], [0.56, 0.14, -9], [0.60, 0.82, 6], [0.30, 0.04, -13]];
const STORY_PHASE_AT = [0.06, 0.36, 0.62, 0.92]; // scroll progress shown for each step's dot

(function initStory() {
  const section = document.getElementById('how-it-works');
  const scene = document.getElementById('story-scene');
  if (!section || !scene) return;
  const scroller = () => document.querySelector('.app');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cards = STORY_CARDS.map((d, i) => {
    const el = document.createElement('div');
    el.className = `sc-card tone-${d.tone}`;
    el.innerHTML = `<span class="scx-rank">${d.rank}</span><span class="scx-dot"></span>
      <span class="scx-body"><b>${d.t}</b><span>${d.c}</span></span><span class="scx-due">${d.due}</span>`;
    scene.appendChild(el);
    return { el, d, i };
  });
  const head = scene.querySelector('.sc-list-head');
  const countEl = scene.querySelector('.sc-count-n');
  const why = scene.querySelector('.sc-why');
  const timer = scene.querySelector('.sc-timer');
  const ring = scene.querySelector('.sct-ring');
  const timeEl = scene.querySelector('.sct-time');
  const chain = scene.querySelector('.sc-chain');
  const chainDays = [...scene.querySelectorAll('.scc-days i')];
  const chainN = scene.querySelector('.scc-n');
  const ghost = scene.querySelector('.sc-canvas-ghost');
  const steps = [...section.querySelectorAll('.story-step')];

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));
  const lerp = (a, b, t) => a + (b - a) * t;

  let W = 0, H = 0;
  const measure = () => { const r = scene.getBoundingClientRect(); W = r.width; H = r.height; };

  function render(p) {
    const cw = Math.min(380, W * 0.9), ch = 58, pitch = Math.min(66, (H * 0.72) / 6);
    const listX = (W - cw) / 2, listTop = Math.max(46, H * 0.12);
    const whyH = Math.min(118, H * 0.17);
    const t1 = seg(p, 0.13, 0.32), t2 = seg(p, 0.42, 0.58), t3 = seg(p, 0.68, 0.80), tRun = seg(p, 0.80, 0.99);

    cards.forEach(({ el, d, i }) => {
      // stagger the fly-in so the cards land one after another
      const ti = ease(clamp((clamp((p - 0.13) / 0.19) * 1.35) - i * 0.07));
      const [fx, fy, rot] = STORY_SCATTER[i];
      // phase 0 -> 1
      let x = lerp(fx * (W - cw * 0.8), listX, ti);
      let y = lerp(fy * (H - ch), listTop + i * pitch, ti);
      let r = lerp(rot, 0, ti), s = lerp(0.8, 1, ti), o = lerp(0.85, 1, ti);
      // phase 1 -> 2: re-sort by rank, opening a gap under #1 for its reasons
      const yRank = listTop + (d.rank - 1) * pitch + (d.rank > 1 ? whyH * t2 : 0);
      y = lerp(y, yRank, t2);
      if (d.rank === 1) s = lerp(s, 1.03, t2);
      // phase 2 -> 3: #1 rises into the timer; the rest step back
      if (d.rank === 1) {
        y = lerp(y, H * 0.5 - ch / 2, t3); s = lerp(s, 0.9, t3); o = lerp(o, 0, clamp(t3 * 1.6));
      } else {
        y = lerp(y, y + H * 0.42, t3); s = lerp(s, 0.94, t3); o = lerp(o, 0, clamp(t3 * 1.3));
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      el.style.width = cw + 'px';
      el.style.opacity = o.toFixed(3);
      el.style.setProperty('--due', clamp(ti * 1.4 - 0.4).toFixed(3));
      el.style.setProperty('--rank', t2.toFixed(3));
      el.classList.toggle('top', d.rank === 1 && t2 > 0.5 && t3 < 0.5);
    });

    ghost.style.opacity = (1 - clamp(t1 * 1.8)).toFixed(3);
    head.style.cssText = `width:${cw}px; left:${listX}px; top:${listTop - 34}px; opacity:${(clamp(t1 * 2 - 0.8) * (1 - t3)).toFixed(3)}`;
    countEl.textContent = Math.round(6 * clamp((p - 0.13) / 0.19));
    why.style.cssText = `width:${cw - 28}px; left:${listX + 14}px; top:${listTop + pitch - 4}px; height:${whyH}px; opacity:${(t2 * (1 - clamp(t3 * 2))).toFixed(3)}; transform: translateY(${((1 - t2) * -10).toFixed(1)}px)`;
    timer.style.opacity = clamp(t3 * 1.6 - 0.4).toFixed(3);
    timer.style.transform = `translate(-50%, -50%) scale(${lerp(0.86, 1, t3).toFixed(3)})`;
    ring.style.strokeDashoffset = (100 - tRun * 100).toFixed(2);
    const secs = Math.round(25 * 60 * (1 - tRun * 0.32));
    timeEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    chain.style.opacity = clamp(t3 * 2 - 1).toFixed(3);
    const lit = 4 + (tRun > 0.85 ? 1 : 0);
    chainDays.forEach((dEl, k) => dEl.classList.toggle('on', k < lit));
    chainN.textContent = `${lit} days`;

    const phase = p < 0.22 ? 0 : p < 0.48 ? 1 : p < 0.74 ? 2 : 3;
    steps.forEach((s2, k) => { s2.classList.toggle('active', k === phase); s2.classList.toggle('past', k < phase); });
    if (section.dataset.phase !== String(phase)) section.dataset.phase = phase;
  }

  let target = 0, cur = 0, vel = 0, running = false, visible = false;
  measure();
  // The scene changes size with the window and, on phones, when the last
  // step shows its buttons: re-measure whenever it does.
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); render(cur); }).observe(scene);
  else window.addEventListener('resize', () => { measure(); render(cur); });

  if (reduce) {
    section.classList.add('story-static');
    requestAnimationFrame(() => { measure(); render(0.62); });
    steps.forEach(s2 => s2.classList.add('active'));
    return;
  }

  // Scroll -> target progress; a spring carries the drawn progress to it.
  function progress() {
    const sc = scroller(); if (!sc) return 0;
    const r = section.getBoundingClientRect(), top = sc.getBoundingClientRect().top;
    const span = r.height - sc.clientHeight;
    return span > 0 ? clamp((top - r.top) / span) : 0;
  }
  function tick() {
    vel = vel * 0.74 + (target - cur) * 0.085;
    cur += vel;
    if (Math.abs(target - cur) < 0.0004 && Math.abs(vel) < 0.0004) { cur = target; running = false; }
    render(cur);
    if (running) requestAnimationFrame(tick);
  }
  function kick() {
    target = progress();
    if (!running && visible) { running = true; requestAnimationFrame(tick); }
  }
  const sc = scroller();
  if (sc) sc.addEventListener('scroll', kick, { passive: true });
  new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) { measure(); kick(); } }, { threshold: 0 }).observe(section);
  render(0);

  window.storyGoTo = function (k) {
    const s3 = scroller(); if (!s3) return;
    const r = section.getBoundingClientRect(), top = s3.getBoundingClientRect().top;
    const sectionTop = r.top - top + s3.scrollTop, span = r.height - s3.clientHeight;
    s3.scrollTo({ top: sectionTop + STORY_PHASE_AT[k] * span, behavior: 'smooth' });
  };

  // The "See how it works" arrow hides once the student starts scrolling.
  const hint = document.getElementById('how-scroll-hint');
  if (hint && sc) sc.addEventListener('scroll', () => hint.classList.toggle('gone', sc.scrollTop > 60), { passive: true });
})();

if (typeof window.storyGoTo !== 'function') {
  window.storyGoTo = function () { document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); };
}

function scrollToHowItWorks() {
  if (typeof window.storyGoTo === 'function') window.storyGoTo(0);
}

function howBackToSignIn() {
  const sc = document.querySelector('.app');
  if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof showLogin === 'function') showLogin();
  setTimeout(() => document.getElementById('login-email')?.focus({ preventScroll: true }), 500);
}

function howStartSignup() {
  const sc = document.querySelector('.app');
  if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
  if (typeof showSignup === 'function') showSignup();
  setTimeout(() => document.getElementById('signup-email')?.focus({ preventScroll: true }), 500);
}
