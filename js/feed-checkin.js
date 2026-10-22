/* ===========================
   QUICK START CHECK-INS
   The calendar link can't tell what's been turned in, so instead of
   leaving past-due work red as if the student did nothing:
   - On the due day: a reminder (a browser notification when they're on,
     otherwise a pop-up in the app, once a day).
   - Once the due date passes, the assignment leaves the lists and waits in
     a "Did you turn this in?" check-in: Done, or Late.
   - Late keeps it in the lists with an amber "Late" tag, and the question
     comes back 5 days later.
   Answers are saved on the account (userPrefs.feedCheckins), keyed by
   title||course like check-offs. Only used when canvasMode === 'feed'.
=========================== */

const FEED_LATE_RECHECK_DAYS = 5;
let cachedFeedCheckins = [];
let feedCheckinShownThisVisit = false;

const feedKey = a => decodeURIComponent(doneKey(a));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Called from loadAssignments(): returns what the lists should show, and
// keeps the past-due work that needs an answer in cachedFeedCheckins.
function sortOutFeedCheckins(assignments) {
  const today = startOfToday();
  const answers = (userPrefs && userPrefs.feedCheckins) || {};
  const shown = [], ask = [];
  assignments.forEach(a => {
    const isPast = a.due_date && new Date(a.due_date) < today;
    if (!isPast || a.completed || doneSet.has(feedKey(a))) { shown.push(a); return; }
    const ans = answers[feedKey(a)];
    if (ans && ans.s === 'late') {
      const askOn = new Date(new Date(ans.at).getTime() + FEED_LATE_RECHECK_DAYS * 86400000);
      if (askOn > new Date()) { shown.push({ ...a, feed_late: true, feed_ask_on: askOn.toISOString() }); return; }
    }
    ask.push(a);
  });
  cachedFeedCheckins = ask.sort((x, y) => new Date(x.due_date) - new Date(y.due_date));
  pruneFeedAnswers(assignments);
  setTimeout(() => { renderFeedCheckinCard(); maybeOpenFeedCheckin(); remindDueToday(shown); }, 0);
  return shown;
}

// Answers for assignments no longer in the feed are dropped.
function pruneFeedAnswers(assignments) {
  const answers = userPrefs && userPrefs.feedCheckins;
  if (!answers) return;
  const keys = new Set(assignments.map(feedKey));
  let changed = false;
  Object.keys(answers).forEach(k => { if (!keys.has(k)) { delete answers[k]; changed = true; } });
  if (changed) saveUserPrefs();
}

/* ---- Answering -------------------------------------------------------- */
async function feedCheckinAnswer(keys, answer) {
  const list = cachedFeedCheckins.filter(a => keys.includes(feedKey(a)));
  if (!list.length) return;
  userPrefs.feedCheckins = userPrefs.feedCheckins || {};
  const now = new Date().toISOString();
  if (answer === 'done') {
    list.forEach(a => { doneSet.add(feedKey(a)); delete userPrefs.feedCheckins[feedKey(a)]; });
    try { localStorage.setItem('sf_done_' + USER_ID, JSON.stringify([...doneSet])); } catch (e) {}
    const ids = list.map(a => a.id).filter(Boolean);
    if (ids.length) sbFetchWithRetry(`/rest/v1/assignments?user_id=eq.${USER_ID}&id=in.(${ids.join(',')})`, 'PATCH', { completed: true, completed_at: now });
    if (typeof bumpCompletedCount === 'function') bumpCompletedCount(list.length);
  } else {
    list.forEach(a => { userPrefs.feedCheckins[feedKey(a)] = { s: 'late', at: now }; });
  }
  saveUserPrefs();
  // Gone from the check-in right away; the lists catch up on reload.
  cachedFeedCheckins = cachedFeedCheckins.filter(a => !keys.includes(feedKey(a)));
  renderFeedCheckinList();
  renderFeedCheckinCard();
  if (!cachedFeedCheckins.length) setTimeout(closeFeedCheckin, answer === 'done' ? 500 : 250);
  if (answer === 'late') await loadAssignments();
}

