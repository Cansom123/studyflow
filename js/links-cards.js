/* ===========================
   LINKS: INDEX CARDS
   - Each class is an index card: a colored left edge, the class code big
     with the rest of the name under it, Assignments / Modules / Grades,
     and the links filed under that class at the bottom.
   - Links not filed under a class are bookmark tabs, plus "+ Add a link".
   - "Edit links" folds out the full list (pin, file under a class, remove)
     and the add form, the same pieces as before (linksTabListHTML).
=========================== */

// A class's full name minus its code: "MATH 132 Finite Math" → "Finite Math",
// "MATH 132 1007 - 2026 Fall" → "Section 1007 · 2026 Fall".
function linksClassRest(name, code) {
  if (!name.startsWith(code)) return '';
  const rest = name.slice(code.length).replace(/^[\s:·|-]+/, '');
  const sec = /^(\d{3,5})\s+-\s+(.+)$/.exec(rest);
  return (sec ? `Section ${sec[1]} · ${sec[2]}` : rest).replace(/\s+-\s+/g, ' · ');
}

function linksHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function linksClassCardHTML(c, i, links) {
  const code = courseCode(c.name);
  const rest = linksClassRest(c.name, code);
  const saved = links.filter(l => l.course === c.name);
  return `<div class="lk-card" style="--h:${(i * 67 + 210) % 360}">
    <a class="lk-card-head" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(c.name)} in Canvas">
      <span class="lk-code${code.length > 14 ? ' long' : ''}">${escapeHtml(code)}</span>
      <span class="lk-name">${escapeHtml(rest || 'Open class in Canvas')}</span>
    </a>
    <div class="lk-btns">
      ${CLASS_LINK_SECTIONS.map(s => `<a class="hm-btn" href="${escapeHtml(c.url + s.path)}" target="_blank" rel="noopener noreferrer">${s.label}</a>`).join('')}
    </div>
    <div class="lk-saved">${saved.length
      ? `<span>Saved:</span>${saved.map(l => `<button type="button" onclick="openCustomLink(${l.i})">${escapeHtml(l.label)}</button>`).join('')}`
      : 'Nothing saved yet'}</div>
  </div>`;
}

// Replaces the old class list; renderCustomLinks and the tab switch call it.
function renderClassLinks() {
  renderLinkBookmarks();
  const section = document.getElementById('class-links-section');
  const listEl = document.getElementById('class-links-list');
  if (!section || !listEl) return;
  const classes = classCanvasLinks(syllabusCourses, syllabusCanvas && syllabusCanvas.url,
    (cachedAssignments || []).concat(cachedGradedAssignments || []));
  const links = (Array.isArray(userPrefs.customLinks) ? userPrefs.customLinks : []).map((l, i) => ({ ...l, i }));
  section.style.display = classes.length ? '' : 'none';
  const sig = JSON.stringify([classes, links.map(l => [l.label, l.course || ''])]);
  if (listEl.dataset.sig === sig) return;
  listEl.dataset.sig = sig;
  listEl.innerHTML = classes.map((c, i) => linksClassCardHTML(c, i, links)).join('');
}

// Links with no class (or a class that's no longer on the list) as tabs.
function renderLinkBookmarks() {
  const host = document.getElementById('links-bookmarks');
  if (!host) return;
  const links = Array.isArray(userPrefs.customLinks) ? userPrefs.customLinks : [];
  const names = new Set(linkClassNames());
  const loose = links.map((l, i) => ({ ...l, i })).filter(l => !l.course || !names.has(l.course))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  host.innerHTML = loose.map((l, n) => `<button type="button" class="lk-mark" style="--h:${(n * 67 + 30) % 360}" onclick="openCustomLink(${l.i})" title="${escapeHtml(l.url)}">
      <span class="lk-fav">${linkIconHTML(l.url)}</span><span class="lk-mark-t">${l.pinned ? '★ ' : ''}${escapeHtml(l.label)}</span><span class="lk-host">${escapeHtml(linksHost(l.url))}</span>
    </button>`).join('') + `<button type="button" class="lk-mark lk-add" onclick="linksOpenAdd()">+ Add a link</button>`;

  const manage = document.getElementById('links-manage');
  const k = document.getElementById('links-manage-k');
  if (k) k.textContent = links.length ? `${links.length} saved · pin, file under a class, remove` : '';
  if (manage && !links.length) manage.open = true;
}

function linksOpenAdd() {
  const manage = document.getElementById('links-manage');
  if (manage) manage.open = true;
  const input = document.getElementById('custom-link-label-input');
  if (!input) return;
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => input.focus({ preventScroll: true }), 250);
}
