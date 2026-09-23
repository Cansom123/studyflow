/* ===========================
   coco.1 VERIFICATION + DETERMINISTIC FALLBACKS (pure functions, no app state)
   Fifth module in the multi-file split, and the first one pulling from the
   bigger, more entangled coco.1 feature set (planning mode and grade tips).
   Every function here takes its context (`ctx`) as a plain parameter rather
   than reaching into cachedAssignments/cachedGrades/schoolAIEngine directly
   -- that separation (build a context object from real app state, then
   verify/generate from that object alone) is what made this cluster safe to
   pull out, same as the smaller coco-core.js cluster before it. The context
   BUILDERS (cocoPlanningContext, cocoGradeContext) still read live app
   state and stay in the classic script; only the pure verify/fallback half
   moves here.
=========================== */

import { cocoIsCoherentText, cocoNormalize, cocoExtractCourseCodes } from './coco-core.js';
import { dayDiff } from './format-utils.js';

// Text immediately following a mention of `title`, cut off at the next clause
// or the next assignment name. Without the cut, a later item's due date or
// weekday gets read as belonging to this one — which rejected good answers on
// the first version of these checks.
export function cocoClauseWindow(ans, title, ctx, span = 80) {
  const t = cocoNormalize(title);
  const idx = ans.indexOf(t);
  if (idx === -1) return null;
  let win = ans.slice(idx + t.length, idx + t.length + span);
  const cuts = [/[.;]/, /\bthen\b/, /\bnext\b/, /\balso\b/, /\bafter that\b/]
    .map(re => win.search(re)).filter(i => i >= 0);
  for (const other of [...ctx.overdue, ...ctx.upcoming, ...(ctx.itemDays || [])]) {
    if (!other.title) continue;
    const ot = cocoNormalize(other.title);
    if (ot === t) continue;
    const oi = win.indexOf(ot);
    if (oi >= 0) cuts.push(oi);
  }
  return cuts.length ? win.slice(0, Math.min(...cuts)) : win;
}

