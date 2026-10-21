/* ===========================
   SIGN-IN: WEEK TICKET
   The sample "Your week" ticket on the sign-in screen checks itself off one
   item at a time, then starts the week over (the exam stays open). Pauses
   while the sign-in page isn't showing or the tab is hidden, and stays still
   under reduce-motion.
=========================== */

(function initWeekTicket() {
  const list = document.getElementById('nb-tk-list');
  if (!list) return;
  const page = document.getElementById('auth-page');
  const items = [...list.querySelectorAll('li:not(.exam)')];
  const doneEl = document.getElementById('nb-tk-done');
  const leftEl = document.getElementById('nb-tk-left');
  const total = list.children.length;

  function count() {
    const n = items.filter(li => li.classList.contains('done')).length;
    if (doneEl) doneEl.textContent = n;
    if (leftEl) leftEl.textContent = total - n;
  }
  count();

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => {
    if (document.hidden || !page || page.style.display === 'none') return;
    const next = items.find(li => !li.classList.contains('done'));
    if (next) next.classList.add('done');
    else items.slice(1).forEach(li => li.classList.remove('done'));
    count();
  }, 2200);
})();
