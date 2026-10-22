/* ===========================
   UPDATES INBOX (the Updates page's laptop layout)
   - On laptops (1100px and up) the feed is a compact list on the left and
     the picked update opens in a reading pane on the right, on ruled paper.
   - Picking a row marks it read exactly like opening a card does
     (toggleUpdate), so Home and the badges stay in step.
   - The pane has Ask Choom (sends a question to the Priority planner via
     homeAskCoco), Save, Open in Canvas and Mute this class.
   - Phones and tablets keep the expanding cards (updateCardHTML).
=========================== */

const UPD_WIDE = window.matchMedia('(min-width: 1100px)');
let updSelected = ''; // "kind:id" of the update in the reading pane

function updShownItems() {
  if (updatesFilter === 'saved') return savedUpdateList().map(savedUpdateAsItem);
  const all = allUpdates();
  return updatesFilter === 'all' ? all : all.filter(u => u.kind === updatesFilter);
}

// Right-hand time on a row: "now", "40m", "5h" today, the weekday this
// week, otherwise the date.
function updShortTime(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  const label = updatesDayLabel(iso);
  if (label === 'Today') return mins < 1 ? 'now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
  if (label === 'Yesterday' || label === 'This week') return DOW_SHORT[t.getDay()];
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Pane meta: "today, 9:14 AM", "yesterday, 4:02 PM" or "Mon, Oct 12, 8:00 AM".
function updLongTime(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const label = updatesDayLabel(iso);
  if (label === 'Today') return `today, ${time}`;
  if (label === 'Yesterday') return `yesterday, ${time}`;
  return `${t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

function updRowHTML(u) {
  const key = `${u.kind}:${u.id}`;
  const sel = key === updSelected;
  const unread = !u.src.read;
  const sub = [escapeHtml(courseCode(u.context)), u.from ? escapeHtml(u.from) : ''].filter(Boolean).join(' · ');
  return `<div class="upd-row${unread ? ' unread' : ''}${sel ? ' sel' : ''}" role="button" tabindex="0" aria-current="${sel}"
      onclick="selectUpdate('${u.kind}', '${u.id}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
    <span class="upd-row-dot" aria-label="${unread ? 'Unread' : ''}"></span>
    <div class="upd-row-main">
      <div class="upd-row-t"><span class="upd-row-k upd-row-k-${u.kind}">${UPDATE_KINDS[u.kind].label}</span>${escapeHtml(u.title)}</div>
      ${sub ? `<div class="upd-row-sub">${sub}</div>` : ''}
    </div>
    <span class="upd-row-when">${updShortTime(u.time)}</span>
  </div>`;
}

// The question the Ask Choom chip sends to the Priority planner.
function updChoomQuestion(u) {
  const cls = courseCode(u.context);
  if (u.kind === 'feedback') return `What should I work on in ${cls} after this feedback: "${u.title}"?`;
  return `What should I review for ${cls}? My teacher posted: "${u.title}"`;
}

function updPaneHTML(u) {
  const saved = isUpdateSaved(u.kind, u.id);
  const meta = [u.from ? escapeHtml(u.from) : '', updLongTime(u.time)].filter(Boolean).join(' · ');
  const canAsk = u.kind !== 'message' && u.context;
  const canMute = u.kind === 'announcement' && u.context;
  return `<div class="upd-pane-head">
      <div class="upd-pane-k">${escapeHtml(courseCode(u.context))}${u.context ? ' · ' : ''}${UPDATE_KINDS[u.kind].label}</div>
      <h2 class="upd-pane-title">${escapeHtml(u.title)}</h2>
      ${meta ? `<div class="upd-pane-meta">${meta}</div>` : ''}
    </div>
    <div class="upd-pane-body">${linkifyText(u.body)}</div>
    <div class="upd-pane-actions">
      ${canAsk ? `<button type="button" class="upd-ask" data-q="${escapeHtml(updChoomQuestion(u))}" onclick="homeAskCoco(this.dataset.q)">${u.kind === 'feedback' ? 'Ask Choom: what should I work on?' : 'Ask Choom: what should I review?'}</button>` : ''}
      <button type="button" class="hm-btn${saved ? ' on' : ''}" aria-pressed="${saved}" onclick="toggleSaveUpdate('${u.kind}', '${u.id}')">${saved ? 'Saved' : 'Save'}</button>
      ${u.url ? `<a class="hm-btn" href="${escapeHtml(u.url)}" target="_blank" rel="noopener noreferrer">Open in Canvas</a>` : ''}
      ${canMute ? `<button type="button" class="upd-pane-mute" data-cls="${escapeHtml(u.context)}" onclick="muteClass(this.dataset.cls)">Mute ${escapeHtml(courseCode(u.context))}</button>` : ''}
    </div>`;
}

function renderUpdatesPane() {
  const box = document.getElementById('updates-inbox');
  const pane = document.getElementById('updates-pane');
  if (!box || !pane) return;
  const shown = UPD_WIDE.matches ? updShownItems() : [];
  box.classList.toggle('on', shown.length > 0);
  if (!shown.length) { pane.innerHTML = ''; return; }
  const u = shown.find(x => `${x.kind}:${x.id}` === updSelected);
  pane.innerHTML = u ? updPaneHTML(u)
    : `<div class="upd-pane-empty">Pick an update on the left to read it here.</div>`;
}

// Same read-marking as toggleUpdate, without the expand/collapse.
function selectUpdate(kind, id) {
  updSelected = `${kind}:${id}`;
  const def = UPDATE_KINDS[kind];
  const item = def && def.cache().find(x => String(x.id) === String(id));
  if (item && !item.read) {
    item.read = true;
    sbFetchWithRetry(`/rest/v1/${def.table}?id=eq.${id}`, 'PATCH', { read: true });
    def.rerender(); // keeps Home / More badges in step; also re-renders this feed
  } else {
    renderUpdates();
  }
  document.getElementById('updates-pane')?.scrollTo?.(0, 0);
}

(function initUpdatesInbox() {
  const origCard = window.updateCardHTML;
  window.updateCardHTML = function (u) {
    return UPD_WIDE.matches ? updRowHTML(u) : origCard(u);
  };
  const orig = window.renderUpdates;
  if (typeof orig === 'function') {
    window.renderUpdates = function () {
      const r = orig.apply(this, arguments);
      try { renderUpdatesPane(); } catch (e) { console.warn('[updates inbox]', e); }
      return r;
    };
  }
  UPD_WIDE.addEventListener?.('change', () => renderUpdates());
})();