// Returns { ok, reason }. `reason` is for logging/eval, never shown to students.
export function cocoVerifyPlanning(answer, ctx) {
  if (!cocoIsCoherentText(answer)) {
    return { ok: false, reason: 'incoherent/garbled generation' };
  }

  const haystack = cocoNormalize(ctx.text);
  const ans = cocoNormalize(answer);

  // 1. Fabricated course code. The strongest signal available: the model
  //    naming a class the student isn't taking.
  for (const code of cocoExtractCourseCodes(answer)) {
    const spaced = cocoNormalize(`${code.alpha} ${code.num}`);
    const tight = cocoNormalize(`${code.alpha}${code.num}`);
    if (!haystack.includes(spaced) && !haystack.includes(tight)) {
      return { ok: false, reason: `fabricated course code: ${code.raw}` };
    }
  }

  // 2. Contradicting the overdue list. "You're all caught up" when something
  //    is genuinely late is both wrong and actively harmful.
  if (ctx.overdue.length > 0 &&
      /(all caught up|nothing (is )?overdue|no overdue|nothing (is )?late|you'?re (all )?set|nothing past due)/i.test(answer)) {
    return { ok: false, reason: 'claims caught up while work is overdue' };
  }

  // 3. Quoted phrases must be real — but only ones that actually look like an
  //    assignment title. Emphasis ("your \"must do\" today") and encouragement
  //    ("\"You've got this\"") are legitimately invented, so a naive check here
  //    rejects good answers. Require a title-shaped quote: capitalized, of some
  //    length, and not addressing the student directly.
  const quoted = answer.match(/"([^"]{8,60})"/g) || [];
  for (const q of quoted) {
    const inner = q.slice(1, -1).trim();
    if (!/^[A-Z]/.test(inner)) continue;                  // lowercase → emphasis, not a title
    if (/\b(you|your|you're|i|we|my|me|us)\b/i.test(inner)) continue; // addressed to the student
    if (!haystack.includes(cocoNormalize(inner))) {
      return { ok: false, reason: `quoted text not in context: ${q}` };
    }
  }

  // 4. Weekday the student has nothing on. Caught in adversarial testing: the
  //    model translates an ISO date into the wrong day name ("Chem review on
  //    Friday" for a Thursday block). Sending someone to study on the wrong
  //    day is a concrete harm, and the real weekday set is known exactly.
  if (ctx.validWeekdays && ctx.validWeekdays.size) {
    const mentioned = answer.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi) || [];
    for (const day of mentioned) {
      if (!ctx.validWeekdays.has(day.toLowerCase())) {
        return { ok: false, reason: `weekday with nothing scheduled: ${day}` };
      }
    }
  }

  // 5. Overdue work described as merely due. Also from adversarial testing:
  //    "You've got a Reading Reflection due today" for something a day late.
  //    Understating lateness is the one direction that costs the student marks.
  //    The window has to stop at the next clause or assignment — a naive scan
  //    reads the NEXT item's "due today" as if it belonged to this one, which
  //    rejected perfectly good answers on the first cut of this check.
  for (const a of ctx.overdue) {
    if (!a.title) continue;
    const win = cocoClauseWindow(ans, a.title, ctx, 90);
    if (win === null) continue;
    if (/\boverdue\b|\blate\b|past due/.test(win)) continue; // correctly described
    if (/\bdue (today|tomorrow|in \d+ day)/.test(win)) {
      return { ok: false, reason: `overdue item described as upcoming: ${a.title}` };
    }
  }

  // 7. Claims about late penalties or whether submitting still counts. coco.1
  //    is never given the course's grading policy, so any such claim is
  //    invented — and the discouraging direction ("submitting now won't change
  //    the grade", seen in testing) could talk a student out of turning work in
  //    at all. Only the futility framing is blocked; "get it in to avoid late
  //    penalties" is generic encouragement and stays allowed.
  if (/\b(won'?t|will not|doesn'?t|does not|no longer)\b[^.]{0,40}\b(change|affect|count|matter|help|improve)\b[^.]{0,25}\b(grade|score|mark|points)\b/i.test(answer) ||
      /\b(no|little)\s+(point|use|sense)\b[^.]{0,25}\bsubmit/i.test(answer) ||
      /\btoo late to\b[^.]{0,25}\b(submit|turn in|hand in|bother)\b/i.test(answer) ||
      /\bwon'?t get (any )?credit\b/i.test(answer)) {
    return { ok: false, reason: 'invented claim about late penalty / grading policy' };
  }

  // 6. Weekday attached to the WRONG item. Check 4 only proves a weekday exists
  //    somewhere in the schedule, so "Chem review on Thursday" slipped through
  //    when Thursday belonged to a different assignment. Sending a student to
  //    study on the wrong day is the concrete harm worth catching here.
  for (const item of (ctx.itemDays || [])) {
    const win = cocoClauseWindow(ans, item.title, ctx, 70);
    if (win === null) continue;
    const m = win.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m && m[1] !== item.day) {
      return { ok: false, reason: `${item.title} is on ${item.day}, answer said ${m[1]}` };
    }
  }

  // 8. Grade percentage that isn't in the real data. Shaped as NN% or NN.N%,
  //    which never collides with "3 days" / "2 blocks" style mentions, so this
  //    can't misfire on legitimate scheduling language.
  const pctMentions = answer.match(/\b\d{1,3}(?:\.\d+)?%/g) || [];
  for (const pct of pctMentions) {
    if (!haystack.includes(cocoNormalize(pct))) {
      return { ok: false, reason: `grade percentage not in real data: ${pct}` };
    }
  }

  return { ok: true, reason: '' };
}

/* ---- Deterministic fallback ------------------------------------------
   The planning-mode counterpart to quoting the syllabus: a plan composed
   from the real assignment rows with no model involved, so it cannot be
   wrong about what exists or when it's due. Less warm than a generated
   answer, but always true — the right thing to show when the model's
   version fails verification. */
