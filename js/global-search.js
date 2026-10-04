/* ===========================
   GLOBAL SEARCH
   The search bar in the top bar. One box that finds assignments, classes,
   announcements, saved links, syllabus text and the app's own pages, grouped
   by type, as you type. "/" or Ctrl/Cmd+K jumps to it from anywhere.

   searchEverything() is pure (takes plain data, returns groups), so the
   ranking can be reasoned about separately from the dropdown UI below it.
=========================== */

const GS_PAGES = [
  { name: 'home', label: 'Home', words: 'dashboard overview' },
  { name: 'due', label: 'Upcoming', words: 'calendar due soon schedule' },
  { name: 'allwork', label: 'Assignments', words: 'all work homework list' },
  { name: 'priority', label: 'Priority', words: 'plan what to do first' },
  { name: 'study', label: 'Study', words: 'focus timer deep work session' },
  { name: 'grades', label: 'Grades', words: 'scores classes' },
  { name: 'goals', label: 'Goals', words: 'final exam calculator' },
  { name: 'syllabus', label: 'Syllabus', words: 'syllabi policy' },
  { name: 'links', label: 'Links', words: 'shortcuts bookmarks' },
  { name: 'settings', label: 'Settings', words: 'preferences theme canvas account notifications' },
];

// How well `text` matches every word of the query: 0 means at least one
// word is missing. A match at the very start beats one at the start of a
// later word, which beats one in the middle of a word.
function gsScore(text, words) {
  const t = (text || '').toLowerCase();
  let score = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) return 0;
    score += i === 0 ? 3 : /\W/.test(t[i - 1]) ? 2 : 1;
  }
  return score;
}

function gsDueLabel(due) {
  if (!due) return 'No due date';
  const d = dayDiff(due);
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return '1 day overdue';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return 'Due ' + new Date(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// A short excerpt of `content` around the first place the query shows up.
function gsSnippet(content, words) {
  const lower = content.toLowerCase();
  const i = lower.indexOf(words[0]);
  if (i < 0) return '';
  const start = Math.max(0, i - 40);
  const end = Math.min(content.length, i + words[0].length + 60);
  return (start > 0 ? '…' : '') + content.slice(start, end).replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '');
}

function searchEverything(query, data) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const PER_GROUP = 5;
  const ranked = items => items.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, PER_GROUP);

  const assignments = ranked((data.assignments || []).map(a => {
    const course = cleanCourseName(a.course_name || a.course || '');
    return {
      score: gsScore(a.title, words) * 2 || gsScore(`${a.title} ${course}`, words),
      title: a.title, sub: `${course} · ${gsDueLabel(a.due_date)}`,
      action: { type: 'assignment', id: a.id },
    };
  }));

  const classes = ranked((data.grades || []).map(g => {
    const pct = g.current_score != null ? g.current_score : g.final_score;
    const letter = g.current_grade || g.final_grade || '';
    return {
      score: gsScore(cleanCourseName(g.course_name), words) || gsScore(g.course_name, words),
      title: cleanCourseName(g.course_name),
      sub: [letter, pct != null ? Number(pct).toFixed(1) + '%' : ''].filter(Boolean).join(' · ') || 'No grade yet',
      action: { type: 'grade', course: g.course_name },
    };
  }));

  const announcements = ranked((data.announcements || []).map(a => ({
    score: gsScore(a.title, words) * 2 || gsScore(`${a.title} ${a.course_name || ''} ${a.author_name || ''}`, words),
    title: a.title, sub: cleanCourseName(a.course_name || '') + (a.author_name ? ` · ${a.author_name}` : ''),
    action: { type: 'announcement' },
  })));

  const links = ranked((data.links || []).map((l, index) => ({
    score: gsScore(l.label, words) * 2 || gsScore(`${l.label} ${l.url}`, words),
    title: l.label || l.url, sub: (l.url || '').replace(/^https?:\/\//, ''),
    action: { type: 'link', index },
  })));

  // Course name first; otherwise any line of the syllabus itself, shown as
  // an excerpt so the student can see why it matched.
  const syllabi = ranked((data.syllabi || []).map(s => {
    const course = (data.syllabusCourses || []).find(c => String(c.id) === String(s.course_id));
    const name = cleanCourseName(course ? course.name : (s.course_name || 'Syllabus'));
    const byName = gsScore(name, words);
    if (byName) return { score: byName * 2, title: `${name} syllabus`, sub: 'Syllabus', action: { type: 'syllabus', id: s.course_id } };
    const text = s.content || '';
    if (!text || !gsScore(text, words)) return { score: 0 };
    return { score: 1, title: `${name} syllabus`, sub: gsSnippet(text, words), action: { type: 'syllabus', id: s.course_id } };
  }));

  const pages = ranked(GS_PAGES.filter(p => !data.hiddenPages || !data.hiddenPages.includes(p.name)).map(p => ({
    score: gsScore(p.label, words) * 2 || gsScore(`${p.label} ${p.words}`, words),
    title: p.label, sub: 'Go to page', action: { type: 'page', name: p.name },
  })));

  return [
    { label: 'Assignments', items: assignments },
    { label: 'Classes', items: classes },
    { label: 'Announcements', items: announcements },
    { label: 'Links', items: links },
    { label: 'Syllabi', items: syllabi },
    { label: 'Pages', items: pages },
  ].filter(g => g.items.length);
}

