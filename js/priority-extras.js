/* ===========================
   PRIORITY EXTRAS
   "Why #N?" on each ranked card: opens a short plain-language list of what
   pushed it to that spot (the reasons are built alongside the score in
   computePriorityScores). Which cards are open survives re-renders.
=========================== */
const priorityWhyOpen = new Set();

function togglePriorityWhy(id, btn) {
  const key = String(id);
  const card = btn && btn.closest('.priority-card');
  const open = !priorityWhyOpen.has(key);
  if (open) priorityWhyOpen.add(key); else priorityWhyOpen.delete(key);
  if (card) card.classList.toggle('why-open', open);
  if (btn) { btn.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); }
}
