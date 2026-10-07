/* ===========================
   DISPLAY PREFERENCES ON THE ACCOUNT
   Theme, accent color, background tint, card corners, text size and
   density used to live only in this browser (localStorage), so every new
   device or browser started from the defaults. They are now also saved in
   the account's prefs (user_settings.prefs.display) and applied on sign-in,
   so StudyFlow looks the same wherever the student signs in.

   localStorage stays the first source on page load, so the look is right
   instantly (before sign-in finishes) and still works offline. Once prefs
   load, the account's copy wins; if the account has none yet, this
   device's current look is uploaded as the starting point.
=========================== */

const DISPLAY_KEYS = {
  themeMode: 'sf_theme_mode',
  accent: 'sf_tweak_accent',
  btnAccent: 'sf_tweak_btnAccent',
  bgHue: 'sf_tweak_bgHue',
  cardRadius: 'sf_tweak_cardRadius',
  fontScale: 'sf_tweak_fontScale',
  density: 'sf_tweak_density',
};

function readLocalDisplay() {
  const d = {};
  Object.entries(DISPLAY_KEYS).forEach(([k, key]) => {
    let v = null;
    try { v = localStorage.getItem(key); } catch (e) {}
    if (v !== null && v !== '') d[k] = v;
  });
  return d;
}

function writeLocalDisplay(d) {
  Object.entries(DISPLAY_KEYS).forEach(([k, key]) => {
    try {
      if (d[k] === undefined || d[k] === null || d[k] === '') localStorage.removeItem(key);
      else localStorage.setItem(key, String(d[k]));
    } catch (e) {}
  });
}

// Puts the page back to the defaults, then applies what's in localStorage:
// the same path a fresh page load takes, so an account's look renders
// exactly as it does on the device that chose it.
function reapplyDisplayFromLocal() {
  const root = document.documentElement;
  clearAccentOverrides();
  root.removeAttribute('data-btn-accent');
  ['--accent-h', '--bg-h', '--card-radius', '--font-scale'].forEach(v => root.style.removeProperty(v));
  document.body.classList.remove('density-compact');
  document.querySelectorAll('#tweak-swatches-accent .swatch, #tweak-swatches-bg .swatch, #tweak-swatches-radius .swatch, #tweak-density .seg-btn')
    .forEach(el => el.classList.remove('active'));
  const fontEl = document.getElementById('tweak-font-size');
  if (fontEl) fontEl.value = tweakDefaults.fontScale || '1';
  // Theme first: the gray accent is worked out from light vs dark.
  applyThemeMode();
  const l = readLocalDisplay();
  applyTweaks({
    accent: l.accent || tweakDefaults.accent,
    btnAccent: l.btnAccent || null,
    bgHue: l.bgHue || 'match',
    cardRadius: l.cardRadius || tweakDefaults.cardRadius,
    fontScale: l.fontScale || tweakDefaults.fontScale,
    density: l.density || 'comfortable',
  });
  if (!l.density || l.density === 'comfortable') {
    document.querySelector('#tweak-density .seg-btn[data-density="comfortable"]')?.classList.add('active');
  }
}

let displayPrefsLoaded = false;
let displaySyncTimer = 0;

// Saves this device's current look to the account. Debounced, because the
// text-size slider fires on every step while it is dragged.
function syncDisplayToAccount() {
  if (!displayPrefsLoaded || typeof USER_ID === 'undefined' || !USER_ID) return;
  clearTimeout(displaySyncTimer);
  displaySyncTimer = setTimeout(() => {
    userPrefs.display = readLocalDisplay();
    saveUserPrefs();
  }, 700);
}

// Every change to the look goes through one of these, so wrapping them is
// enough to keep the account in step.
(function hookDisplaySetters() {
  const wrap = (name) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      syncDisplayToAccount();
      return r;
    };
  };
  wrap('saveTweak');          // accent, background, corners, text size, density
  wrap('resetAccentToWhite'); // clears the accent keys without saveTweak
  wrap('setThemeMode');       // light / dark / system
})();

// When the account's prefs arrive, apply its look (or, the first time, adopt
// this device's look as the account's).
(function hookPrefsLoad() {
  const orig = window.loadUserPrefs;
  if (typeof orig !== 'function') return;
  window.loadUserPrefs = async function () {
    const r = await orig.apply(this, arguments);
    const saved = userPrefs && userPrefs.display;
    if (saved && typeof saved === 'object') {
      const local = readLocalDisplay();
      const differs = Object.keys(DISPLAY_KEYS).some(k => (saved[k] ?? null) !== (local[k] ?? null));
      if (differs) {
        writeLocalDisplay(saved);
        reapplyDisplayFromLocal();
      }
      displayPrefsLoaded = true;
    } else {
      displayPrefsLoaded = true;
      userPrefs.display = readLocalDisplay();
      saveUserPrefs();
    }
    return r;
  };
})();
