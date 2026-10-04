/* ===========================
   SYLLABUS KEY DATES
   Finds the dates teachers put in syllabi ("Midterm exam - October 14",
   "Research paper due Nov 3", "Quizzes: 9/15, 10/6") and shows them in a
   card on the Syllabus tab and as purple markers on the Upcoming calendar
   (month dots, week items, and in the day panel).

   It only looks at lines that carry both a date AND a work word (exam, quiz,
   paper, due...), and only future dates, so schedules full of other numbers
   don't turn into noise. Anything wrong can be dismissed with the x (kept
   in prefs.hiddenSyllabusDates), and the whole layer can be switched off
   (prefs.showSyllabusDates). These are read from free text, so the card
   tells the student to double-check them.
   Parsing is pure (parseSyllabusDates); the rest reads app state.
=========================== */
const SYL_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const SYL_MONTH_RX = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const SYL_WORK_RX = /\b(exams?|midterms?|finals?|tests?|quiz(?:zes)?|projects?|papers?|essays?|presentations?|portfolios?|assessments?|due|deadlines?|labs?)\b/i;
const SYL_SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sylKindOf(text) {
  const t = text.toLowerCase();
  if (/\b(exams?|midterms?|finals?|tests?)\b/.test(t)) return 'Test';
  if (/\bquiz/.test(t)) return 'Quiz';
  if (/\b(projects?|papers?|essays?|presentations?|portfolios?)\b/.test(t)) return 'Project';
  return 'Due';
}

// Resolve month/day (and maybe a year) to a real future Date, or null.
function sylResolveDate(month, day, year, today) {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let y = year;
  if (y == null) {
    y = today.getFullYear();
    // No year written: it is the next time this date comes around, allowing
    // a month of grace for an exam that was last week.
    const cand = new Date(y, month, day);
    if (cand.getTime() < today.getTime() - 30 * 864e5) {
      // Long past: only plausible as next term's date if it is close enough
      // (a March date seen in October). A September date seen in October is
      // just old news, not next September.
      const next = new Date(y + 1, month, day);
      if (next.getTime() - today.getTime() > 210 * 864e5) return null;
      y += 1;
    }
  } else if (y < 100) y += 2000;
  const d = new Date(y, month, day);
  if (d.getMonth() !== month) return null;               // 31 Feb and friends
  if (d.getTime() < today.getTime()) return null;         // already past
  if (d.getTime() > today.getTime() + 430 * 864e5) return null; // not this school year
  return d;
}

// Returns [{ date, key, label, kind }] sorted soonest first.
function parseSyllabusDates(text, today) {
  const ref = new Date(today); ref.setHours(0, 0, 0, 0);
  const out = [];
  const seen = new Set();
  const segments = String(text || '').split(/\n+|(?<=[.!?;])\s+(?=[A-Z])/);
  segments.forEach(raw => {
    const seg = raw.replace(/^[\s\-*•·●▪◦>]+/, '').trim();
    if (seg.length < 6 || seg.length > 400 || !SYL_WORK_RX.test(seg)) return;
    const found = [];
    const wordRx = new RegExp(`\\b${SYL_MONTH_RX}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'gi');
    let m;
    while ((m = wordRx.exec(seg))) {
      const d = sylResolveDate(SYL_MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]), m[3] ? Number(m[3]) : null, ref);
      if (d) found.push({ d, text: m[0] });
    }
    const numRx = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b(?!\s*(?:points?|pts?|%|of\b|credit))/gi;
    while ((m = numRx.exec(seg))) {
      const d = sylResolveDate(Number(m[1]) - 1, Number(m[2]), m[3] ? Number(m[3]) : null, ref);
      if (d) found.push({ d, text: m[0] });
    }
    if (!found.length) return;
    const kind = sylKindOf(seg);
    // One date: the line itself is the label, minus the date. Several dates
    // on one line ("Quizzes: Sep 15, Oct 6"): just the kind of work.
    let label = kind === 'Due' ? 'Due' : kind;
    if (found.length === 1) {
      const cleaned = seg.replace(found[0].text, ' ').replace(/\b(on|by)\s*$/i, '')
        .replace(/[\s,;:\-–—(]+$/g, '').replace(/^[\s,;:\-–—)]+/g, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned.length >= 3) label = cleaned.length > 90 ? cleaned.slice(0, 89) + '…' : cleaned;
    }
    found.forEach(f => {
      const key = ymd(f.d);
      const dedupe = `${key}|${kind}|${label.toLowerCase()}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push({ date: f.d, key, label: label.charAt(0).toUpperCase() + label.slice(1), kind });
    });
  });
  return out.sort((a, b) => a.date - b.date);
}

/* ---- App state: all classes ---------------------------------------------------- */
let sylDatesCache = { sig: '', list: [] };

function sylDateId(d) { return `${d.courseId}|${d.key}|${d.label}`; }
function sylHiddenList() { return Array.isArray(userPrefs.hiddenSyllabusDates) ? userPrefs.hiddenSyllabusDates : []; }
function sylShowOnCalendar() { return userPrefs.showSyllabusDates !== false; }

// Every found date, hidden ones included (flagged), soonest first.
function syllabusKeyDates() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sig = ymd(today) + '|' + (cachedSyllabi || []).map(s => `${s.course_id}:${(s.content || '').length}`).join(',');
  if (sylDatesCache.sig !== sig) {
    const list = [];
    (cachedSyllabi || []).forEach(s => {
      if (!s.content || !syllabusHasRealText(s.content)) return;
      const course = (syllabusCourses || []).find(c => String(c.id) === String(s.course_id));
      const courseName = cleanCourseName(course ? course.name : (s.course_name || 'Class'));
      parseSyllabusDates(s.content, today).forEach(d => list.push({ ...d, courseId: s.course_id, courseName }));
    });
    list.sort((a, b) => a.date - b.date);
    sylDatesCache = { sig, list };
  }
  const hidden = new Set(sylHiddenList());
  return sylDatesCache.list.map(d => ({ ...d, hidden: hidden.has(sylDateId(d)) }));
}