export function cocoDeterministicPlan(ctx) {
  const name = a => `${a.title}${a.course ? ` (${a.course})` : ''}`;
  const parts = [];

  if (ctx.overdue.length) {
    const first = ctx.overdue[0];
    const days = Math.abs(dayDiff(first.due_date, ctx.today));
    parts.push(`Start with ${name(first)} - it's ${days} day${days !== 1 ? 's' : ''} overdue, so it's the most urgent thing on your list.`);
    if (ctx.overdue.length > 1) {
      parts.push(`You have ${ctx.overdue.length - 1} other overdue item${ctx.overdue.length - 1 !== 1 ? 's' : ''} after that.`);
    }
  }

  const next = ctx.upcoming.filter(a => a.due_date).slice(0, 2);
  if (next.length) {
    const described = next.map(a => {
      const d = dayDiff(a.due_date, ctx.today);
      const when = d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`;
      return `${name(a)}, ${when}`;
    });
    parts.push(ctx.overdue.length
      ? `Then: ${described.join('; then ')}.`
      : `Start with ${described.join('; then ')}.`);
  }

  // Flag a course that's grade-at-risk and also has work coming up, so a
  // struggling class gets called out even when its next due date isn't the
  // soonest -- due-date order alone would silently bury it.
  if (ctx.grades && ctx.grades.length) {
    const atRisk = ctx.grades.find(g => {
      const pct = g.current_score != null ? g.current_score : g.final_score;
      return pct != null && pct < 70;
    });
    // Assignments and grades both come from the same Canvas course.name in
    // the common case, but a fallback path in the sync function can source
    // a grade's course name differently -- normalize instead of trusting
    // exact string equality, or a real at-risk grade silently never surfaces.
    const norm = s => (s || '').trim().toLowerCase();
    if (atRisk && ctx.upcoming.some(a => norm(a.course) === norm(atRisk.course_name))) {
      const pct = atRisk.current_score != null ? atRisk.current_score : atRisk.final_score;
      parts.push(`Also worth extra time: you're at ${pct}% in ${atRisk.course_name}, so don't let that slip.`);
    }
  }

  if (!parts.length) return "You don't have any dated work coming up right now.";
  return parts.join(' ');
}

export function cocoVerifyGradeTips(answer, ctx) {
  if (!cocoIsCoherentText(answer)) {
    return { ok: false, reason: 'incoherent/garbled generation' };
  }

  const haystack = cocoNormalize(ctx.text);

  for (const code of cocoExtractCourseCodes(answer)) {
    const spaced = cocoNormalize(`${code.alpha} ${code.num}`);
    const tight = cocoNormalize(`${code.alpha}${code.num}`);
    if (!haystack.includes(spaced) && !haystack.includes(tight)) {
      return { ok: false, reason: `fabricated course code: ${code.raw}` };
    }
  }

  const quoted = answer.match(/"([^"]{8,60})"/g) || [];
  for (const q of quoted) {
    const inner = q.slice(1, -1).trim();
    if (!/^[A-Z]/.test(inner)) continue;
    if (/\b(you|your|you're|i|we|my|me|us)\b/i.test(inner)) continue;
    if (!haystack.includes(cocoNormalize(inner))) {
      return { ok: false, reason: `quoted text not in context: ${q}` };
    }
  }

  const pctMentions = answer.match(/\b\d{1,3}(?:\.\d+)?%/g) || [];
  for (const pct of pctMentions) {
    if (!haystack.includes(cocoNormalize(pct))) {
      return { ok: false, reason: `grade percentage not in real data: ${pct}` };
    }
  }

  // The one failure mode unique to this mode: telling a student to submit or
  // redo something when the data says nothing is actually still open. That's
  // not just wrong, it wastes the exact effort this feature is supposed to
  // point somewhere useful.
  if (ctx.allClosed && /\b(submit|turn in|hand in|resubmit|redo|retake)\b/i.test(answer)) {
    return { ok: false, reason: 'suggested submitting work when nothing is open' };
  }

  // Real incident: coco recommended a not-yet-due, not-yet-covered
  // assignment as the next thing to do just because it looked "quick".
  // These titles are only in the context so the model knows they exist and
  // is told explicitly not to push them -- if the model names one anyway,
  // treat that as a failure and fall back to the deterministic answer,
  // which never recommends undated work.
  const answerNorm = cocoNormalize(answer);
  for (const u of (ctx.undatedOpenWork || [])) {
    if (answerNorm.includes(cocoNormalize(u.title))) {
      return { ok: false, reason: `recommended undated/not-yet-covered work: ${u.title}` };
    }
  }

  // Difficulty must come from a real description, never a guess. If the
  // model calls an item easy/hard/etc. anywhere in the answer while ALSO
  // naming one with no synced description, that's a fabricated difficulty
  // claim -- coarse (whole-answer, not per-sentence) on purpose, since the
  // failure being guarded against is exactly this codebase's worst kind:
  // stating something confidently that isn't actually known.
  // "Hard to say/tell/know/gauge/judge" is honest uncertainty about
  // difficulty, not a difficulty claim -- strip that phrasing before
  // checking, or it would wrongly punish coco for admitting it doesn't know.
  const difficultyCheckText = answer.replace(/\b(?:hard|difficult)\s+to\s+(?:say|tell|know|gauge|judge)\b/gi, '');
  const claimsDifficulty = /\b(difficult|difficulty|hard|harder|hardest|easy|easier|easiest|tough|toughest|challenging|simple|straightforward|complex|complicated)\b/i.test(difficultyCheckText);
  if (claimsDifficulty) {
    for (const u of (ctx.undescribedOpenWork || [])) {
      if (answerNorm.includes(cocoNormalize(u.title))) {
        return { ok: false, reason: `claimed difficulty for an item with no description: ${u.title}` };
      }
    }
  }

  // Real incident: the model justified recommending an item using a points
  // comparison ("worth more than the other one") while ignoring that a
  // different item was actually due sooner -- points aren't due-date
  // urgency. If the answer argues from a points comparison and doesn't even
  // mention the item that's genuinely soonest due, that's the same wrong
  // reasoning shape happening again.
  if (ctx.openWork.length >= 2) {
    const soonest = ctx.openWork[0];
    const pointsComparisonLanguage = /\bworth more\b[^.]*\bthan\b|\bmore weight\b|\d+\s*(?:vs\.?|versus)\s*\d+\s*(?:pts|points)/i.test(answer);
    if (pointsComparisonLanguage && !answerNorm.includes(cocoNormalize(soonest.title))) {
      return { ok: false, reason: `used a points comparison to justify skipping the actual soonest-due item: ${soonest.title}` };
    }
  }

  return { ok: true, reason: '' };
}

// Wording pass: the original version was true but read like a report --
// short, disconnected facts stapled together with periods ("You're at X%.
// Y cost you points. Z is next, worth W points. No description exists.").
// That's a lot to land on someone at once. This keeps every real fact (the
// grade, the actual weak spot, the actual next-due item, its real points
// value, whether a description exists) but connects them into fewer,
// warmer sentences and closes on something genuinely earned rather than
// generic hype -- tied to whatever's actually true about the situation,
// not a stock "you've got this!" tacked on regardless of context.
export function gradeToneOpening(pct, letter, courseName) {
  const gradeStr = pct != null ? `${pct}%${letter ? ' (' + letter + ')' : ''}` : null;
  if (gradeStr == null) return `Let's take a look at ${courseName}.`;
  if (pct >= 90) return `You're doing great in ${courseName}, sitting at ${gradeStr} right now.`;
  if (pct >= 80) return `You're in solid shape in ${courseName} at ${gradeStr}.`;
  if (pct >= 70) return `You're holding a decent ${gradeStr} in ${courseName}, with real room to push it higher.`;
  return `You're at ${gradeStr} in ${courseName} right now -- the good news is there's a clear, specific way to bring it up.`;
}

// Deterministic (not random) pick from real data -- same assignment always
// gets the same phrasing, but different students/assignments land on
// different ones instead of everyone hearing "move the needle" verbatim.
export function stablePick(list, seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export const LOW_PERFORMER_PHRASES = [
  (worst) => `so a little review on that one could genuinely move the needle`,
  (worst) => `so revisiting that topic is probably the highest-leverage thing you can do right now`,
  (worst) => `so going back over that material could make a real difference`,
  (worst) => `so that's the one area most worth actually spending time on`,
  (worst) => `so brushing up there could turn this grade around faster than anything else open`,
];
export const MISSING_PHRASES = [
  (n) => `closing that out is an easy win`,
  (n) => `turning that in is one of the simplest ways to boost this grade`,
  (n) => `getting that submitted is low-effort, high-reward`,
  (n) => `that's essentially free points sitting on the table until it's turned in`,
];
export const CLOSING_BOTH = [
  `Tackle those two in order and this grade has real room to climb.`,
  `Handle those two and there's a solid path back up from here.`,
  `Both of those are concrete and doable -- work through them in order and you'll feel the difference.`,
];
export const CLOSING_WEAK_SPOT_ONLY = [
  `That's a specific, fixable thing -- not a mystery.`,
  `Nothing vague about it -- you know exactly what to work on.`,
  `That's one clear target, not a dozen scattered ones.`,
];
export const CLOSING_OPEN_WORK_ONLY = [
  `You're not behind on anything here, just staying ahead of it.`,
  `Nothing urgent gone wrong yet -- this is just good timing.`,
  `You're in front of this one, not chasing it.`,
];
export const CLOSING_ALL_GOOD = [
  `Overall you're in a good spot in this one.`,
  `This class is in good shape overall.`,
  `Nothing pulling this one down right now.`,
];

export function cocoDeterministicGradeTips(ctx) {
  const parts = [gradeToneOpening(ctx.pct, ctx.letter, ctx.courseName)];

  let hasWeakSpot = false;
  if (ctx.lowPerformers.length) {
    hasWeakSpot = true;
    const worst = ctx.lowPerformers[0];
    const reasonPhrase = stablePick(LOW_PERFORMER_PHRASES, worst.title + worst.score)(worst);
    parts.push(`${worst.title} is what's pulling it down the most (you scored ${worst.score}/${worst.points_possible} there), ${reasonPhrase}.`);
  }
  if (ctx.missing.length) {
    hasWeakSpot = true;
    const missingPhrase = stablePick(MISSING_PHRASES, ctx.courseName + ctx.missing.length)(ctx.missing.length);
    parts.push(`${ctx.missing.length} assignment${ctx.missing.length !== 1 ? 's are' : ' is'} still sitting as missing, which counts as a zero until it's turned in or excused -- ${missingPhrase}.`);
  }

  if (ctx.allClosed) {
    parts.push(`Nothing gradable is still open in this class right now, so the best move is asking your teacher about extra credit or a regrade, and carrying what you've learned into what's next.`);
  } else if (ctx.openWork.length) {
    const next = ctx.openWork[0];
    // Due-date proximity is the real actionable signal -- a higher point
    // value doesn't help if there's nothing to act on yet because it isn't
    // due for weeks. Real incident: coco told a student to prioritize a
    // 104-point item over a 75-point one purely by points, when the
    // 75-point item was actually due much sooner and gettable-ahead-of.
    const daysOut = Math.round((new Date(next.due_date).getTime() - Date.now()) / 86400000);
    const urgencyClause = daysOut <= 0
      ? `is due today (or already past due)`
      : daysOut === 1
        ? `is due tomorrow`
        : daysOut <= 3
          ? `is due in ${daysOut} days`
          : `is the soonest of what's left, due in ${daysOut} days`;

    const ptsClause = next.points_possible ? `, worth ${next.points_possible} points` : '';

    // Difficulty is only ever real when there's an actual description to
    // point at -- never guessed, never claimed outright, since a
    // deterministic template has no way to genuinely read and judge one.
    const descClause = next.descriptionExcerpt
      ? `, and it has a description on Canvas worth reading so you know exactly what it involves`
      : `; there's no description synced for it yet, so it's hard to say exactly what it'll take, but getting ahead of it now beats scrambling later`;

    const lead = hasWeakSpot ? `Once that's sorted, ${next.title}` : `${next.title}`;
    parts.push(`${lead} ${urgencyClause}${ptsClause}${descClause}.`);
  }

  // A closing note earned by what's actually true here, not filler --
  // varies with the real situation instead of repeating the same line, and
  // rotates within each situation too so the exact same case doesn't always
  // land on the exact same sentence.
  const closingSeed = ctx.courseName + (ctx.pct != null ? ctx.pct : '');
  if (ctx.allClosed && !hasWeakSpot) {
    parts.push(stablePick(CLOSING_ALL_GOOD, closingSeed));
  } else if (hasWeakSpot && ctx.openWork.length) {
    parts.push(stablePick(CLOSING_BOTH, closingSeed));
  } else if (hasWeakSpot) {
    parts.push(stablePick(CLOSING_WEAK_SPOT_ONLY, closingSeed));
  } else if (ctx.openWork.length) {
    parts.push(stablePick(CLOSING_OPEN_WORK_ONLY, closingSeed));
  }

  return parts.join(' ') || "There isn't enough graded data synced yet to point to anything specific.";
}
