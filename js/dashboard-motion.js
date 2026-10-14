/* ===========================
   DASHBOARD MOTION
   - Home's lists move instead of jumping. Checking something off holds the
     card a beat (so the check and the strike-through are seen), then it
     slips away while the cards below slide up into its place. Work that a
     sync brings in fades up into the list, its "New" tag popping in.
   - Switching tabs cross-fades: the page being left fades out over the one
     arriving, instead of cutting.
   - A soft light follows the pointer across Home's boxes (mouse only).
   All of it is skipped under reduce-motion, and only runs while Home is
   actually on screen.
=========================== */

(function initDashboardMotion() {
  const ok = () => (typeof motionOK === 'function' ? motionOK() : !prefersReducedMotion());
  const HOLD = 220; // how long a checked-off card stays before leaving

  /* ---- Home lists: move, leave, arrive ---------------------------------- */
  const LISTS = ['home-upnext', 'home-thisweek'];
  const STATIC = '#page-home .home-col-main > :not(#home-upnext):not(#home-thisweek), #page-home .home-col-side';
  const onScreen = r => r.bottom > 0 && r.top < window.innerHeight;
  let primed = false; // the very first render keeps the normal page entrance

  function homeShowing() {
    const page = document.getElementById('page-home');
    return !!(page && page.classList.contains('active') && page.offsetParent !== null);
  }

  function snapshot() {
    const cards = new Map(); // done-key -> [{ el, rect, box }] (the same work can show twice)
    LISTS.forEach(id => {
      const box = document.getElementById(id);
      if (!box) return;
      box.querySelectorAll(':scope > .card[data-done-key]:not(.sf-ghost)').forEach(el => {
        const k = el.dataset.doneKey;
        if (!cards.has(k)) cards.set(k, []);
        cards.get(k).push({ el, rect: el.getBoundingClientRect(), box });
      });
    });
    const statics = [...document.querySelectorAll(STATIC)].map(el => ({ el, rect: el.getBoundingClientRect() }));
    return { cards, statics };
  }

  function slide(el, from, delay) {
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // sub-pixel settling, not a real move
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 1 }, { transform: 'none', opacity: 1 }],
      { duration: 440, delay, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' }
    );
  }

  function play(before) {
    const used = new Map();
    const moves = [], arrivals = [], removed = [];
    LISTS.forEach(id => {
      const box = document.getElementById(id);
      if (!box) return;
      box.querySelectorAll(':scope > .card[data-done-key]:not(.sf-ghost)').forEach(el => {
        const k = el.dataset.doneKey;
        const list = before.cards.get(k), n = used.get(k) || 0;
        if (list && list[n]) { used.set(k, n + 1); moves.push({ el, from: list[n].rect }); }
        else arrivals.push(el);
      });
    });
    before.cards.forEach((list, k) => list.slice(used.get(k) || 0).forEach(o => removed.push(o)));
    const hold = removed.length ? HOLD : 0;

    // Leaving: the old card is put back where it was (inside its own list, so
    // it keeps its look), holds, then slips out to the side.
    removed.forEach(o => {
      if (!onScreen(o.rect)) return;
      const el = o.el, br = o.box.getBoundingClientRect();
      el.classList.add('sf-ghost');
      el.classList.remove('sr', 'sr-in');
      // Every copy of a checked-off card gets the line drawn through it, not
      // only the one that was clicked (Up next and This week can both show it).
      if (el.classList.contains('done') && !prefersReducedMotion()) el.classList.add('done-flash');
      Object.assign(el.style, {
        position: 'absolute', boxSizing: 'border-box', margin: '0', zIndex: '2', pointerEvents: 'none', animation: 'none',
        left: (o.rect.left - br.left - o.box.clientLeft) + 'px', top: (o.rect.top - br.top - o.box.clientTop) + 'px',
        width: o.rect.width + 'px', height: o.rect.height + 'px',
      });
      o.box.appendChild(el);
      el.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(18px) scale(0.97)' }],
        { duration: 300, delay: hold, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
      );
      setTimeout(() => el.remove(), hold + 340);
    });

    // Staying: slide from where it was to where it is now.
    moves.forEach(({ el, from }) => slide(el, from, hold));
    before.statics.forEach(({ el, rect }) => { if (el.isConnected) slide(el, rect, hold); });

    // Arriving (a sync brought it in, or it moved up into view).
    if (!primed) return;
    const start = removed.length ? hold + 120 : 0;
    arrivals.filter(el => onScreen(el.getBoundingClientRect())).forEach((el, i) => {
      const delay = start + i * 60;
      el.animate(
        [{ opacity: 0, transform: 'translateY(10px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }
      );
      const tag = el.querySelector('.new-tag');
      if (tag) tag.animate(
        [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 420, delay: delay + 180, easing: 'ease-out', fill: 'backwards' }
      );
    });
  }

  const origHome = window.renderHome;
  if (typeof origHome === 'function') {
    window.renderHome = function () {
      if (!ok() || !homeShowing()) return origHome.apply(this, arguments);
      const before = snapshot();
      const r = origHome.apply(this, arguments);
      try { play(before); } catch (e) { /* motion is never worth breaking Home */ }
      primed = true;
      return r;
    };
  }

  /* ---- Tab switches cross-fade ------------------------------------------ */
  function endLeave(p) {
    clearTimeout(p._sfLeave);
    p.classList.remove('page-leaving');
    p.style.top = p.style.left = p.style.width = '';
  }
  const origShow = window.showPage;
  if (typeof origShow === 'function') {
    window.showPage = function () {
      document.querySelectorAll('.page.page-leaving').forEach(endLeave);
      const prev = document.querySelector('.page.active');
      const at = prev && prev.offsetParent !== null ? { top: prev.offsetTop, left: prev.offsetLeft, width: prev.offsetWidth } : null;
      const r = origShow.apply(this, arguments);
      if (!at || !ok() || prev.classList.contains('active')) return r;
      // The old page stays exactly where it was, out of the layout, and fades.
      prev.classList.add('page-leaving');
      Object.assign(prev.style, { top: at.top + 'px', left: at.left + 'px', width: at.width + 'px' });
      prev._sfLeave = setTimeout(() => endLeave(prev), 240);
      return r;
    };
  }

  /* ---- Pointer light on Home's boxes ------------------------------------ */
  const home = document.getElementById('page-home');
  if (home && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const LIT = '.home-tile, .home-week, #home-grades, #home-study, #home-upnext > .card, #home-thisweek > .card';
    let lit = null, raf = 0, last = null;
    const clear = () => { if (lit) lit.classList.remove('sf-lit'); lit = null; };
    home.addEventListener('pointermove', e => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = last.target.closest ? last.target.closest(LIT) : null;
        if (t !== lit) clear();
        if (!t || !ok() || t.classList.contains('overdue-card')) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', (last.clientX - r.left) + 'px');
        t.style.setProperty('--my', (last.clientY - r.top) + 'px');
        t.classList.add('sf-lit');
        lit = t;
      });
    });
    home.addEventListener('pointerleave', clear);
  }
})();
