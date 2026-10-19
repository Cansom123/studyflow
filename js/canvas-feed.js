/* ===========================
   QUICK START: CANVAS CALENDAR LINK
   Two ways to connect Canvas, side by side:
   - Quick start: the student's Canvas calendar feed link. About 30 seconds,
     nothing to generate, and it works at schools that turn tokens off. Due
     dates only (synced by the canvas-feed-sync edge function).
   - Full sync: a Canvas access token (canvas-sync-v3). Adds grades,
     announcements, syllabi and submission status.
   This file holds the setup screen's choice, the Quick start form, the
   comparison table (setup + Settings), and the "comes with Full sync" cards
   shown in place of what the calendar link can't provide. Which one a
   student has lives in `canvasMode` / setCanvasMode() in index.html.
=========================== */

const CANVAS_PLAN_ROWS = [
  ["Everything that's due, in one place", true, true],
  ['Calendar, and Google / Apple Calendar', true, true],
  ['Priority list', 'By due date', 'Also uses your grades'],
  ['Study timer, streaks, notes and checklists', true, true],
  ['Knows what you turned in', 'You check it off', true],
  ['Grades and "what I need on the final"', false, true],
  ['Announcements, messages and teacher feedback', false, true],
  ['Syllabi, and coco.1 answers from them', false, true],
  ['Class names', 'Short codes, like BIO-101', 'Full names'],
  ['Setup', 'About 30 seconds', 'About 2 minutes'],
  ['What StudyFlow can see', 'Your Canvas calendar', 'Your Canvas account (it only reads)'],
];

