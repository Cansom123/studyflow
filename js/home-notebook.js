/* ===========================
   NOTEBOOK HOME (redesign step 3)
   The parts of Home that are new in the notebook layout:
   - a tear-off calendar date next to the greeting
   - one plain sentence under the greeting (what's due, the busiest day, the
     next exam)
   - coco.1's sticky note: a tip worked out from the same data Home shows
     (no AI call), with buttons that ask coco.1 for a real plan
   - "The next 14 days": a solid bar per day, as tall as the estimated hours
     of work due that day (the same estimates as Today's 3), exam days in red
   - the report card's average
   Today's 3, the exam radar and the report card rows fill their own spots
   (js/today-three.js, js/exam-radar.js, homeReportCardHTML). Runs after them
   on every renderHome, and again when the exams finish loading.
=========================== */

(function initNotebookHome() {
  const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const SPAN = 14;
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const setHTML = (el, html) => { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } };
  const midnight = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const isFeed = () => typeof canvasMode !== 'undefined' && canvasMode === 'feed';

  // Every open assignment and exam in the next 14 days, by day, with the
  // estimated minutes of work due that day.
  function homeDays() {
    const today = midnight(new Date());
    const studied = studiedMinutesByAssignment(cachedStudySessions || [], studySessionSec, cleanCourseName);
    const history = [...(cachedAssignments || []), ...(cachedGradedAssignments || [])];
    const out = [];
    for (let i = 0; i < SPAN; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      out.push({ i, date: d, key: ymd(d), items: [], min: 0, exams: [] });
    }
    const overdue = [];
    (cachedAssignments || []).forEach(a => {
      if (!a.due_date || isAssignmentChecked(a, doneSet)) return;
      const diff = Math.round((midnight(a.due_date) - today) / 864e5);
      if (diff < 0) { overdue.push(a); return; }
      if (diff >= SPAN) return;
      out[diff].items.push(a);
      out[diff].min += estimateMinutes(a, history, studied, cleanCourseName).left;
    });
    const exams = typeof examRadarList === 'function' ? examRadarList() : [];
    exams.forEach(e => { if (e.daysUntil >= 0 && e.daysUntil < SPAN) out[e.daysUntil].exams.push(e); });
    overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    return { days: out, overdue, exams };
  }

  // Overdue work Priority and Today's 3 still rank (up to a week late); older
  // than that, the note doesn't push it, so the two never disagree.
  const recentOverdue = list => list.filter(a => dayDiff(a.due_date) >= -7);

  const dayName = d => (d.i === 0 ? 'today' : d.i === 1 ? 'tomorrow'
    : d.i < 7 ? d.date.toLocaleDateString('en-US', { weekday: 'long' })
    : d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
  const examWhen = e => (e.daysUntil === 0 ? 'today' : e.daysUntil === 1 ? 'tomorrow' : `in ${e.daysUntil} days`);
  const examName = e => escapeHtml(clip(e.title, 40));
  const fmtH = min => (min < 60 ? `${min}m` : `${Math.round(min / 6) / 10}h`);

  function renderCal() {
    const now = new Date();
    setHTML(document.getElementById('home-cal'),
      `<span class="hm-cal-dow">${DOW[now.getDay()]}</span><span class="hm-cal-num">${now.getDate()}</span><span class="hm-cal-mon">${MON[now.getMonth()]}</span>`);
  }

  // "9 things due in the next two weeks. Your busiest day is Thursday, and
  // Exam 2 is that day."
  function renderSummary({ days, overdue, exams }) {
    const n = days.reduce((s, d) => s + d.items.length, 0);
    const parts = [];
    if (overdue.length) {
      const word = isFeed() ? 'running late' : 'overdue';
      const count = `<b>${overdue.length} ${overdue.length === 1 ? 'thing' : 'things'} ${word}</b>`;
      parts.push(recentOverdue(overdue).length ? `${count}, so start there.` : `${count} from more than a week ago.`);
    }
    parts.push(n ? `<b>${n} ${n === 1 ? 'thing' : 'things'}</b> due in the next two weeks.` : 'Nothing due in the next two weeks.');
    const busy = days.filter(d => d.items.length).sort((a, b) => b.min - a.min || a.i - b.i)[0];
    if (busy && n > 1) {
      const exam = busy.exams[0];
      parts.push(`Your busiest day is <b>${dayName(busy)}</b>${exam ? `, and <b>${examName(exam)}</b> is that day.` : '.'}`);
      if (!exam && exams[0] && exams[0].daysUntil < SPAN) parts.push(`<b>${examName(exams[0])}</b> is ${examWhen(exams[0])}.`);
    } else if (exams[0] && exams[0].daysUntil < SPAN) {
      parts.push(`<b>${examName(exams[0])}</b> is ${examWhen(exams[0])}.`);
    }
    setHTML(document.getElementById('home-hero-sub'), parts.join(' '));
  }

  // coco.1's sticky note: one concrete next step, from the same data as Home.
  function renderNote({ overdue, exams }) {
    const el = document.getElementById('home-note');
    if (!el) return;
    let picks = [];
    try {
      if (typeof pickToday3 === 'function') picks = pickToday3(today3Ranked(), cachedAssignments || [], today3ItemKey, today3Saved(), today3IsDone);
    } catch (e) { picks = []; }
    const first = picks.find(a => !today3IsDone(a));
    const soonExam = exams.find(e => e.daysUntil <= 7);
    const t = a => `<b>${escapeHtml(clip(a.title, 60))}</b>`;
    const late = recentOverdue(overdue);
    let tip;
    if (late.length) {
      tip = isFeed()
        ? `You said ${t(late[0])} is still in progress. Finish it first and the rest of the week opens up.`
        : `Start with ${t(late[0])}. It's past due, and getting it in first takes the pressure off everything else.`;
    } else if (soonExam) {
      const planned = typeof plannedSessionCount === 'function' ? plannedSessionCount(soonExam, cachedStudySessions) : 0;
      const canPlan = !planned && typeof planStudyDays === 'function' && planStudyDays(soonExam).length > 0;
      tip = `<b>${examName(soonExam)}</b> is ${examWhen(soonExam)}. `
        + (first ? `Finish ${t(first)} today so the days before it are free to study.` : 'A good day to review for it.')
        + (canPlan ? ' You can plan study sessions for it below.' : '');
    } else if (first) {
      const studied = studiedMinutesByAssignment(cachedStudySessions || [], studySessionSec, cleanCourseName);
      const history = [...(cachedAssignments || []), ...(cachedGradedAssignments || [])];
      const est = estimateMinutes(first, history, studied, cleanCourseName);
      tip = `Start with ${t(first)}. ${today3Reason(first)}, about ${fmtEstimate(est.left)}.`;
    } else {
      tip = 'Nothing due soon. A good day to get ahead or review.';
    }
    el.hidden = false;
    setHTML(el, `<span class="hm-note-who"><i></i>coco.1</span>
      <p class="hm-note-tip">${tip}</p>
      <div class="hm-note-ask">
        <button type="button" onclick="homeAskCoco('Plan my week')">Plan my week</button>
        <button type="button" onclick="homeAskCoco('')">Ask coco.1</button>
      </div>`);
  }

  // The next 14 days as solid bars: height = estimated hours of work due.
  function renderTide({ days }) {
    const el = document.getElementById('home-week');
    if (!el) return;
    const maxMin = Math.max(300, ...days.map(d => d.min));
    const hours = Math.ceil(maxMin / 60);
    const cells = days.map(d => {
      const exam = d.exams[0];
      const label = d.i === 0 ? 'TODAY' : d.i < 7 ? DOW[d.date.getDay()] : `${d.date.getMonth() + 1}/${d.date.getDate()}`;
      // share of the plot's height (the plot is shorter on phones)
      const h = d.min ? Math.max(0.04, d.min / (hours * 60)) : exam ? 0.04 : 0;
      const when = d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const tip = `${when}: ${d.items.length ? `${d.items.length} due, about ${fmtEstimate(d.min)} of work` : 'nothing due'}`
        + (d.exams.length ? `. Exam: ${d.exams.map(e => e.title).join(', ')}` : '');
      return `<button type="button" class="td-day${d.i === 0 ? ' today' : ''}${exam ? ' exam' : ''}" onclick="jumpToDueDay('${d.key}')" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">
        <span class="td-plot">
          ${exam ? `<span class="td-pin">${escapeHtml(clip(exam.title, 16))}</span>` : ''}
          ${d.min ? `<span class="td-hrs">${fmtH(d.min)}</span>` : ''}
          ${h ? `<i class="td-bar" style="height:calc(var(--td-plot-h) * ${h.toFixed(3)})"></i>` : ''}
        </span>
        <span class="td-lab"><span class="td-lab-l">${label}</span><span class="td-lab-s">${d.date.getDate()}</span></span>
      </button>`;
    }).join('');
    setHTML(el, `
      <div class="hm-sec-h">
        <h2 id="home-tide-title">The next 14 days</h2>
        <div class="hm-legend"><span><i></i>Hours of work due</span><span><i class="x"></i>Exam</span><span><i class="m"></i>Today</span></div>
      </div>
      <div class="td-grid" style="--td-hours:${hours}">${cells}</div>`);
  }

  function renderAverage() {
    const el = document.getElementById('home-rc-avg');
    if (!el) return;
    const { avg, count } = averageGrade(cachedGrades || []);
    el.textContent = avg == null ? 'Open grades' : `Average ${avg.toFixed(1)}% · ${count} class${count === 1 ? '' : 'es'}`;
  }

  function renderNotebookHome() {
    if (!document.getElementById('home-cal')) return;
    const data = homeDays();
    renderCal();
    renderSummary(data);
    renderNote(data);
    renderTide(data);
    renderAverage();
  }

  // From coco.1's note to the planner on Priority: "Plan my week" asks right
  // away, "Ask coco.1" opens the box to type a question.
  window.homeAskCoco = function (q) {
    jumpTo('priority');
    const input = document.getElementById('planning-ai-input');
    if (!input) return;
    if (q) { input.value = q; if (typeof askCocoPlanning === 'function') askCocoPlanning(); }
    setTimeout(() => {
      document.getElementById('planning-ai-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!q) input.focus({ preventScroll: true });
    }, 80);
  };

  const origHome = window.renderHome;
  if (typeof origHome === 'function') {
    window.renderHome = function () {
      const r = origHome.apply(this, arguments);
      try { renderNotebookHome(); } catch (e) { console.warn('[home]', e); }
      return r;
    };
  }
  // Exams load after Home first draws; redraw the bars and the note then.
  const origExams = window.renderExamRadar;
  if (typeof origExams === 'function') {
    window.renderExamRadar = function () {
      const r = origExams.apply(this, arguments);
      try { renderNotebookHome(); } catch (e) { console.warn('[home]', e); }
      return r;
    };
  }
})();
