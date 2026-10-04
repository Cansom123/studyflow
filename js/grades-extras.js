/* ===========================
   GRADES EXTRAS
   - Trend line per class: Canvas only stores the current grade, not its
     history, so the trend is rebuilt from the graded work itself -- the
     running percentage after each graded assignment, in due-date order
     (missing work counts as 0, like Canvas does).
   - "What if" calculator in each class's detail panel: pick an upcoming
     assignment, slide the score you might get, see the new grade; and the
     reverse, what you would need to reach the next grade.
   The calculator treats the class grade as (points earned so far) over
   (points possible so far), using Canvas's own current grade as the
   baseline. That is exact for points-based classes and a close estimate for
   weighted ones, and the panel says so.
=========================== */
const GRADE_LETTER_STEPS = [
  [97, 'A+'], [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'], [0, 'F'],
];
function gradeLetterFromPct(p) { return (GRADE_LETTER_STEPS.find(([min]) => p >= min) || [0, 'F'])[1]; }

function gradeNormName(s) { return (s || '').trim().toLowerCase(); }

/* ---- Trend ------------------------------------------------------------------ */
// [{ t: ms, pct }] -- one point per graded due date, cumulative.
function gradeTrendPoints(courseName) {
  const now = Date.now();
  const rows = (cachedGradedAssignments || []).filter(a => gradeNormName(a.course) === gradeNormName(courseName) && a.due_date && a.points_possible)
    .map(a => ({ t: new Date(a.due_date).getTime(), pts: Number(a.points_possible), got: a.score != null ? Number(a.score) : (a.is_missing && !a.is_excused && new Date(a.due_date).getTime() < now ? 0 : null) }))
    .filter(r => r.got != null && !isNaN(r.got) && !isNaN(r.pts) && r.pts > 0)
    .sort((a, b) => a.t - b.t);
  const out = [];
  let earned = 0, possible = 0;
  rows.forEach(r => {
    earned += r.got; possible += r.pts;
    const pct = (earned / possible) * 100;
    const last = out[out.length - 1];
    if (last && last.t === r.t) last.pct = pct; else out.push({ t: r.t, pct });
  });
  return out;
}

function gradeSparkPath(points, w, h, pad) {
  const ys = points.map(p => p.pct);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; } // never exaggerate a flat line
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const span = Math.max(1, t1 - t0);
  const xy = points.map(p => [pad + ((p.t - t0) / span) * (w - pad * 2), pad + (1 - (p.pct - lo) / (hi - lo)) * (h - pad * 2)]);
  return { xy, line: xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') };
}

function gradeTrendDirection(points) {
  const d = points[points.length - 1].pct - points[0].pct;
  const recent = points.length > 3 ? points[points.length - 1].pct - points[points.length - 4].pct : d;
  return { total: d, recent, dir: recent > 0.4 ? 'up' : recent < -0.4 ? 'down' : 'flat' };
}

// Small line on each grade card.
function gradeSparkHTML(courseName) {
  const pts = gradeTrendPoints(courseName);
  if (pts.length < 3) return '';
  const { line, xy } = gradeSparkPath(pts, 100, 26, 3);
  const { recent, dir } = gradeTrendDirection(pts);
  const [ex, ey] = xy[xy.length - 1];
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
  return `<div class="grade-spark ${dir}" title="Running grade after each graded assignment">
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true"><path class="gs-line" d="${line}" pathLength="1"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.2" class="gs-end"/></svg>
    <span class="gs-delta">${arrow} ${Math.abs(recent).toFixed(1)}</span>
  </div>`;
}

// Larger chart for the detail panel.
function gradeTrendDetailHTML(courseName) {
  const pts = gradeTrendPoints(courseName);
  if (pts.length < 3) return '';
  const W = 320, H = 90;
  const { line, xy } = gradeSparkPath(pts, W, H, 6);
  const { total, dir } = gradeTrendDirection(pts);
  const first = pts[0], last = pts[pts.length - 1];
  const fmt = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
  const [ex, ey] = xy[xy.length - 1];
  return `<div class="gt ${dir}">
    <div class="gt-head"><span class="gt-title">Trend</span><span class="gt-note">${total >= 0 ? '+' : '−'}${Math.abs(total).toFixed(1)} points since ${fmt(first.t)}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Running grade over time"><path class="gt-area" d="${area}"/><path class="gt-line" d="${line}" pathLength="1"/>
      ${xy.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === xy.length - 1 ? 3.4 : 2}" class="gt-dot"><title>${fmt(pts[i].t)}: ${pts[i].pct.toFixed(1)}%</title></circle>`).join('')}</svg>
    <div class="gt-axis"><span>${fmt(first.t)} · ${first.pct.toFixed(1)}%</span><span>${fmt(last.t)} · ${last.pct.toFixed(1)}%</span></div>
  </div>`;
}

/* ---- What if ---------------------------------------------------------------- */
function gradeWhatIfModel(courseName) {
  const grade = (cachedGrades || []).find(g => gradeNormName(g.course_name) === gradeNormName(courseName));
  const pct = grade ? (grade.current_score != null ? parseFloat(grade.current_score) : parseFloat(grade.final_score)) : NaN;
  const now = Date.now();
  let possible = 0;
  (cachedGradedAssignments || []).forEach(a => {
    if (gradeNormName(a.course) !== gradeNormName(courseName) || !a.points_possible) return;
    const counts = a.score != null || (a.is_missing && !a.is_excused && a.due_date && new Date(a.due_date).getTime() < now);
    if (counts) possible += Number(a.points_possible) || 0;
  });
  const open = (cachedAssignments || []).filter(a => gradeNormName(a.course) === gradeNormName(courseName) && !a.completed && a.points_possible)
    .sort((a, b) => (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity));
  return { pct, possible, earned: isNaN(pct) ? 0 : (pct / 100) * possible, open, ok: !isNaN(pct) && possible > 0 };
}

// New percentage after scoring `got` of `pts` on top of the baseline.
function gradeAfter(model, got, pts) {
  return ((model.earned + got) / (model.possible + pts)) * 100;
}
// Score (as a percent of `pts`) needed to land exactly on `target`.
function gradeNeeded(model, target, pts) {
  return ((target / 100) * (model.possible + pts) - model.earned) / pts * 100;
}

function renderGradeWhatIf(courseName) {
  const body = document.getElementById('grade-detail-body');
  if (!body) return;
  body.querySelectorAll('.gt, .gw').forEach(el => el.remove());
  const trend = gradeTrendDetailHTML(courseName);
  const model = gradeWhatIfModel(courseName);
  let calc = '';
  if (model.ok) {
    const options = model.open.map((a, i) => `<option value="${i}">${escapeHtml(a.title)} (${Number(a.points_possible)} pts)</option>`).join('');
    calc = `<div class="gw card" data-course="${escapeHtml(courseName)}">
      <div class="gw-title">What if…</div>
      <label class="gw-label" for="gw-item">I get a score on</label>
      <select class="settings-input gw-select" id="gw-item" onchange="updateGradeWhatIf()">${options}<option value="custom">Something else worth…</option></select>
      <div class="gw-custom" id="gw-custom" style="display:none;"><input class="settings-input" type="number" id="gw-pts" min="1" max="1000" value="50" oninput="updateGradeWhatIf()" aria-label="Points the assignment is worth"><span>points</span></div>
      <label class="gw-label" for="gw-score">and score</label>
      <div class="gw-slider"><input type="range" id="gw-score" min="0" max="100" step="1" value="90" oninput="updateGradeWhatIf()"><b id="gw-score-val">90%</b></div>
      <div class="gw-result" id="gw-result" aria-live="polite"></div>
      <div class="gw-targets-label">To reach…</div>
      <div class="gw-targets" id="gw-targets"></div>
      <div class="gw-note">An estimate from your synced points (${model.possible} so far). Weighted classes can differ a little.</div>
    </div>`;
  } else if (!isNaN(model.pct)) {
    calc = `<div class="gw card"><div class="gw-title">What if…</div><div class="gw-note" style="margin:0;">The what-if calculator needs a few graded assignments synced first. Sync Canvas after your next grade posts.</div></div>`;
  }
  const first = body.firstElementChild;
  const html = trend + calc;
  if (first) first.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
  if (model.ok) updateGradeWhatIf();
}

function currentWhatIfPoints(model) {
  const sel = document.getElementById('gw-item');
  const custom = document.getElementById('gw-custom');
  const isCustom = sel && sel.value === 'custom';
  if (custom) custom.style.display = isCustom ? 'flex' : 'none';
  if (isCustom) return Math.max(1, Math.min(1000, Number(document.getElementById('gw-pts').value) || 50));
  const a = model.open[Number(sel && sel.value) || 0];
  return a ? Number(a.points_possible) : 50;
}

function updateGradeWhatIf() {
  const card = document.querySelector('#grade-detail-body .gw[data-course]');
  if (!card) return;
  const model = gradeWhatIfModel(card.dataset.course);
  if (!model.ok) return;
  const pts = currentWhatIfPoints(model);
  const scorePct = Number(document.getElementById('gw-score').value);
  document.getElementById('gw-score-val').textContent = scorePct + '%';
  const after = gradeAfter(model, (scorePct / 100) * pts, pts);
  const diff = after - model.pct;
  const dir = Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down';
  const l0 = gradeLetterFromPct(model.pct), l1 = gradeLetterFromPct(after);
  document.getElementById('gw-result').innerHTML = `
    <div class="gw-big"><span>${model.pct.toFixed(1)}%</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h11M11 6l4 4-4 4"/></svg><b class="${dir}">${after.toFixed(1)}%</b></div>
    <div class="gw-sub ${dir}">${dir === 'flat' ? 'No change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} points`}${l0 !== l1 ? ` · ${l0} → ${l1}` : ` · stays ${l1}`}</div>`;

  // The next few grade cut-offs above where you are now.
  const picked = [97, 93, 90, 87, 83, 80, 77, 73, 70].filter(t => t > model.pct).slice(-3).reverse(); // nearest cut-off first
  document.getElementById('gw-targets').innerHTML = picked.length ? picked.map(t => {
    const need = gradeNeeded(model, t, pts);
    const label = gradeLetterFromPct(t);
    const text = need > 100 ? 'out of reach with this one' : need <= 0 ? 'already there' : `needs ${Math.ceil(need)}%`;
    return `<div class="gw-target${need > 100 ? ' far' : ''}"><b>${label}</b><span>${t}%</span><em>${text}</em></div>`;
  }).join('') : '<div class="gw-target"><b>🎉</b><em>You are above every cut-off here. Keep it up.</em></div>';
}