/* ---- The check-in window ---------------------------------------------- */
function feedCheckinOverlay() {
  let el = document.getElementById('feed-checkin-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'feed-checkin-overlay';
  el.className = 'fci-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'fci-title');
  el.innerHTML = `
    <div class="fci-sheet">
      <div class="fci-head">
        <div>
          <div class="fci-title" id="fci-title">Did you turn these in?</div>
          <div class="fci-sub" id="fci-sub"></div>
        </div>
        <button type="button" class="fci-close" onclick="closeFeedCheckin()" aria-label="Close">✕</button>
      </div>
      <div class="fci-list" id="fci-list"></div>
      <div class="fci-foot">
        <button type="button" class="fci-all" id="fci-all" onclick="feedCheckinAnswer(cachedFeedCheckins.map(feedKey), 'done')">Mark all done</button>
        <button type="button" class="fci-later" onclick="closeFeedCheckin()">Ask me later</button>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeFeedCheckin(); });
  document.body.appendChild(el);
  return el;
}

function renderFeedCheckinList() {
  const listEl = document.getElementById('fci-list');
  if (!listEl) return;
  const n = cachedFeedCheckins.length;
  const sub = document.getElementById('fci-sub');
  if (sub) sub.textContent = n
    ? `${n} assignment${n === 1 ? '' : 's'} passed ${n === 1 ? 'its' : 'their'} due date. Your Canvas calendar can't tell Duesday what you turned in.`
    : 'All caught up.';
  const all = document.getElementById('fci-all');
  if (all) all.style.display = n > 1 ? '' : 'none';
  const fmt = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  listEl.innerHTML = n ? cachedFeedCheckins.map(a => {
    const k = encodeURIComponent(feedKey(a)).replace(/'/g, '%27');
    return `<div class="fci-item">
      <div class="fci-item-text">
        <div class="fci-item-title">${escapeHtml(a.title)}</div>
        <div class="fci-item-sub">${escapeHtml(a.course || '')} · was due ${fmt(a.due_date)}</div>
      </div>
      <div class="fci-item-actions">
        <button type="button" class="fci-done" onclick="feedCheckinAnswer([decodeURIComponent('${k}')], 'done')">Done</button>
        <button type="button" class="fci-late" onclick="feedCheckinAnswer([decodeURIComponent('${k}')], 'late')">Late</button>
      </div>
    </div>`;
  }).join('') : `<div class="fci-empty">Nothing left to check in. Nice.</div>`;
}

function openFeedCheckin() {
  if (!cachedFeedCheckins.length) return;
  const el = feedCheckinOverlay();
  renderFeedCheckinList();
  el.classList.add('show');
  feedCheckinShownThisVisit = true;
}
function closeFeedCheckin() {
  document.getElementById('feed-checkin-overlay')?.classList.remove('show');
}

// Opens by itself once per visit, when the app (not setup) is showing.
function maybeOpenFeedCheckin() {
  if (feedCheckinShownThisVisit || !cachedFeedCheckins.length) return;
  const app = document.getElementById('main-app');
  if (!app || app.style.display === 'none') return;
  if (document.getElementById('ws-overlay')?.style.display === 'flex') return; // the welcome screen is up
  openFeedCheckin();
}

/* ---- Home: a reminder card while anything's waiting -------------------- */
function renderFeedCheckinCard() {
  const host = document.getElementById('home-upnext');
  if (!host || !host.parentElement) return;
  let card = document.getElementById('home-feed-checkin');
  const n = canvasMode === 'feed' ? cachedFeedCheckins.length : 0;
  if (!n) { card?.remove(); return; }
  if (!card) {
    card = document.createElement('button');
    card.type = 'button';
    card.id = 'home-feed-checkin';
    card.className = 'feed-checkin-card';
    card.onclick = openFeedCheckin;
    host.parentElement.insertBefore(card, host.previousElementSibling || host);
  }
  card.innerHTML = `<span class="fcc-count">${n}</span><span class="fcc-text"><b>Did you turn ${n === 1 ? 'this' : 'these'} in?</b> ${n === 1 ? 'An assignment' : `${n} assignments`} passed the due date. Tap to check in.</span><span class="fcc-arrow" aria-hidden="true">›</span>`;
}

/* ---- Due today: a reminder that doesn't depend on notifications --------- */
function remindDueToday(shown) {
  const browserOn = userPrefs.browserNotificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (browserOn) return; // checkDueSoonNotifications already sends these
  const todayKey = 'sf_due_today_popup_' + USER_ID + '_' + startOfToday().toDateString();
  try { if (localStorage.getItem(todayKey)) return; } catch (e) {}
  const due = shown.filter(a => a.due_date && dayDiff(a.due_date) === 0 && !a.completed && !doneSet.has(feedKey(a)));
  if (!due.length) return;
  try { localStorage.setItem(todayKey, '1'); } catch (e) {}
  const el = document.createElement('div');
  el.className = 'due-today-pop';
  el.setAttribute('role', 'status');
  const first = due[0];
  el.innerHTML = `<div class="dtp-label">Due today</div>
    <div class="dtp-title">${escapeHtml(first.title)}</div>
    <div class="dtp-sub">${escapeHtml(first.course || '')}${due.length > 1 ? ` · and ${due.length - 1} more` : ''}</div>
    <button type="button" class="dtp-close" aria-label="Dismiss">✕</button>`;
  const dismiss = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
  el.querySelector('.dtp-close').onclick = dismiss;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(dismiss, 12000);
}

// The welcome screen opens on every visit; the check-in waits for it to close.
(function openAfterWelcome() {
  const orig = window.wsClose;
  if (typeof orig !== 'function') return;
  window.wsClose = function () {
    const r = orig.apply(this, arguments);
    setTimeout(maybeOpenFeedCheckin, 450);
    return r;
  };
})();

// Home's numbers: in Quick start the only past-due work left in the lists is
// what the student marked Late, so "overdue" (red) reads "running late" (amber).
(function lateNotOverdue() {
  const orig = window.renderHome;
  if (typeof orig !== 'function') return;
  window.renderHome = function () {
    const r = orig.apply(this, arguments);
    if (canvasMode === 'feed') {
      const label = document.getElementById('home-hero-label');
      if (label) label.textContent = label.textContent.replace(/\boverdue\b/, 'running late');
      document.querySelectorAll('#home-tiles .home-tile.tone-red .ht-label').forEach(el => { el.textContent = 'Running late'; });
      document.querySelectorAll('#home-tiles .ht-sub').forEach(el => { if (el.textContent === 'Nothing overdue') el.textContent = 'Nothing late'; });
      document.querySelectorAll('#home-tiles .home-tile:not(.tone-red) .ht-label').forEach(el => { if (el.textContent === 'Overdue') el.textContent = 'Running late'; });
    }
    renderFeedCheckinCard();
    return r;
  };
})();
