/* ===========================
   HOW IT WORKS (below the sign-in screen)
   - The heading, cards and button fade up as they scroll into view, each a
     beat after the one before.
   - The four drawings then play in order (Connect, Sync, Rank, Focus), so
     the section reads as one story, and after that each loops on its own.
   - Drawings pause whenever the section is off screen, so they cost nothing
     while the student is just signing in.
   - Cards light up under the pointer.
   - With "reduce motion" on, everything shows in its finished state.
=========================== */

(function initHowItWorks() {
  const section = document.getElementById('how-it-works');
  if (!section) return;
  const scroller = () => document.querySelector('.app');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = [...section.querySelectorAll('[data-how-reveal]')];
  const cards = [...section.querySelectorAll('.how-card')];

  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
    section.classList.add('how-static', 'how-on');
    return;
  }

  // Fade-ups, staggered by order of arrival.
  let queued = 0;
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      revealObs.unobserve(el);
      setTimeout(() => el.classList.add('in'), 90 * queued++);
      setTimeout(() => { queued = Math.max(0, queued - 1); }, 400);
    });
  }, { root: null, threshold: 0.15 });
  revealEls.forEach(el => revealObs.observe(el));

  // Drawings: the first time the cards are on screen they start one after
  // another; any time the section leaves the screen they pause.
  let sequenced = false;
  const playObs = new IntersectionObserver(entries => {
    const visible = entries.some(e => e.isIntersecting);
    section.classList.toggle('how-on', visible);
    if (visible && !sequenced) {
      sequenced = true;
      cards.forEach((card, i) => setTimeout(() => card.classList.add('play'), 450 + i * 650));
    }
  }, { threshold: 0.2 });
  playObs.observe(section.querySelector('.how-grid'));

  // Soft light that follows the pointer across a card.
  section.addEventListener('pointermove', e => {
    const card = e.target.closest && e.target.closest('.how-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });

  // The "See how it works" arrow hides once the section is reached.
  const hint = document.getElementById('how-scroll-hint');
  const sc = scroller();
  if (hint && sc) {
    sc.addEventListener('scroll', () => hint.classList.toggle('gone', sc.scrollTop > 60), { passive: true });
  }
})();

function scrollToHowItWorks() {
  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
