/* ===========================
   coco.1 CORE LOGIC (pure functions, no app state)
   Extracted from index.html as the first real JS module in the multi-file
   split. Every function here is a pure input -> output transform with no
   dependency on cachedAssignments, USER_ID, the DOM, or any other app
   global -- that's exactly what made this cluster safe to pull out first.

   This is loaded as a real ES module (see the <script type="module"> bridge
   near the end of index.html), then re-attached to `window` so the rest of
   the (still-classic-script) app can keep calling these exactly as it
   always has, with zero call-site changes. That bridge is temporary
   scaffolding for an incremental migration, not the end state.
=========================== */

import { escapeRegex } from './format-utils.js';

/* ---- 1. RETRIEVAL ---------------------------------------------------- */

// Words students use vs. words syllabi use. Each group is bidirectional: any
// term in a group matches a line containing any other term in that group.
// This is what lets "what if I skip class" find "unexcused absences".
export const COCO_TOPICS = [
  ['attendance','attend','attends','attending','absence','absences','absent','miss','missed','missing','skip','skipped','skipping','present','showing','show','class','classes','lecture','lectures','session','sessions'],
  ['late','overdue','deadline','deadlines','past','extension','extensions','tardy','delay','delayed','after'],
  ['grade','grades','grading','graded','point','points','percent','percentage','weight','weighted','weighting','worth','score','scores','scoring','curve','curved','gpa','letter','mark','marks','breakdown','count','counts','counted','counting','portion','toward','towards','drop','dropped','lowest','highest'],
  ['exam','exams','test','tests','testing','midterm','midterms','final','finals','quiz','quizzes','assessment','assessments'],
  ['homework','assignment','assignments','hw','problem','problems','set','sets','submit','submitted','submission','submissions','turn','turning','upload','uploaded','due'],
  ['essay','essays','paper','papers','writing','written','report','reports'],
  ['book','books','textbook','textbooks','edition','editions','reading','readings','material','materials','required'],
  ['office','hours','availability','available','appointment','appointments','meet','meeting'],
  ['email','emails','contact','contacting','reach','reaching','message','messaging'],
  ['laptop','laptops','computer','computers','device','devices','phone','phones','electronics','electronic','technology','tablet','tablets'],
  ['cheat','cheating','plagiarism','plagiarize','plagiarized','dishonesty','dishonest','integrity','copying','copied','collaboration','collaborate'],
  ['sick','sickness','illness','ill','medical','doctor','emergency','emergencies','excuse','excused','documented','documentation'],
  ['participation','participate','discussion','discussions','engage','engagement'],
  ['makeup','make','retake','redo','resubmit','second','another','chance'],
  ['group','groups','team','teams','partner','partners','collaborative','project','projects'],
  ['instructor','professor','teacher','prof','faculty','ta','assistant'],
  ['extra','credit','bonus','additional','optional'],
  ['disability','disabilities','disabled','accommodation','accommodations','accommodate','accessibility','accessible','ada','impairment','special','needs'],
  ['lab','labs','laboratory','recitation','recitations','section','sections','studio','workshop','practicum'],
  ['safety','goggles','equipment','protective','gear','mandatory','required','wear','wearing'],
  ['quiz','quizzes','online','portal','canvas','website','platform','submit','submission'],
  ['schedule','calendar','date','dates','day','days','week','weeks','time','times','when','deadline'],
];

export function cocoExpandTerms(keywords) {
  const expanded = new Set(keywords);
  keywords.forEach(k => {
    COCO_TOPICS.forEach(group => {
      if (group.includes(k)) group.forEach(t => expanded.add(t));
    });
  });
  return [...expanded];
}

// Splits a syllabus into retrievable units. Lines are the natural unit here
// (syllabi are line-oriented), but very long lines get sentence-split so we
// don't hand the model a whole paragraph when one sentence would do.
export function cocoSegments(contextText) {
  const segments = [];
  (contextText || '').split('\n').forEach(line => {
    // Drop list markers so quoted answers read as sentences, not raw list items.
    const trimmed = line.trim().replace(/^[•·▪◦\-*–—]\s*/, '');
    if (!trimmed) return;
    if (trimmed.length <= 220) { segments.push(trimmed); return; }
    const parts = trimmed.match(/[^.!?]+[.!?]*/g) || [trimmed];
    let buf = '';
    parts.forEach(p => {
      if ((buf + p).length > 220 && buf) { segments.push(buf.trim()); buf = p; }
      else buf += p;
    });
    if (buf.trim()) segments.push(buf.trim());
  });
  return segments;
}

