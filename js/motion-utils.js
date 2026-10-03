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

if (typeof MutationObserver !== 'undefined' && document.body) {
  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) runCountUps(n); }));
  }).observe(document.body, { childList: true, subtree: true });
}
