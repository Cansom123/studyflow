/* ===========================
   SYLLABUS BINDER (the Syllabus page's laptop layout)
   - On laptops (1100px and up) the classes are binder tabs down the left
     (code big, and whether the syllabus was found) and the picked class's
     syllabus is open beside them: its key dates as tear-off chips, then the
     same body the overlay shows (Ask / Search inside it, the text, Edit,
     paste-it-yourself, Download, Try Canvas again).
   - The pane reuses syllabusDetailBodyHTML and its ids, so only one copy is
     ever on the page: opening in the pane empties the overlay and back.
   - Phones and tablets keep the cards and the overlay.
=========================== */

const SYL_WIDE = window.matchMedia('(min-width: 1100px)');
let sylPaneSig = ''; // what the pane last drew, so a background re-render doesn't wipe a typed question

function sylStatus(s) {
  if (s && s.content && !syllabusHasRealText(s.content)) return { text: 'Link only, paste the text', miss: true };
  if (s && s.content) return { text: s.source === 'canvas' ? 'Found on Canvas' : 'Added by you', miss: false };
  return { text: 'Not found, add it yourself', miss: true };
}

function sylTabsHTML() {
  return syllabusCourses.map(c => {
    const st = sylStatus(syllabusFor(c.id));
    const on = String(c.id) === String(syllabusDetailCourseId);
    return `<button type="button" class="syl-tab${on ? ' on' : ''}" aria-current="${on}" onclick="openSyllabus('${c.id}')">
      <span class="syl-tab-code">${escapeHtml(courseCode(cleanCourseName(c.name)))}</span>
      <span class="syl-tab-st${st.miss ? ' miss' : ''}">${st.text}</span>
    </button>`;
  }).join('');
}

// This class's key dates, read-only (hide / restore stay on the card above).
function sylPaneDatesHTML(courseId) {
  const dates = syllabusKeyDates().filter(d => !d.hidden && String(d.courseId) === String(courseId));
  if (!dates.length) return '';
  return `<div class="hm-sec-h"><h2>Key dates</h2><span class="hm-k">Read from the text</span></div>
    <div class="syl-pane-dates">${dates.slice(0, 8).map(d => `<div class="syl-pd${d.kind === 'Test' ? ' exam' : ''}">
      <div class="syl-date-chip"><span>${SYL_SHORT_MONTHS[d.date.getMonth()]}</span><b>${d.date.getDate()}</b></div>
      <div class="syl-pd-t"><b title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</b><span>${DOW_SHORT[d.date.getDay()]} · ${d.kind}</span></div>
    </div>`).join('')}</div>`;
}

function renderSyllabusPane(force) {
  const pane = document.getElementById('syl-pane');
  if (!pane) return;
  const id = syllabusDetailCourseId;
  const course = syllabusCourses.find(c => String(c.id) === String(id));
  if (!course) { pane.innerHTML = ''; sylPaneSig = ''; return; }
  const s = syllabusFor(id);
  const sig = `${id}|${s ? s.source + ':' + (s.content || '').length : 'none'}`;
  if (force || sig !== sylPaneSig || !pane.innerHTML) {
    sylPaneSig = sig;
    const name = cleanCourseName(course.name);
    const code = courseCode(name);
    const rest = linksClassRest(name, code); // "Finite Math", "Section 1007 · 2026 Fall"
    pane.innerHTML = `<div class="syl-pane-head">
        <div class="syl-pane-code">${escapeHtml(code)}</div>${rest ? `<div class="syl-pane-name">${escapeHtml(rest)}</div>` : ''}
      </div>
      <div id="syl-pane-dates"></div>
      <div class="hm-sec-h"><h2>The syllabus</h2><span class="hm-k">Ask Choom or search inside it</span></div>
      <div id="syl-detail-body">${syllabusDetailBodyHTML(s, sylSearchMode, id, schoolAIBannerHTML('syl-ai'))}</div>`;
  }
  // Dates redraw on their own so hiding one doesn't reset the syllabus below.
  const datesEl = document.getElementById('syl-pane-dates');
  if (datesEl) datesEl.innerHTML = sylPaneDatesHTML(id);
}

(function initSyllabusBinder() {
  // The overlay's body keeps its id only while the overlay is in use.
  const overlayBody = document.getElementById('syl-detail-body');

  const origOpen = window.openSyllabus;
  window.openSyllabus = function (courseId) {
    if (!SYL_WIDE.matches) {
      const pane = document.getElementById('syl-pane');
      if (pane) { pane.innerHTML = ''; sylPaneSig = ''; }
      if (overlayBody) overlayBody.id = 'syl-detail-body';
      return origOpen(courseId);
    }
    // Opened from a search result: leave the search, and search inside the
    // syllabus for the same words instead.
    const searchEl = document.getElementById('syllabus-search');
    const q = searchEl ? searchEl.value.trim() : '';
    if (q) { searchEl.value = ''; searchSyllabi(); }
    if (overlayBody) { overlayBody.innerHTML = ''; overlayBody.id = 'syl-detail-body-overlay'; }
    syllabusDetailCourseId = courseId;
    syllabusInlineMatches = [];
    syllabusInlineMatchIdx = -1;
    sylSearchMode = 'ask';
    renderSyllabusPane(true);
    const list = document.getElementById('syllabus-list');
    if (list) list.innerHTML = sylTabsHTML();
    const inline = document.getElementById('syl-inline-search');
    if (q && inline) { inline.value = q; setSylSearchMode('literal'); }
  };

  const origList = window.renderSyllabusList;
  window.renderSyllabusList = function () {
    const r = origList.apply(this, arguments);
    const binder = document.getElementById('syllabus-binder');
    const wide = SYL_WIDE.matches && syllabusCourses.length > 0;
    if (binder) binder.classList.toggle('on', wide);
    if (!wide) return r;
    if (!syllabusCourses.some(c => String(c.id) === String(syllabusDetailCourseId))) {
      syllabusDetailCourseId = syllabusCourses[0].id;
    }
    if (overlayBody) { overlayBody.innerHTML = ''; overlayBody.id = 'syl-detail-body-overlay'; }
    document.getElementById('syllabus-list').innerHTML = sylTabsHTML();
    try { renderSyllabusPane(false); } catch (e) { console.warn('[syllabus binder]', e); }
    return r;
  };

  // Switching tabs closes every overlay, which forgets the open class; the
  // pane's class has to survive that.
  const origClose = window.closeSyllabusDetail;
  window.closeSyllabusDetail = function () {
    const keep = syllabusDetailCourseId;
    const r = origClose.apply(this, arguments);
    if (SYL_WIDE.matches && document.querySelector('#syl-pane #syl-detail-body')) syllabusDetailCourseId = keep;
    return r;
  };

  const origChanged = window.onSyllabiChanged;
  window.onSyllabiChanged = function () {
    const r = origChanged.apply(this, arguments);
    if (SYL_WIDE.matches && document.getElementById('syl-pane-dates')) {
      document.getElementById('syl-pane-dates').innerHTML = sylPaneDatesHTML(syllabusDetailCourseId);
    }
    return r;
  };

  SYL_WIDE.addEventListener?.('change', () => {
    if (!SYL_WIDE.matches) {
      const pane = document.getElementById('syl-pane');
      if (pane) { pane.innerHTML = ''; sylPaneSig = ''; }
      if (overlayBody) overlayBody.id = 'syl-detail-body';
    }
    if (syllabusCourses.length) renderSyllabusList();
  });
})();