// Scores each segment against the question. Two ideas do the work here:
//   - Direct keyword hits outweigh synonym-expansion hits (3x), so a line
//     literally about the topic beats one that merely shares a related word.
//   - Rare terms outweigh common ones (IDF). Without this, a generic word like
//     "class" — which appears in half a syllabus — drowns out the actual signal,
//     e.g. "skip class" wrongly matching "...put away during class."
// Relies on `extractAskKeywords`, which still lives as a global in
// index.html's classic script (it depends on ASK_STOPWORDS, not yet moved
// into a module) -- safe, since this module only executes after that
// script has already run, and this is only ever called later still, from
// user-triggered event handlers.
export function cocoRetrieve(question, contextText, limit = 3) {
  const direct = extractAskKeywords(question);
  if (direct.length === 0 || !contextText) return [];
  const expanded = cocoExpandTerms(direct);
  const segments = cocoSegments(contextText);
  if (segments.length === 0) return [];
  const hit = (text, term) => new RegExp('\\b' + escapeRegex(term) + '\\b', 'i').test(text);

  // How discriminating is each term within THIS document?
  const idf = {};
  expanded.forEach(term => {
    const df = segments.filter(seg => hit(seg, term)).length;
    idf[term] = Math.log(segments.length / (1 + df)) + 0.35;
  });

  return segments
    .map(seg => {
      // Syllabi front-load their topic ("Attendance is...", "Missed exams: ...",
      // "Late homework loses..."). A term in that leading position means the line
      // is ABOUT that topic, versus mentioning it in passing ("...during class").
      const head = seg.includes(':') ? seg.slice(0, seg.indexOf(':') + 1) : seg.slice(0, 40);
      let score = 0;
      expanded.forEach(term => {
        if (!hit(seg, term)) return;
        const weight = Math.max(idf[term], 0.05);
        const positional = hit(head, term) ? 2.5 : 1;
        score += (direct.includes(term) ? 3 : 1) * weight * positional;
      });
      return { seg, score };
    })
    .filter(s => s.score > 0.15)
    .sort((a, b) => b.score - a.score || a.seg.length - b.seg.length)
    .slice(0, limit);
}

/* ---- 2 + 3. GENERATE, THEN VERIFY ------------------------------------ */

export const COCO_UNKNOWN = "The syllabus doesn't cover that - worth asking your instructor.";

