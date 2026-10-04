/* ===========================
   HOME + LINKS EXTRAS
   - "Focus now": one tap from the Up next card into a focus session on it.
   - Links: pin favourites (they lead Home's quick links) and file a link
     under one of your classes (the Links tab then groups by class).
   Link extras live on each customLinks entry in the prefs blob as
   { pinned: true, course: 'AP Biology' }, so they sync with everything else.
=========================== */

/* ---- Home: Focus now ------------------------------------------------------ */
function homeFocusNowHTML(a) {
  if (!a || !a.id) return '';
  return `<button type="button" class="home-focus-now" onclick="focusOnAssignment('${a.id}', this)">
    <span class="hfn-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M7 4.8v10.4l8.2-5.2z"/></svg></span>
    <span class="hfn-text"><b>Focus on this now</b><span>Starts a focus timer for “${escapeHtml(a.title)}”</span></span>
    <svg class="hfn-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5l5 5-5 5"/></svg>
  </button>`;
}

// Creates a study session named after the assignment and opens the focus
// timer on it. If a timer is already running, brings that one back instead
// of starting a second.
async function focusOnAssignment(id, btn) {
  if (typeof focusState !== 'undefined' && focusState) { expandFocusTimer(); return; }
  if (typeof deepWorkState !== 'undefined' && deepWorkState) { expandDeepWorkTimer(); return; }
  const a = (cachedAssignments || []).find(x => String(x.id) === String(id));
  if (!a) return;
  if (btn) btn.disabled = true;
  const title = a.title.length > 80 ? a.title.slice(0, 79) + '…' : a.title;
  const course = cleanCourseName(a.course || a.course_name || '');
  try {
    const { ok, data } = await sbFetchWithRetry('/rest/v1/study_sessions', 'POST', {
      user_id: USER_ID, title, course: course || null, session_date: ymd(new Date()), completed: false,
    }, true, { 'Prefer': 'return=representation' });
    const created = ok && Array.isArray(data) && data[0] ? data[0] : null;
    if (!created) throw new Error('insert failed');
    // The timer looks sessions up in this cache; don't trust a reload to
    // have included the new row yet.
    if (!cachedStudySessions.some(s => s.id === created.id)) cachedStudySessions.push(created);
    loadStudySessions();
    openFocusTimer(created.id);
  } catch (e) {
    showReward("Couldn't start the timer - try again in a second.", 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---- Links: pin + class ---------------------------------------------------- */
function toggleLinkPin(index) {
  const links = userPrefs.customLinks || [];
  if (!links[index]) return;
  links[index].pinned = !links[index].pinned;
  saveUserPrefs();
  renderCustomLinks();
  showReward(links[index].pinned ? 'Pinned - it leads your links on Home.' : 'Unpinned.', 'check');
}

function setLinkCourse(index, course) {
  const links = userPrefs.customLinks || [];
  if (!links[index]) return;
  if (course) links[index].course = course; else delete links[index].course;
  saveUserPrefs();
  renderCustomLinks();
}

// Names of the student's classes, for the class pickers.
function linkClassNames() {
  return classCanvasLinks(syllabusCourses, syllabusCanvas && syllabusCanvas.url,
    (cachedAssignments || []).concat(cachedGradedAssignments || [])).map(c => c.name);
}

// Keeps the "Add a link" form's class picker in step with the real classes.
function renderLinkClassPicker() {
  const sel = document.getElementById('custom-link-class-input');
  if (!sel) return;
  const names = linkClassNames();
  const wrap = sel.closest('.link-class-field');
  if (wrap) wrap.style.display = names.length ? '' : 'none';
  const sig = names.join('|');
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  const keep = sel.value;
  sel.innerHTML = `<option value="">No class</option>` + names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (names.includes(keep)) sel.value = keep;
}
