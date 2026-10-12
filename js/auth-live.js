/* ===========================
   SIGN-IN SCREEN, ALIVE
   - The headline's last words cycle (under control / organized / on track).
   - The preview cards act out the app on a loop instead of animating once:
     an assignment gets checked off and struck through, a grade bar fills to
     a new class's grade, and the top-priority task changes.
   - A soft light follows the pointer across the brand panel.
   Everything waits for the opening animation to finish, pauses while the
   tab is hidden or the sign-in page isn't showing, and stays still under
   reduce-motion.
=========================== */

(function initAuthLive() {
  const page = document.getElementById('auth-page');
  if (!page) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof Element.prototype.animate !== 'function') return;
  const showing = () => page.style.display !== 'none' && !document.hidden;

  // Swap an element's content with a short slide/blur, so changes read as motion.
  function swap(el, html, dir = 1) {
    if (!el) return;
    const out = el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateY(${-8 * dir}px)`, filter: 'blur(3px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    // On a timer rather than the animation's finish event, so the new text
    // always lands even if the browser isn't drawing frames at that moment.
    setTimeout(() => {
      el.innerHTML = html;
      out.cancel();
      el.animate([{ opacity: 0, transform: `translateY(${10 * dir}px)`, filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
    }, 230);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- Headline: the last words cycle ---- */
  const PHRASES = ['under control.', 'organized.', 'on track.'];
  setTimeout(function startTagline() {
    const tag = document.querySelector('.auth-brand-tagline');
    if (!tag) return;
    const words = [...tag.querySelectorAll('.tw')];
    if (words.length < 5) return;
    const rot = document.createElement('span');
    rot.className = 'tw-rot';
    rot.setAttribute('aria-hidden', 'true');
    rot.textContent = PHRASES[0];
    words[3].before(rot);
    words.slice(3).forEach(w => w.remove());
    let i = 0;
    setInterval(() => {
      if (!showing()) return;
      i = (i + 1) % PHRASES.length;
      swap(rot, esc(PHRASES[i]));
    }, 3400);
  }, 2600);

  /* ---- Preview cards act out the app ---- */
  const preview = document.querySelector('.auth-preview');
  const c1 = preview && preview.querySelector('.ap-card.c1');
  const c2 = preview && preview.querySelector('.ap-card.c2');
  const c3 = preview && preview.querySelector('.ap-card.c3');
  const TASKS = [
    { t: 'Cell Respiration Lab', s: 'Biology · due tomorrow', b: 'Lab' },
    { t: 'Chapter 6 Reading', s: 'US History · due Wed', b: 'Reading' },
    { t: 'Problem Set 7', s: 'AP Calculus · due Fri', b: 'Homework' },
  ];
  const GRADES = [{ c: 'AP Calculus', g: 'A', w: 94 }, { c: 'Biology', g: 'B+', w: 88 }, { c: 'English 101', g: 'A-', w: 91 }];
  const TOPS = [{ t: 'Start the essay draft', s: 'Top priority today' }, { t: 'Finish Problem Set 7', s: 'Due Friday · 20 pts' }, { t: 'Review for Quiz 3', s: 'Worth 15% of your grade' }];

  if (c1 && c2 && c3) {
    let step = 0;
    setTimeout(() => {
      // Take over from the one-time opening animation, in its finished state.
      preview.classList.add('live');
      c1.classList.add('is-done');
      setInterval(() => {
        if (!showing() || getComputedStyle(preview).display === 'none') return;
        step++;
        const k = step % 3;
        // 1) a new assignment comes in, unchecked; a moment later it's done
        c1.classList.remove('is-done');
        const task = TASKS[k];
        swap(c1.querySelector('.ap-body'), `<div class="ap-title">${esc(task.t)}</div><div class="ap-sub">${esc(task.s)}</div>`);
        swap(c1.querySelector('.ap-badge'), esc(task.b));
        setTimeout(() => c1.classList.add('is-done'), 1700);
        // 2) a different class's grade fills in
        setTimeout(() => {
          const gr = GRADES[k];
          const fill = c2.querySelector('.ap-bar i');
          swap(c2.querySelector('.ap-title'), esc(gr.c));
          swap(c2.querySelector('.ap-grade'), esc(gr.g));
          if (fill) { fill.style.width = '0%'; requestAnimationFrame(() => setTimeout(() => { fill.style.width = gr.w + '%'; }, 260)); }
        }, 500);
        // 3) the top task changes, and its #1 badge pops
        setTimeout(() => {
          const top = TOPS[k];
          swap(c3.querySelector('.ap-body'), `<div class="ap-title">${esc(top.t)}</div><div class="ap-sub">${esc(top.s)}</div>`, -1);
          c3.querySelector('.ap-rank')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        }, 1000);
      }, 5200);
    }, 4200);
  }

  /* ---- A soft light that follows the pointer across the brand panel ---- */
  const brand = document.querySelector('.auth-brand');
  if (brand && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const spot = document.createElement('div');
    spot.className = 'auth-spot';
    spot.setAttribute('aria-hidden', 'true');
    brand.prepend(spot);
    let raf = 0, sx = 0, sy = 0;
    brand.addEventListener('pointermove', e => {
      const r = brand.getBoundingClientRect();
      sx = e.clientX - r.left; sy = e.clientY - r.top;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        spot.style.setProperty('--sx', sx + 'px');
        spot.style.setProperty('--sy', sy + 'px');
        spot.classList.add('on');
      });
    });
    brand.addEventListener('pointerleave', () => spot.classList.remove('on'));
  }
})();
