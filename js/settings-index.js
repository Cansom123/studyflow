/* ===========================
   SETTINGS INDEX (the Settings page's laptop layout)
   On laptops (1100px and up) the section tabs become a list down the left,
   each with a short status in mono (the theme, Full sync or Quick start,
   whether notifications are on, how much goals steer Priority), and the
   open section sits on the right. Phones keep the tabs along the top.
   The statuses refresh whenever something on the page changes.
=========================== */

const SETTINGS_BOOST_LABELS = { 20: 'Light', 50: 'Normal', 90: 'Strong' };

function settingsStatus(id) {
  if (id === 'display') return (THEMES.find(t => t.id === currentPalette()) || {}).name || '';
  if (id === 'canvas') return canvasMode === 'token' ? 'Full sync' : canvasMode === 'feed' ? 'Quick start' : 'Not connected';
  if (id === 'alerts') return userPrefs.browserNotificationsEnabled ? 'On' : 'Off';
  if (id === 'study') return SETTINGS_BOOST_LABELS[userPrefs.priorityGoalBoost ?? 50] || '';
  return '';
}

function renderSettingsIndex() {
  document.querySelectorAll('#page-settings .settings-tab').forEach(t => {
    if (!t.querySelector('.st-l')) t.innerHTML = `<span class="st-l">${escapeHtml(t.textContent.trim())}</span><span class="st-k"></span>`;
    t.querySelector('.st-k').textContent = settingsStatus(t.dataset.panel);
  });
}

(function initSettingsIndex() {
  renderSettingsIndex();
  const page = document.getElementById('page-settings');
  if (page) ['click', 'change'].forEach(ev => page.addEventListener(ev, () => setTimeout(renderSettingsIndex, 0)));
  const origLoad = window.loadCanvasSettings;
  if (typeof origLoad === 'function') {
    window.loadCanvasSettings = async function () {
      const r = await origLoad.apply(this, arguments);
      renderSettingsIndex();
      return r;
    };
  }
})();
