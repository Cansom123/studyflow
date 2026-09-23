/* ===========================
   TEXT SEARCH / KEYWORD UTILITIES (pure functions, no app state)
   Fourth module in the multi-file split. Used by coco.1's syllabus
   retrieval (cocoRetrieve, in coco-core.js) and by the plain-text search
   features elsewhere in the app (syllabus search, notes search) that
   highlight matched terms.
=========================== */

import { escapeHtml, escapeRegex } from './format-utils.js';

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
