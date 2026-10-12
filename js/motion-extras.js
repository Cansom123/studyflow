/* ===========================
   MOTION EXTRAS
   - Assignment detail grows out of the card that was tapped (and shrinks
     back into it on close), instead of popping up from nowhere.
   - The sidebar's active-tab highlight glides to the new tab instead of
     jumping, settling with a little spring.
   Both use transforms/clip-path only, and step aside for reduce-motion.
=========================== */

const motionOK = () => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  && typeof Element.prototype.animate === 'function';

/* ---- Card -> detail ------------------------------------------------------ */
// The card most recently pressed, so the detail knows where to grow from.
let detailSource = null;
document.addEventListener('pointerdown', e => {
  const card = e.target.closest && e.target.closest('.card, .priority-card, .su-item, .closed-item, .ws-list-item');
  if (card) detailSource = { el: card, at: Date.now() };
}, true);

function rectInset(r, box) {
  // clip-path inset() values that cut the overlay down to rect r
  const t = Math.max(0, r.top - box.top), l = Math.max(0, r.left - box.left);
  const b = Math.max(0, box.bottom - r.bottom), rt = Math.max(0, box.right - r.right);
  return `inset(${t}px ${rt}px ${b}px ${l}px round 14px)`;
}

(function hookDetailMorph() {
  const origOpen = window.openAssignmentDetail;
  const origClose = window.closeAssignmentDetail;
  if (typeof origOpen !== 'function' || typeof origClose !== 'function') return;
  let openedFrom = null;

  window.openAssignmentDetail = function () {
    const r = origOpen.apply(this, arguments);
    const overlay = document.getElementById('assignment-detail-overlay');
    const src = detailSource && Date.now() - detailSource.at < 800 ? detailSource.el : null;
    detailSource = null;
    openedFrom = src;
    if (!overlay || !src || !motionOK() || overlay.style.display === 'none') return r;
    const from = src.getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    if (!from.width || !box.width) return r;
    const inner = overlay.querySelector('.detail-inner');
    overlay.classList.add('grow');
    overlay.animate(
      [{ clipPath: rectInset(from, box), opacity: 0.6 }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }],
      { duration: 460, easing: 'cubic-bezier(.2,.85,.25,1)' }
    ).finished.then(() => overlay.classList.remove('grow')).catch(() => overlay.classList.remove('grow'));
    setTimeout(() => overlay.classList.remove('grow'), 520);
    if (inner) inner.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }
    );
    return r;
  };

  window.closeAssignmentDetail = function () {
    const overlay = document.getElementById('assignment-detail-overlay');
    const src = openedFrom;
    openedFrom = null;
    const visible = overlay && overlay.style.display !== 'none';
    const to = src && src.isConnected ? src.getBoundingClientRect() : null;
    if (!visible || !to || !to.width || !motionOK()) return origClose.apply(this, arguments);
    const box = overlay.getBoundingClientRect();
    overlay.classList.add('grow');
    const anim = overlay.animate(
      [{ clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }, { clipPath: rectInset(to, box), opacity: 0.4 }],
      { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)' }
    );
    let closed = false;
    const done = () => { if (closed) return; closed = true; overlay.style.display = 'none'; overlay.classList.remove('grow'); anim.cancel(); };
    anim.finished.then(done).catch(done);
    setTimeout(done, 380); // never left half-closed if animation frames are paused
    // A soft settle on the card it went back into.
    src.animate([{ transform: 'scale(1.015)' }, { transform: 'none' }], { duration: 380, delay: 220, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  };
})();

/* ---- Gliding sidebar highlight -------------------------------------------- */
(function initTabGlider() {
  const tabs = document.querySelector('.tabs');
  if (!tabs) return;
  const glider = document.createElement('div');
  glider.className = 'tab-glider';
  glider.setAttribute('aria-hidden', 'true');
  tabs.prepend(glider);
  tabs.classList.add('has-glider');
  let placed = false;

  function place(animate) {
    const active = tabs.querySelector('.tab.active');
    if (!active || getComputedStyle(tabs).display === 'none' || active.offsetParent === null) { glider.style.opacity = '0'; return; }
    const y = active.offsetTop, x = active.offsetLeft;
    glider.style.opacity = '1';
    glider.style.width = active.offsetWidth + 'px';
    glider.style.height = active.offsetHeight + 'px';
    glider.style.transition = animate && placed && motionOK() ? '' : 'none';
    glider.style.transform = `translate(${x}px, ${y}px)`;
    if (!animate || !placed) { void glider.offsetWidth; glider.style.transition = ''; }
    placed = true;
  }
  window.placeTabGlider = place;

  const origShow = window.showPage;
  if (typeof origShow === 'function') {
    window.showPage = function () {
      const r = origShow.apply(this, arguments);
      setTimeout(() => place(true), 0);
      return r;
    };
  }
  const origToggle = window.toggleSidebarCollapse;
  if (typeof origToggle === 'function') {
    window.toggleSidebarCollapse = function () {
      const r = origToggle.apply(this, arguments);
      setTimeout(() => place(false), 240); // after the width transition
      return r;
    };
  }
  // After sign-in the app appears without a tab switch (Home is already the
  // active tab), so place the highlight once the app is showing too.
  const origApp = window.showApp;
  if (typeof origApp === 'function') {
    window.showApp = async function () {
      const r = await origApp.apply(this, arguments);
      place(false);
      return r;
    };
  }
  window.addEventListener('resize', () => place(false));
  setTimeout(() => place(false), 0);
  setTimeout(() => place(false), 600);
})();
