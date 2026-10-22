/* ===========================
   TODAY'S 3 (Home)
   The three things that matter today, each with a time estimate, instead
   of a long list of due dates. Picked from the Priority ranking once a day
   and kept steady (checking one off doesn't pull in a replacement; "Pick 3
   more" does, once all three are done). Takes the place of "Up next".
   Logic lives in js/today-core.js; works the same with the calendar link
   (Quick start) and Full sync.
=========================== */

const today3Key = () => `sf_today3_${USER_ID}_${ymd(new Date())}`;
const today3ItemKey = a => `${a.title}||${a.course}`;
const today3IsDone = a => !!(a.completed || doneSet.has(today3ItemKey(a)));

function today3Saved() {
  try { return JSON.parse(localStorage.getItem(today3Key()) || 'null'); } catch (e) { return null; }
}
function today3Save(keys) {
  try { localStorage.setItem(today3Key(), JSON.stringify(keys)); } catch (e) {}
}

function today3Ranked() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const open = (cachedAssignments || []).filter(a => !today3IsDone(a));
  return computePriorityScores(open, today, userGoals, userPrefs.priorityGoalBoost ?? 50, cachedGrades || []);
}

function today3Reason(a) {
  if (a.feed_late) return 'Running late';
  const d = a.due_date ? dayDiff(a.due_date) : null;
  if (d == null) return 'No due date';
  if (d < 0) return `${Math.abs(d)} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return 'Due ' + new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'long' });
  return 'Due ' + new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderToday3() {
  const main = document.querySelector('#page-home .home-col-main');
  const upnext = document.getElementById('home-upnext');
  if (!main || !upnext) return;
  let host = document.getElementById('home-today3');
  if (!host) {
    host = document.createElement('section');
    host.id = 'home-today3';
    host.className = 'today3';
    host.setAttribute('aria-labelledby', 'today3-title');
    main.insertBefore(host, main.firstElementChild);
  }

  const ranked = today3Ranked();
  const saved = today3Saved();
  const picks = pickToday3(ranked, cachedAssignments || [], today3ItemKey, saved, today3IsDone);
  if (!picks.length) {
    host.hidden = true;
    main.classList.remove('has-today3');
    return;
  }
  const keys = picks.map(today3ItemKey);
  if (!saved || keys.join('\n') !== saved.join('\n')) today3Save(keys);

  const studied = studiedMinutesByAssignment(cachedStudySessions || [], studySessionSec, cleanCourseName);
  const history = [...(cachedAssignments || []), ...(cachedGradedAssignments || [])];
  const rows = picks.map(a => ({ a, done: today3IsDone(a), est: estimateMinutes(a, history, studied, cleanCourseName) }));
  const left = rows.filter(r => !r.done).reduce((n, r) => n + r.est.left, 0);
  const doneCount = rows.filter(r => r.done).length;
  const allDone = doneCount === rows.length;
  const more = allDone && ranked.some(a => !keys.includes(today3ItemKey(a)));

  host.hidden = false;
  main.classList.add('has-today3');
  host.innerHTML = `
    <div class="t3-head">
      <div>
        <h2 class="t3-title" id="today3-title">Today's ${rows.length === 3 ? '3' : rows.length}</h2>
        <div class="t3-sub">${allDone ? 'All done for today. Nice work.' : `About ${fmtEstimate(left)} of work${doneCount ? ` left · ${doneCount} of ${rows.length} done` : ''}`}</div>
      </div>
      <div class="t3-dots" aria-hidden="true">${rows.map(r => `<i class="${r.done ? 'on' : ''}"></i>`).join('')}</div>
    </div>
    <ol class="t3-list">
      ${rows.map(({ a, done, est }, i) => {
        const k = doneKey(a);
        const time = est.spent > 0 && !done ? `${fmtEstimate(est.left)} left` : fmtEstimate(est.minutes);
        return `<li class="t3-item${done ? ' done' : ''}${a.feed_late ? ' late' : ''}" data-done-key="${k}">
          <button type="button" class="done-check t3-check${done ? ' checked' : ''}" onclick="toggleDone('${k}',this)" title="${done ? 'Mark as not done' : 'Mark as done'}" aria-label="${done ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(a.title)}"><span class="done-check-icon">✓</span><span class="t3-num">${i + 1}</span></button>
          <div class="t3-body">
            <button type="button" class="t3-name" onclick="openAssignmentDetail('${a.id}')">${escapeHtml(a.title)}</button>
            <div class="t3-meta">${escapeHtml(cleanCourseName(a.course || ''))} · <span class="t3-why">${today3Reason(a)}</span></div>
          </div>
          <span class="t3-time" title="${escapeHtml(estimateSourceText(est))}">~${time}</span>
          ${done ? '' : `<button type="button" class="t3-go" onclick="focusOnAssignment('${a.id}', this)" title="Start a focus timer" aria-label="Start a focus timer for ${escapeHtml(a.title)}"><svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 4.8v10.4l8.2-5.2z"/></svg></button>`}
        </li>`;
      }).join('')}
    </ol>
    ${more ? `<button type="button" class="t3-more" onclick="today3PickMore()">Pick 3 more</button>` : ''}
    <div class="t3-note">Times are estimates. ${rows.some(r => r.est.source !== 'default') ? 'They come from your study timer.' : 'They get more accurate as you use the study timer.'}</div>`;
}

// Today's picks and estimates as plain data, for Choom (so its advice
// matches what Home shows).
function today3Summary() {
  const picks = pickToday3(today3Ranked(), cachedAssignments || [], today3ItemKey, today3Saved(), today3IsDone);
  const studied = studiedMinutesByAssignment(cachedStudySessions || [], studySessionSec, cleanCourseName);
  const history = [...(cachedAssignments || []), ...(cachedGradedAssignments || [])];
  return picks.map(a => ({ title: a.title, course: a.course, minutes: estimateMinutes(a, history, studied, cleanCourseName).left, done: today3IsDone(a) }));
}

// After finishing all three: today's picks start over from the ranking.
function today3PickMore() {
  today3Save([]);
  renderToday3();
}

(function hookToday3() {
  const orig = window.renderHome;
  if (typeof orig !== 'function') return;
  window.renderHome = function () {
    const r = orig.apply(this, arguments);
    try { renderToday3(); } catch (e) { console.warn('[today3]', e); }
    return r;
  };
})();