// Real incident: the on-device model occasionally degenerates into fluent-
// looking but meaningless token soup -- mixed scripts, fused non-words, code
// fragments -- instead of failing outright, and it reached a student
// verbatim because none of the grounding checks below catch it (garbage text
// has no numbers/course-codes/quotes to be wrong about, so it sails through).
// This is a cheap, local sanity gate that runs before any of those checks,
// shared by every coco.1 answer path (syllabus Q&A, planning, grade tips).
export function cocoIsCoherentText(text) {
  const s = (text || '').trim();
  if (!s) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  // A real sentence-length answer should hit several common English function
  // words; gibberish token-soup almost never does.
  const STOPWORDS = /^(the|a|an|to|of|in|on|is|are|was|were|you|your|it|this|that|and|or|for|with|at|be|so|not|no|do|does|did|can|could|would|should|will|if|as|from|by|out|up|its|it's|get|got|has|have)$/i;
  const stopwordHits = words.filter(w => STOPWORDS.test(w.replace(/[^a-zA-Z']/g, ''))).length;
  if (stopwordHits < Math.min(3, Math.ceil(words.length * 0.08))) return false;

  // coco only ever answers in English -- any real volume of non-Latin script
  // mixed in is a strong signal of degenerated output, not a real reply.
  const nonLatin = (s.match(/[^\x00-\x7F‘’“”–—]/g) || []).length;
  if (nonLatin / s.length > 0.05) return false;

  // Real words don't run this long -- concatenated-token garbage does
  // ("workaroundgalementmultiline", "ProtectITS_dash").
  if (words.some(w => w.replace(/[^a-zA-Z]/g, '').length > 22)) return false;

  // Code-shaped fragments have no place in conversational advice.
  if (/=>|\(\)|::|\{[^}]*\}|\b[A-Z][a-z]+[A-Z]\w*\(/.test(s)) return false;

  return true;
}

// Every number in an answer must exist in the source we gave the model.
// This is the single highest-value check: fabricated specifics (a "90% for an A"
// that was never written down) are the most damaging kind of wrong answer.
export function cocoIsGrounded(answer, sourceText) {
  const nums = (answer.match(/\d+(?:\.\d+)?/g) || []);
  if (nums.length === 0) return true;
  const src = sourceText.replace(/\s+/g, ' ');
  return nums.every(n => src.includes(n));
}

// Tokens shaped like a course code ("CHEM 101") but that are really ordinary
// phrases a planner would legitimately invent ("Chapter 12", "Week 3").
export const COCO_NOT_COURSE_CODES = new Set([
  'chapter', 'chapters', 'week', 'weeks', 'day', 'days', 'part', 'parts',
  'section', 'sections', 'unit', 'units', 'page', 'pages', 'step', 'steps',
  'round', 'rounds', 'problem', 'problems', 'question', 'questions',
  'number', 'no', 'session', 'sessions', 'minute', 'minutes', 'hour', 'hours',
  'top', 'level', 'phase', 'block', 'blocks', 'set', 'sets', 'module', 'modules',
]);

// "CHEM 101", "Bio210", "CS 301" — distinctive enough that a code absent from
// the student's real course list is a fabrication, not a paraphrase.
// The leading capital is load-bearing: without it "2 blocks of 30 minutes"
// parses "of 30" as a course code. Course codes are essentially never written
// lowercase, so requiring the capital costs almost no recall and removes a
// whole class of false positives that a word blocklist could never cover.
export function cocoExtractCourseCodes(text) {
  const out = [];
  const re = /\b([A-Z][A-Za-z]{1,7})\s?(\d{2,4})\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (COCO_NOT_COURSE_CODES.has(m[1].toLowerCase())) continue;
    // A number immediately followed by "%" is a grade, not a course code --
    // without this, "At 92%..." (capitalized only because it starts the
    // sentence) false-positives as a fabricated course "AT 92".
    if (text[m.index + m[0].length] === '%') continue;
    out.push({ raw: m[0], alpha: m[1], num: m[2] });
  }
  return out;
}

export function cocoNormalize(s) { return (s || '').toLowerCase().replace(/\s+/g, ' '); }

// Difficulty is a genuine unknown without real information -- guessing it
// from assignment type keywords ("exam" = hard, "quiz" = easy) produced the
// same flat, repetitive line every time and was often just wrong. The only
// real signal we have for difficulty is the assignment's own description
// (synced from Canvas as plain text), which the model can actually read and
// reason about. When there's no description, we're honest that difficulty
// is unknown and reason about points value instead -- a real number, not a
// guess -- since a higher-point item has more effect on the grade regardless
// of how hard it turns out to be.
export function assignmentDescriptionExcerpt(a, maxLen) {
  const d = (a.description || '').trim();
  if (!d) return '';
  return d.length > maxLen ? d.slice(0, maxLen).trim() + '...' : d;
}

// Real incident-driven: generic "Outline / Draft / Revise / Submit" steps
// looked like a plan but told the student nothing they didn't already know.
// When Canvas gives us an actual description with its own bullet/numbered
// list of requirements, that list IS the real plan -- pulling it out
// directly beats guessing generic steps from the assignment's type. Handles
// both "• text" on one line and Canvas's common split form where the bullet
// glyph sits alone on its own line and the item's text follows on the next
// line(s) until a blank line or the next bullet.
export function extractDescriptionSteps(description) {
  if (!description) return [];
  const BULLET_CHARS = new Set(['•', '➝', '✓', '✔', '①', '②', '③', '④', '⑤', '❌', '➤', '▪']);
  const BULLET_START = /^([•➝✓✔①②③④⑤❌➤▪]|[-*]\s|\d+[.)]\s)/;
  const lines = description.split('\n').map(l => l.trim());
  const steps = [];
  let buffer = '';
  let inBullet = false;

  function flush() {
    const cleaned = buffer.replace(BULLET_START, '').trim();
    if (cleaned.length >= 8 && cleaned.length <= 400) steps.push(cleaned);
    buffer = '';
  }

  for (const line of lines) {
    if (!line) {
      if (inBullet) { flush(); inBullet = false; }
      continue;
    }
    if (BULLET_CHARS.has(line) || /^\d+[.)]$/.test(line)) {
      if (inBullet) flush();
      inBullet = true;
      buffer = '';
      continue;
    }
    if (BULLET_START.test(line)) {
      if (inBullet) flush();
      inBullet = true;
      buffer = line;
      continue;
    }
    if (inBullet) {
      buffer += (buffer ? ' ' : '') + line;
    }
  }
  if (inBullet) flush();
  return steps;
}