/* ---- Dropdown UI ---------------------------------------------------------- */
(function initGlobalSearch() {
  const root = document.getElementById('gsearch');
  const input = document.getElementById('gsearch-input');
  const panel = document.getElementById('gsearch-panel');
  const openBtn = document.getElementById('gsearch-open');
  if (!root || !input || !panel) return;

  let flat = [];   // every result in display order, for arrow-key movement
  let active = -1;

  const ICONS = {
    assignment: '<path d="M6 3.5h6l3 3V16a.5.5 0 0 1-.5.5h-8.5A.5.5 0 0 1 5.5 16V4a.5.5 0 0 1 .5-.5z"/><path d="M8 10h5M8 13h4"/>',
    grade: '<path d="M4 15l3.5-5 3 3.5L15.5 6"/><path d="M12 6h3.5v3.5"/>',
    announcement: '<path d="M6 8a4 4 0 0 1 8 0c0 3 1 4 1.5 4.5h-11C5 12 6 11 6 8z"/><path d="M8.3 15a1.8 1.8 0 0 0 3.4 0"/>',
    link: '<path d="M8.5 11.5l3-3"/><path d="M9.5 6.5l1-1a3 3 0 0 1 4.2 4.2l-1 1M10.5 13.5l-1 1a3 3 0 0 1-4.2-4.2l1-1"/>',
    syllabus: '<path d="M5 4h7l3 3v9H5z"/><path d="M12 4v3h3M7.5 10.5h5M7.5 13.5h5"/>',
    page: '<path d="M8 5l5 5-5 5"/>',
  };

  function currentData() {
    const hiddenPages = GS_PAGES.map(p => p.name).filter(n => {
      const tab = document.getElementById('tab-' + n);
      return tab && tab.style.display === 'none';
    });
    return {
      assignments: (cachedAssignments || []).filter(a => !a.completed && !doneSet.has(decodeURIComponent(doneKey(a)))),
      grades: cachedGrades, announcements: cachedAnnouncements,
      links: (typeof userPrefs !== 'undefined' && Array.isArray(userPrefs.customLinks)) ? userPrefs.customLinks : [],
      syllabi: cachedSyllabi, syllabusCourses, hiddenPages,
    };
  }

  function highlight(text, words) {
    let html = escapeHtml(text);
    words.forEach(w => { html = html.replace(new RegExp('(' + escapeRegex(escapeHtml(w)) + ')', 'ig'), '<mark>$1</mark>'); });
    return html;
  }

  function render() {
    const q = input.value.trim();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!q) {
      panel.innerHTML = `<div class="gs-hint">Search assignments, classes, announcements, links and syllabi.</div>`;
      flat = []; active = -1;
      return;
    }
    const groups = searchEverything(q, currentData());
    flat = groups.flatMap(g => g.items);
    active = flat.length ? 0 : -1;
    if (!flat.length) {
      panel.innerHTML = `<div class="gs-hint">No matches for “${escapeHtml(q)}”.</div>`;
      return;
    }
    let n = 0;
    panel.innerHTML = groups.map(g => `
      <div class="gs-group">${g.label}</div>
      ${g.items.map(it => {
        const i = n++;
        return `<button type="button" class="gs-item${i === active ? ' active' : ''}" data-i="${i}" role="option">
          <span class="gs-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[it.action.type]}</svg></span>
          <span class="gs-text"><span class="gs-title">${highlight(it.title, words)}</span><span class="gs-sub">${highlight(it.sub, words)}</span></span>
        </button>`;
      }).join('')}`).join('');
  }

  function setActive(i) {
    if (!flat.length) return;
    active = (i + flat.length) % flat.length;
    panel.querySelectorAll('.gs-item').forEach(el => el.classList.toggle('active', Number(el.dataset.i) === active));
    const el = panel.querySelector(`.gs-item[data-i="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    root.classList.add('open');
    document.querySelector('.topbar')?.classList.add('searching');
    render();
  }
  function close() {
    root.classList.remove('open');
    document.querySelector('.topbar')?.classList.remove('searching');
    input.blur();
  }

  function go(item) {
    const a = item.action;
    input.value = '';
    close();
    if (a.type === 'assignment') openAssignmentDetail(a.id);
    else if (a.type === 'grade') openGradeDetail(a.course);
    else if (a.type === 'announcement') openAllAnnouncements();
    else if (a.type === 'link') openCustomLink(a.index);
    else if (a.type === 'syllabus') { showPage('syllabus', document.getElementById('tab-syllabus')); openSyllabus(a.id); }
    else if (a.type === 'page') showPage(a.name, document.getElementById('tab-' + a.name));
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) go(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; close(); }
  });
  // mousedown, not click: a click would blur the input first and close the
  // panel before the item ever receives it.
  panel.addEventListener('mousedown', e => {
    const el = e.target.closest('.gs-item');
    if (!el) return;
    e.preventDefault();
    go(flat[Number(el.dataset.i)]);
  });
  panel.addEventListener('mousemove', e => {
    const el = e.target.closest('.gs-item');
    if (el && Number(el.dataset.i) !== active) setActive(Number(el.dataset.i));
  });
  document.addEventListener('mousedown', e => {
    if (root.classList.contains('open') && !root.contains(e.target) && e.target !== openBtn && !openBtn?.contains(e.target)) close();
  });
  if (openBtn) openBtn.addEventListener('click', () => { open(); input.focus(); });

  // "/" or Ctrl/Cmd+K from anywhere in the app -- but never while the
  // student is typing in some other field.
  document.addEventListener('keydown', e => {
    const app = document.getElementById('main-app');
    if (!app || app.style.display === 'none') return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      open();
      input.focus();
      input.select();
    }
  });
})();