function canvasPlanCompareHTML(current) {
  const cell = v => v === true ? '<span class="cplan-yes" aria-label="Included">✓</span>'
    : v === false ? '<span class="cplan-no" aria-label="Not included">–</span>'
    : `<span class="cplan-text">${escapeHtml(v)}</span>`;
  const head = (name, key) => `<th scope="col"${current === key ? ' class="is-current"' : ''}>${name}${current === key ? '<small>You have this</small>' : ''}</th>`;
  return `<div class="cplan-compare-scroll"><table class="cplan-compare">
    <thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${head('Quick start', 'feed')}${head('Full sync', 'token')}</tr></thead>
    <tbody>${CANVAS_PLAN_ROWS.map(([label, a, b]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${cell(a)}</td><td>${cell(b)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function renderCanvasPlanCompares() {
  const ob = document.getElementById('ob-plan-compare');
  if (ob) ob.innerHTML = canvasPlanCompareHTML(null);
  const st = document.getElementById('settings-plan-compare');
  if (st) st.innerHTML = canvasPlanCompareHTML('feed');
}

/* ---- Setup screen ------------------------------------------------------- */
function obChooseCanvasMode(mode) {
  const panel = document.getElementById('onboard-canvas');
  if (!panel) return;
  panel.dataset.obView = mode || 'choose';
  const btn = document.getElementById('ob-canvas-btn');
  if (btn) btn.textContent = mode === 'feed' ? 'Connect' : 'Save & continue';
  const body = panel.querySelector('.onboard-flow-panel-body');
  if (body) body.scrollTop = 0;
  const focusId = mode === 'feed' ? 'ob-feed-url' : mode === 'token' ? 'ob-canvas-url' : null;
  if (focusId) setTimeout(() => document.getElementById(focusId)?.focus({ preventScroll: true }), 60);
}

function obCanvasContinue() {
  const view = document.getElementById('onboard-canvas')?.dataset.obView;
  if (view === 'feed') return saveCanvasFeedOnboard();
  return saveCanvasOnboard();
}

function canvasFeedErrorHTML(r) {
  let title, fixes;
  switch (r && r.error) {
    case 'not_feed_link':
      title = "That doesn't look like a Canvas calendar link.";
      fixes = [
        'In Canvas, open <strong>Calendar</strong>, then click <strong>Calendar Feed</strong> on the right side and copy the whole link.',
        'It should contain <strong>/feeds/calendars/</strong> and end in <strong>.ics</strong>.',
      ];
      break;
    case 'feed_not_found':
      title = "Canvas didn't recognize that link.";
      fixes = [
        'Copy it again from Canvas → Calendar → Calendar Feed.',
        'Make sure you copied the whole link, all the way to <strong>.ics</strong>.',
      ];
      break;
    case 'not_calendar':
      title = "That link didn't return a calendar.";
      fixes = ['Copy the link from the <strong>Calendar Feed</strong> box in Canvas, not the address bar.'];
      break;
    default:
      title = r && r.error && /sign in/i.test(r.error) ? escapeHtml(r.error) : "Couldn't reach Canvas.";
      fixes = ["Check that you're online, then try again.", 'If it keeps happening, you can connect with a token instead.'];
  }
  return `<div class="msg-error canvas-connect-error"><div class="cce-title">${title}</div>
    <div class="cce-fixes-label">Possible fixes</div>
    <ol class="cce-fixes">${fixes.map(f => `<li>${f}</li>`).join('')}</ol></div>`;
}

async function saveCanvasFeedOnboard() {
  const input = document.getElementById('ob-feed-url');
  const msgEl = document.getElementById('onboard-feed-msg');
  const btn = document.getElementById('ob-canvas-btn');
  const raw = (input?.value || '').trim();
  msgEl.innerHTML = '';
  if (!raw) { msgEl.innerHTML = '<div class="msg-error">Paste your Canvas calendar link first.</div>'; return; }
  btn.disabled = true; btn.classList.add('btn-loading');
  const done = () => { btn.disabled = false; btn.classList.remove('btn-loading'); };

  let result;
  try {
    // A session left open a while can be stale; refresh it first, the
    // same way a sync does.
    if (REFRESH_TOKEN) await refreshSession();
    const resp = await fetch(`${SB_URL}/functions/v1/canvas-feed-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${ACCESS_TOKEN || SB_KEY}` },
      body: JSON.stringify({ action: 'validate', feed_url: raw }),
    });
    result = await resp.json().catch(() => ({}));
  } catch (e) {
    done(); msgEl.innerHTML = canvasFeedErrorHTML({ error: 'unreachable' }); return;
  }
  if (!result || !result.ok) { done(); msgEl.innerHTML = canvasFeedErrorHTML(result); return; }

  // The link works. Saving it hands it to the database, which encrypts it
  // and keeps only "connected" readable (see the canvas_calendar_feed migration).
  const courses = (result.courses || [])
    .filter(c => !isCourseTermConcluded(c.name || ''))
    .map(c => ({ id: String(c.id), name: c.name }));
  const row = { canvas_url: result.host, canvas_feed_url: raw, selected_courses: courses };
  let saved = await sbFetchWithRetry('/rest/v1/user_settings', 'POST', { user_id: USER_ID, ...row });
  if (!saved.ok && saved.data && JSON.stringify(saved.data).includes('duplicate')) {
    saved = await sbFetchWithRetry(`/rest/v1/user_settings?user_id=eq.${USER_ID}`, 'PATCH', row);
  }
  done();
  if (!saved.ok) { msgEl.innerHTML = '<div class="msg-error">Failed to save your settings. Please try again.</div>'; return; }

  if (input) input.value = '';
  setCanvasMode({ canvas_feed_connected: true });
  await loadCoursesForSelection();
  showOnboardCourses();
}

/* ---- Upgrading to Full sync keeps what was checked off --------------------
   The calendar link labels classes by course code ("BIO-101"), the token by
   full name, so the same assignment's title||course key changes on upgrade.
   Its Canvas link (/courses/<id>/assignments/<id>) is the same in both, so
   check-offs are matched by link. */
async function feedCheckedOffLinks() {
  const links = new Set();
  const { ok, data } = await sbFetchWithRetry(`/rest/v1/assignments?user_id=eq.${USER_ID}&completed=eq.true&select=assignment_url`);
  if (ok && Array.isArray(data)) data.forEach(r => r.assignment_url && links.add(r.assignment_url));
  (cachedAssignments || []).forEach(a => {
    if (a.assignment_url && doneSet.has(decodeURIComponent(doneKey(a)))) links.add(a.assignment_url);
  });
  return links;
}

async function carryOverFeedCheckOffs(links) {
  const { ok, data } = await sbFetchWithRetry(`/rest/v1/assignments?user_id=eq.${USER_ID}&completed=eq.false&select=id,title,course,assignment_url`);
  if (!ok || !Array.isArray(data)) return;
  const matches = data.filter(a => a.assignment_url && links.has(a.assignment_url));
  if (!matches.length) return;
  const now = new Date().toISOString();
  // doneSet too: a token sync re-reads "completed" from Canvas each time, and
  // doneSet is what keeps a StudyFlow check-off for work Canvas doesn't
  // count as submitted.
  matches.forEach(a => doneSet.add(decodeURIComponent(doneKey(a))));
  try { localStorage.setItem('sf_done_' + USER_ID, JSON.stringify([...doneSet])); } catch (e) {}
  const ids = matches.map(a => a.id).join(',');
  await sbFetchWithRetry(`/rest/v1/assignments?user_id=eq.${USER_ID}&id=in.(${ids})`, 'PATCH', { completed: true, completed_at: now });
  await loadAssignments();
}

/* ---- "Comes with Full sync" in place of what the link can't provide ----- */
const FEED_UPGRADE_SPOTS = [
  { page: 'grades', title: 'Grades come with Full sync', body: 'Your calendar link only has due dates. Add a Canvas token to see your grades and what you need on the final.' },
  { page: 'updates', title: 'Announcements come with Full sync', body: 'Teacher announcements, messages and feedback need a Canvas token. Your due dates keep working either way.' },
  { page: 'syllabus', title: 'Syllabi come with Full sync', body: 'StudyFlow needs a Canvas token to read your class syllabi and let coco.1 answer questions about them.' },
];

function openFullSyncUpgrade() {
  jumpTo('settings');
  if (typeof showSettingsPanel === 'function') showSettingsPanel('canvas');
  setTimeout(() => document.getElementById('canvas-upgrade')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
}

function feedUpgradeHTML(title, body, mini) {
  return `<div class="feed-upgrade${mini ? ' feed-upgrade-mini' : ''}">
    <div class="feed-upgrade-title">${escapeHtml(title)}</div>
    <div class="feed-upgrade-body">${escapeHtml(body)}</div>
    <button type="button" class="feed-upgrade-btn" onclick="openFullSyncUpgrade()">See what Full sync adds</button>
  </div>`;
}

(function placeFeedUpgradeCards() {
  FEED_UPGRADE_SPOTS.forEach(s => {
    const page = document.getElementById('page-' + s.page);
    if (!page || page.querySelector(':scope > .feed-upgrade')) return;
    const holder = document.createElement('div');
    holder.innerHTML = feedUpgradeHTML(s.title, s.body);
    const head = page.querySelector(':scope > .page-head');
    page.insertBefore(holder.firstElementChild, head ? head.nextSibling : page.firstChild);
  });
  // Home: a small card where "Grades at a glance" would be.
  const homeGrades = document.getElementById('home-grades');
  if (homeGrades && !document.getElementById('home-grades-upgrade')) {
    const holder = document.createElement('div');
    holder.innerHTML = feedUpgradeHTML('Grades come with Full sync', 'Add a Canvas token to see your grades here.', true);
    holder.firstElementChild.id = 'home-grades-upgrade';
    homeGrades.after(holder.firstElementChild);
  }
  renderCanvasPlanCompares();
})();
