/* ===========================
   MOTION UTILITIES
   Small, dependency-free helpers for the app-wide motion system (see the
   "MOTION SYSTEM" block at the end of styles.css). Everything here is a
   no-op when the user prefers reduced motion: numbers just show their final
   value instead of counting up.
=========================== */

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Runs fn once the element actually has a box on screen. A number rendered
// into a tab the student isn't looking at (display:none) would otherwise
// finish counting before they ever see it.
function whenVisible(el, fn) {
  if (el.offsetParent !== null || !('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
  });
  io.observe(el);
}

// Counts an element's text up (or down) to `to` with a fast ease-out, so a
// number landing on screen has momentum instead of just appearing.
// opts: from (default 0), decimals (default 0), suffix (e.g. '%'), duration ms.
function animateCount(el, to, opts = {}) {
  const { decimals = 0, suffix = '', duration = 800 } = opts;
  const fmt = v => v.toFixed(decimals) + suffix;
  if (el._countRaf) cancelAnimationFrame(el._countRaf);
  el._countRaf = 0;
  if (prefersReducedMotion() || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  const from = Number.isFinite(opts.from) ? opts.from : 0;
  if (from === to) { el.textContent = fmt(to); return; }
  el.textContent = fmt(from);
  whenVisible(el, () => {
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(from + (to - from) * eased);
      el._countRaf = p < 1 ? requestAnimationFrame(tick) : 0;
    };
    el._countRaf = requestAnimationFrame(tick);
  });
}

// Any element rendered with data-count-to="92.4" (plus optional
// data-count-decimals / data-count-suffix) counts up the first time it's
// inserted -- so list renderers that build HTML strings can opt a number in
// with an attribute alone, no call-site wiring.
function runCountUps(root) {
  const nodes = [];
  if (root.matches && root.matches('[data-count-to]')) nodes.push(root);
  if (root.querySelectorAll) nodes.push(...root.querySelectorAll('[data-count-to]'));
  nodes.forEach(el => {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    animateCount(el, parseFloat(el.dataset.countTo), {
      decimals: parseInt(el.dataset.countDecimals || '0', 10),
      suffix: el.dataset.countSuffix || '',
    });
  });
}

/* ---- Scroll reveal --------------------------------------------------------
   Cards start hidden (lowered, slightly shrunk, blurred) and rise into place
   the moment they scroll into view, in a short stagger when several arrive
   together. CSS for the states lives in the MOTION SYSTEM block of
   styles.css (.sr hidden / .sr-in revealing / .sr-seen already on screen).

   A list that is simply being re-rendered in place (a sync finishing, an
   assignment getting checked off) must not replay the whole cascade -- that
   would make the page flicker on every interaction. innerHTML replacement
   shows up in a mutation record as removed-and-added together, so we can tell
   "same list, fresh markup" (reveal instantly) from "new content arriving"
   (animate) without any timing guesswork. */
const SR_SELECTOR = '.card, .home-stats-strip, .home-qlink, .empty-box';
const SR_EXCLUDE = '.detail-overlay, [id$="overlay"], .onboard-flow, #home-upnext';

function scrollRevealEnabled() {
  return 'IntersectionObserver' in window && !prefersReducedMotion()
    && !document.documentElement.classList.contains('no-scroll-reveal');
}

const srObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
  const arriving = entries.filter(e => e.isIntersecting).sort((a, b) =>
    a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
  arriving.forEach((entry, i) => {
    const el = entry.target;
    srObserver.unobserve(el);
    el.style.setProperty('--sr-delay', Math.min(i * 90, 540) + 'ms');
    el.classList.add('sr-in');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }) : null;

function isOnScreenNow(el) {
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight * 0.94;
}

function registerReveal(el, opts = {}) {
  if (!srObserver || !scrollRevealEnabled()) return;
  if (!opts.force && (el.classList.contains('sr') || el.classList.contains('sr-seen'))) return;
  if (el.closest(SR_EXCLUDE)) return;
  if (el.parentElement && el.parentElement.closest('.card')) return; // nested card: the outer one animates
  // A list re-rendered in place: whatever is already on screen is never
  // hidden at all (hiding it even for a frame reads as a flicker); only
  // cards that still have to be scrolled to get the reveal. `sr-seen` just
  // remembers it was handled so the next re-render is recognised too.
  if (opts.instant && isOnScreenNow(el)) { el.classList.add('sr-seen'); return; }
  el.classList.remove('sr-in', 'sr-seen');
  el.classList.add('sr');
  srObserver.observe(el);
}

function registerRevealsIn(root, opts) {
  if (root.matches && root.matches(SR_SELECTOR)) registerReveal(root, opts);
  if (root.querySelectorAll) root.querySelectorAll(SR_SELECTOR).forEach(el => registerReveal(el, opts));
}

// Re-runs the reveal for everything on the page currently showing -- used
// when the setting is switched back on, so the effect is visible right away.
function replayScrollReveal() {
  const page = document.querySelector('.page.active') || document;
  page.querySelectorAll(SR_SELECTOR).forEach(el => registerReveal(el, { force: true }));
}

if (typeof MutationObserver !== 'undefined' && document.body) {
  new MutationObserver(mutations => {
    mutations.forEach(m => {
      const replaced = Array.from(m.removedNodes).some(n =>
        n.nodeType === 1 && ((n.matches && n.matches('.sr, .sr-seen')) || (n.querySelector && n.querySelector('.sr, .sr-seen'))));
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        runCountUps(n);
        registerRevealsIn(n, { instant: replaced });
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}
registerRevealsIn(document.body);