// The ones that show on the calendar: visible and switched on.
function syllabusDatesForKey(key) {
  if (!sylShowOnCalendar()) return [];
  return syllabusKeyDates().filter(d => !d.hidden && d.key === key);
}

function syllabusDayItemsHTML(key) {
  const items = syllabusDatesForKey(key);
  if (!items.length) return '';
  return items.map(d => `<div class="card syl-day-item">
      <div class="card-row"><div style="min-width:0;"><div class="card-title">${escapeHtml(d.label)}</div><div class="card-sub">${escapeHtml(d.courseName)} · from the syllabus</div></div><span class="badge badge-syl">${d.kind}</span></div>
    </div>`).join('');
}

// Purple dots on the month grid for days that have a syllabus date.
function decorateSyllabusDates() {
  const grid = document.getElementById('due-cal-grid');
  if (!grid || !sylShowOnCalendar()) return;
  const byKey = {};
  syllabusKeyDates().filter(d => !d.hidden).forEach(d => { (byKey[d.key] = byKey[d.key] || []).push(d); });
  grid.querySelectorAll('.cal-day[data-key]').forEach(cell => {
    const items = byKey[cell.dataset.key];
    const dots = cell.querySelector('.cal-day-dots');
    if (!items || !dots || dots.querySelector('.cal-day-syl-dot')) return;
    dots.insertAdjacentHTML('beforeend', `<div class="cal-day-syl-dot" title="${escapeHtml(items.map(i => i.label).join(' · '))}"></div>`);
  });
}

/* ---- Syllabus tab card -------------------------------------------------------- */
let sylDatesExpanded = false;

function renderSyllabusKeyDates() {
  const host = document.getElementById('syllabus-keydates');
  if (!host) return;
  const all = syllabusKeyDates();
  const visible = all.filter(d => !d.hidden);
  const hiddenCount = all.length - visible.length;
  if (!all.length) { host.innerHTML = ''; return; }
  const shown = sylDatesExpanded ? visible : visible.slice(0, 6);
  const fmt = d => `${SYL_SHORT_MONTHS[d.date.getMonth()]} ${d.date.getDate()}`;
  host.innerHTML = `<div class="card syl-dates">
    <div class="syl-dates-head">
      <div><div class="syl-dates-title">Key dates from your syllabi</div><div class="syl-dates-sub">Read from the text, so double-check the important ones.</div></div>
      <label class="syl-switch" title="Show these on the Upcoming calendar"><span>On Upcoming</span>
        <input type="checkbox" ${sylShowOnCalendar() ? 'checked' : ''} onchange="setSyllabusDatesOnCalendar(this.checked)"><span class="switch-track"></span><span class="switch-thumb"></span></label>
    </div>
    ${visible.length ? `<div class="syl-dates-list">${shown.map(d => `<div class="syl-date-row">
        <div class="syl-date-chip"><b>${d.date.getDate()}</b><span>${SYL_SHORT_MONTHS[d.date.getMonth()]}</span></div>
        <div class="syl-date-text"><div class="syl-date-label">${escapeHtml(d.label)}</div><div class="syl-date-sub">${escapeHtml(d.courseName)} · ${fmt(d)}</div></div>
        <span class="badge badge-syl">${d.kind}</span>
        <button class="syl-date-x" title="Not a real date - hide it" aria-label="Hide ${escapeHtml(d.label)}" data-id="${escapeHtml(sylDateId(d))}" onclick="hideSyllabusDate(this.dataset.id)">✕</button>
      </div>`).join('')}</div>` : '<div class="card-sub" style="margin-top:10px;">All the dates found are hidden.</div>'}
    <div class="syl-dates-foot">
      ${visible.length > 6 ? `<button type="button" class="syl-link" onclick="sylDatesExpanded=!sylDatesExpanded;renderSyllabusKeyDates()">${sylDatesExpanded ? 'Show fewer' : `Show all ${visible.length}`}</button>` : ''}
      ${hiddenCount ? `<button type="button" class="syl-link" onclick="restoreSyllabusDates()">Restore ${hiddenCount} hidden</button>` : ''}
    </div>
  </div>`;
}

function setSyllabusDatesOnCalendar(on) {
  userPrefs.showSyllabusDates = !!on;
  saveUserPrefs();
  renderDueCalendar();
  showReward(on ? 'Syllabus dates now show on Upcoming.' : 'Syllabus dates hidden from Upcoming.', 'calendar');
}
function hideSyllabusDate(id) {
  if (!sylHiddenList().includes(id)) userPrefs.hiddenSyllabusDates = [...sylHiddenList(), id];
  saveUserPrefs();
  onSyllabiChanged();
}
function restoreSyllabusDates() {
  userPrefs.hiddenSyllabusDates = [];
  saveUserPrefs();
  onSyllabiChanged();
}

// Called whenever the syllabus list (re)renders: refresh the card and the
// calendar, which may have drawn before the syllabi arrived.
function onSyllabiChanged() {
  renderSyllabusKeyDates();
  if (document.getElementById('due-cal-grid')) renderDueCalendar();
  refreshPageHeads('syllabus');
}
