/* ===========================
   ASSIGNMENT CHECKLIST CORE LOGIC (pure functions, no app state)
   Second module in the multi-file split. Everything here is a pure
   input -> output transform -- no cachedAssignments, no network calls, no
   DOM -- which is what made this cluster safe to pull out, same as
   coco-core.js before it. Imports its real dependencies from coco-core.js
   explicitly rather than relying on the global bridge, since that's the
   whole point of writing new code as real modules.
=========================== */

import { extractDescriptionSteps, cocoIsCoherentText, cocoNormalize } from './coco-core.js';

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function classifyAssignmentWork(a) {
  const type = (a.assignment_type || '').toLowerCase();
  const title = (a.title || '').toLowerCase();

  if (type.includes('quiz')) return 'content'; // unambiguous straight from Canvas
  if (type.includes('discussion')) return 'task'; // a written response to produce, not review material -- checked before title keywords so e.g. "Peer Review Discussion" isn't caught by the content regex's "review"

  if (/\b(essay|paper|project|proposal|problem set|lab report|presentation|draft|design|program|build)\b/.test(title)) return 'task';
  if (/\b(quiz|exam|midterm|final|test|reading|review|reflection)\b/.test(title)) return 'content';

  if (type === 'on_paper') return 'task';

  return 'ambiguous';
}

// Always available, no model required -- the checklist equivalent of
// quoting the syllabus or computing a plan straight from the assignment
// rows: never wrong about the one thing that actually matters (the dates),
// even if it's a less specific plan than the AI version would be.
export function deterministicChecklist(a, today) {
  const due = new Date(a.due_date); due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.max(0, Math.round((due - today) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.max(1, daysUntilDue);

  // No AI required for this -- naming the actual assignment and leaning on
  // its type (quiz/reading vs essay/project) turns "Do the work" into
  // something a student can actually act on, without needing coco.1 enabled.
  const rawTitle = (a.title || 'this assignment').trim();
  const shortTitle = rawTitle.length > 48 ? rawTitle.slice(0, 45).trim() + '…' : rawTitle;

  let templates;
  const realSteps = extractDescriptionSteps(a.description);
  if (realSteps.length >= 2) {
    // The description already lists the real requirements -- use those
    // directly instead of guessing generic steps from the assignment type.
    // Capped so the checklist stays skimmable rather than reprinting the
    // whole assignment, and wrapped with the read-first/notes/review
    // structure that makes it an actual guide, not just a copy of the list.
    // When there's more real content than fits, keep a couple of early
    // items for context but bias toward the TAIL of the list -- real
    // assignments consistently front-load background/tips and put the
    // actual deliverable ("What to Submit", the graded questions) last, so
    // a naive first-N cut silently drops the one part that matters most.
    const MAX_STEPS = 8;
    let selected;
    if (realSteps.length <= MAX_STEPS) {
      selected = realSteps;
    } else {
      const tailCount = Math.min(realSteps.length, Math.ceil(MAX_STEPS * 0.7));
      const headCount = MAX_STEPS - tailCount;
      selected = [...realSteps.slice(0, headCount), ...realSteps.slice(realSteps.length - tailCount)];
    }
    const capped = selected.map(s => s.length > 90 ? s.slice(0, 87).trim() + '…' : s);
    templates = [`Read through "${shortTitle}" once fully before starting`, ...capped];
    if (totalDays > 1) templates.push('Take notes as you go through each part above -- easier to write the final submission from notes than from scratch');
    templates.push('Review everything against the assignment description, then submit');
  } else {
    const workType = classifyAssignmentWork(a);
    if (workType === 'content') {
      if (totalDays <= 1) templates = [`Go through "${shortTitle}"`, 'Complete and submit'];
      else if (totalDays <= 3) templates = [`Go through "${shortTitle}"`, 'Review the key points', 'Complete and submit'];
      else templates = [`Go through "${shortTitle}"`, 'Take notes on the key points', 'Review before the deadline', 'Complete and submit'];
    } else if (workType === 'task') {
      if (totalDays <= 1) templates = [`Work on "${shortTitle}"`, 'Submit'];
      else if (totalDays <= 3) templates = [`Draft "${shortTitle}"`, 'Revise', 'Submit'];
      else if (totalDays <= 7) templates = [`Outline "${shortTitle}"`, 'Write a draft', 'Revise', 'Submit'];
      else templates = [`Outline "${shortTitle}"`, 'Research or gather materials', 'Write a draft', 'Revise', 'Final review', 'Submit'];
    } else if (totalDays <= 1) templates = [`Work on "${shortTitle}"`, 'Submit'];
    else if (totalDays <= 3) templates = [`Draft "${shortTitle}"`, 'Revise', 'Submit'];
    else if (totalDays <= 7) templates = [`Plan "${shortTitle}"`, 'Draft', 'Revise', 'Submit'];
    else templates = [`Plan "${shortTitle}"`, 'Research or gather materials', 'Draft', 'Revise', 'Final review', 'Submit'];
  }

  return templates.map((text, i) => {
    const frac = (i + 1) / templates.length;
    const dayOffset = Math.min(daysUntilDue, Math.round(frac * daysUntilDue));
    const d = new Date(today); d.setDate(d.getDate() + dayOffset);
    return { step_order: i, step_text: text, target_date: ymd(d) };
  });
}

export function parseChecklistLines(raw) {
  const steps = [];
  raw.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
    if (m) steps.push({ target_date: m[1], step_text: m[2].trim() });
  });
  return steps;
}

// The date-safety net: a step scheduled after the due date, or before today,
// or out of order, is worse than no plan at all -- it's the checklist
// equivalent of coco.1 planning mode's grounding checks, just for dates
// instead of facts.
export function verifyChecklistDates(steps, todayStr, dueStr) {
  if (!steps.length) return { ok: false, reason: 'no steps parsed' };
  let prev = null;
  for (const s of steps) {
    if (!s.target_date || !/^\d{4}-\d{2}-\d{2}$/.test(s.target_date)) return { ok: false, reason: `bad date format: ${s.target_date}` };
    if (s.target_date < todayStr) return { ok: false, reason: `step dated before today: ${s.target_date}` };
    if (s.target_date > dueStr) return { ok: false, reason: `step dated after due date: ${s.target_date}` };
    if (prev && s.target_date < prev) return { ok: false, reason: 'steps out of chronological order' };
    if (!s.step_text || s.step_text.trim().length < 3) return { ok: false, reason: 'empty or too-short step text' };
    prev = s.target_date;
  }
  return { ok: true, reason: '' };
}

// Catches the same failure classes seen elsewhere in coco.1: garbled/
// incoherent generation, and -- specific to this feature -- a checklist so
// generic it ignores a real description that was handed to it. If Canvas
// gave us an actual structured list of requirements, the generated steps
// should touch at least some of that real content, not just restate
// "work on it, then submit" in different words.
export function verifyChecklistContent(steps, a) {
  for (const s of steps) {
    if (!cocoIsCoherentText(s.step_text)) {
      return { ok: false, reason: `incoherent step text: ${s.step_text}` };
    }
  }
  const realSteps = extractDescriptionSteps(a.description);
  if (realSteps.length >= 2) {
    const descWords = [...new Set(cocoNormalize(realSteps.join(' ')).split(' ').filter(w => w.length > 5))];
    if (descWords.length > 3) {
      const allText = cocoNormalize(steps.map(s => s.step_text).join(' '));
      const overlap = descWords.filter(w => allText.includes(w)).length;
      if (overlap === 0) {
        return { ok: false, reason: 'checklist ignores the real description content' };
      }
    }
  }
  return { ok: true, reason: '' };
}
