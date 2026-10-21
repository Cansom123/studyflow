/* ===========================
   BINDER TABS
   On laptops the navigation is one row of binder tabs across the top
   (styles.css, "BINDER TABS"). When the window is narrower than the row it
   scrolls sideways, so this keeps the active tab in view: after every page
   switch, on load, and when the window is resized.
=========================== */

(function initBinderTabs() {
  const strip = document.querySelector('.tabs');
  if (!strip) return;

  function revealActive() {
    if (window.innerWidth < 601) return;
    const tab = strip.querySelector('.tab.active');
    if (!tab || strip.scrollWidth <= strip.clientWidth) return;
    const left = tab.offsetLeft - strip.offsetLeft, right = left + tab.offsetWidth;
    if (left < strip.scrollLeft + 8) strip.scrollLeft = Math.max(0, left - 40);
    else if (right > strip.scrollLeft + strip.clientWidth - 8) strip.scrollLeft = right - strip.clientWidth + 40;
  }

  const origShow = window.showPage;
  if (typeof origShow === 'function') {
    window.showPage = function () {
      const r = origShow.apply(this, arguments);
      setTimeout(revealActive, 0);
      return r;
    };
  }
  window.addEventListener('resize', revealActive);
  setTimeout(revealActive, 0);

  // Sync is an icon button in the strip, so "Synced 6m ago" (hidden there)
  // moves into its tooltip and stays current as the app updates it.
  const syncBtn = document.getElementById('sidebar-sync-btn');
  const syncSub = document.getElementById('sidebar-sync-sub');
  if (syncBtn && syncSub) {
    const label = () => {
      const when = syncSub.textContent.trim();
      syncBtn.title = when ? `Sync now · ${when}` : 'Sync assignments now';
      syncBtn.setAttribute('aria-label', syncBtn.title);
    };
    new MutationObserver(label).observe(syncSub, { childList: true, characterData: true, subtree: true });
    label();
  }
})();
