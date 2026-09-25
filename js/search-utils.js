/* ===========================
   TEXT SEARCH / KEYWORD UTILITIES (pure functions, no app state)
   Fourth module in the multi-file split. Used by coco.1's syllabus
   retrieval (cocoRetrieve, in coco-core.js) and by the plain-text search
   features elsewhere in the app (syllabus search, notes search) that
   highlight matched terms.
=========================== */

import { escapeHtml, escapeRegex, cleanCourseName } from './format-utils.js';

const ASK_STOPWORDS = new Set([
  'what','whats',"what's",'is','are','was','were','the','a','an','of','for','my','me','in','on','to','at',
  'does','do','did','how','when','where','who','which','why','can','i','you','your','about','tell','please',
  'this','that','it','and','or','be','will','have','has','with','if','so','there','any','our','we','us',
  'much','many','need','needed','some','out','into','from','also'
]);

export function extractAskKeywords(q) {
  return q.toLowerCase()
    .replace(/[^\w\s%]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !ASK_STOPWORDS.has(w));
}

export function highlightAskKeywords(text, keywords) {
  let escaped = escapeHtml(text);
  keywords.forEach(k => {
    const rx = new RegExp('(' + escapeRegex(k) + ')', 'ig');
    escaped = escaped.replace(rx, '<mark>$1</mark>');
  });
  return escaped;
}

// Wraps every literal (case-insensitive) occurrence of `query` in raw text
// with a numbered <mark id="syl-mark-N"> so the caller can build a
// prev/next match list from the DOM. Shared by the syllabus inline search
// box and the "jump to source passage" citation click (previously
// duplicated verbatim between literalSearchWithinSyllabus and
// highlightExactPassage). Returns escaped HTML either way, even with no
// query or no matches, so the caller can always set it directly.
export function markLiteralMatchesHTML(rawText, query) {
  const escapedRaw = escapeHtml(rawText);
  if (!query) return { html: escapedRaw, matchCount: 0 };
  const rx = new RegExp(escapeRegex(query), 'ig');
  let n = 0;
  const html = escapedRaw.replace(rx, match => `<mark id="syl-mark-${n++}">${match}</mark>`);
  return { html, matchCount: n };
}

// Answers a free-text "ask my syllabi" query by keyword-matching lines
// across every syllabus and picking the top 3 by match count (ties broken
// by shorter line first). Returns { html, top } where `top` is the
// candidate list the caller should store for later "jump to source
// passage" clicks -- or `null` when there was nothing to update (too-vague
// query, or no candidates found), matching the original code's behavior
// of leaving the previous result list alone in those cases rather than
// clearing it.
export function syllabiKeywordAnswer(cachedSyllabi, syllabusCourses, q) {
  const keywords = extractAskKeywords(q);

  if (keywords.length === 0) {
    return {
      html: `<div class="card-sub">Try adding a word or two about the topic - e.g. "grading policy" or "late work".</div>`,
      top: null,
    };
  }

  const candidates = [];
  cachedSyllabi.forEach(s => {
    if (!s.content) return;
    const course = syllabusCourses.find(c => String(c.id) === String(s.course_id));
    const courseName = course ? cleanCourseName(course.name) : (s.course_name || 'Course');
    s.content.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const matched = keywords.filter(k => new RegExp('\\b' + escapeRegex(k) + '\\b', 'i').test(line));
      if (matched.length === 0) return;
      candidates.push({ courseId: s.course_id, courseName, line, score: matched.length, len: line.length });
    });
  });

  if (candidates.length === 0) {
    return {
      html: `<div class="card-sub">Couldn't find anything about that in your syllabi. Try different words, or check the syllabus yourself if it's still missing.</div>`,
      top: null,
    };
  }

  candidates.sort((a, b) => b.score - a.score || a.len - b.len);
  const top = candidates.slice(0, 3);

  const html = `
    <div class="ask-answer-text">${highlightAskKeywords(top[0].line, keywords)}</div>
    <button class="ask-source-chip" onclick="openSyllabusAtPassage(0)">
      <span class="ask-source-icon">📄</span>
      <span>Source: ${escapeHtml(top[0].courseName)}</span>
      <span class="ask-source-arrow">→</span>
    </button>
    ${top.length > 1 ? `
    <div class="ask-more-label">Also mentioned in</div>
    ${top.slice(1).map((c, i) => `
      <button class="ask-source-chip-secondary" onclick="openSyllabusAtPassage(${i + 1})">
        <div class="ask-source-chip-course">${escapeHtml(c.courseName)}</div>
        <div class="ask-source-snippet">${highlightAskKeywords(c.line, keywords)}</div>
      </button>`).join('')}
    ` : ''}
  `;
  return { html, top };
}

// Keyword-ranks every line of the syllabus against the query and re-renders
// the whole passage with matching lines' keywords highlighted, each <mark>
// tagged with data-rank so the caller can build a best-match-first
// prev/next list. status is 'vague' (query had no real keywords), 'none'
// (no line matched), or 'found'. In the 'vague'/'none' cases html is just
// the escaped, unmarked raw text -- matching the original's behavior of
// falling back to plain text rather than leaving the view untouched.
export function rankedKeywordSearchHTML(raw, q) {
  const keywords = extractAskKeywords(q);
  if (keywords.length === 0) {
    return { html: escapeHtml(raw), status: 'vague' };
  }

  const lines = raw.split('\n');
  const scored = lines
    .map((line, i) => ({
      i, line,
      score: keywords.filter(k => new RegExp('\\b' + escapeRegex(k) + '\\b', 'i').test(line)).length,
    }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);

  if (scored.length === 0) {
    return { html: escapeHtml(raw), status: 'none' };
  }

  const rankOf = new Map(scored.map((row, rank) => [row.i, rank]));
  let markCounter = 0;
  const html = lines.map((line, i) => {
    if (!rankOf.has(i)) return escapeHtml(line);
    let h = escapeHtml(line);
    keywords.forEach(k => {
      const rx = new RegExp('(' + escapeRegex(k) + ')', 'ig');
      h = h.replace(rx, m => `<mark id="syl-mark-${markCounter++}" data-rank="${rankOf.get(i)}">${m}</mark>`);
    });
    return h;
  }).join('\n');

  return { html, status: 'found' };
}
