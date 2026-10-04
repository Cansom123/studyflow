/* ===========================
   AUTH UI
   Progressive enhancement for the sign-in screens: gives every password
   field a show/hide button. Done here rather than in the markup so each of
   the login / signup / reset screens does not need its own copy of the
   wrapper and icons.
=========================== */

(function enhancePasswordFields() {
  const EYE = '<svg class="eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
    + '<svg class="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.1"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  document.querySelectorAll('.auth-input[type="password"]').forEach(input => {
    if (input.parentElement.classList.contains('auth-input-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'auth-input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'auth-eye';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = EYE;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });
    wrap.appendChild(btn);
  });
})();

// Wraps each word of the brand headline in a span so it can reveal word by
// word (see .auth-brand-tagline .tw in styles.css). The full sentence stays
// on the element as its accessible name; the word spans are hidden from
// screen readers so it is not read out one fragment at a time.
(function splitTagline() {
  const el = document.querySelector('.auth-brand-tagline');
  if (!el || el.dataset.split) return;
  const text = el.textContent.trim();
  el.dataset.split = '1';
  el.setAttribute('aria-label', text);
  el.innerHTML = text.split(/\s+/).map((w, i) =>
    `<span class="tw" aria-hidden="true" style="--i:${i}">${escapeHtml(w)}</span>`).join(' ');
})();

// Subtle cursor depth for the preview cards: each card shifts a few pixels
// toward the cursor by a different amount (--d per card in styles.css), so
// they read as layered. Mouse devices only, never under reduced motion.
(function previewParallax() {
  const brand = document.querySelector('.auth-brand');
  const preview = document.querySelector('.auth-preview');
  if (!brand || !preview) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = 0, px = 0, py = 0;
  brand.addEventListener('mousemove', e => {
    const r = brand.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      preview.style.setProperty('--px', px.toFixed(3));
      preview.style.setProperty('--py', py.toFixed(3));
    });
  });
  brand.addEventListener('mouseleave', () => {
    preview.style.setProperty('--px', '0');
    preview.style.setProperty('--py', '0');
  });
})();
