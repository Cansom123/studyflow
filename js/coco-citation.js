import { cocoRetrieve } from './coco-core.js';

// Which source passage to show as the citation for a given answer.
// Prefers a passage the answer quotes verbatim, then one that's a substring
// of the answer, and falls back to the first candidate passage.
export function cocoPickCitation(answer, passages) {
  const a = answer.trim().toLowerCase();
  const verbatim = passages.find(p => p.toLowerCase().includes(a) && a.length > 8);
  if (verbatim) return verbatim;
  const contains = passages.find(p => a.includes(p.toLowerCase()));
  if (contains) return contains;
  return passages[0] || '';
}

export function findBestPassage(question, contextText) {
  const hits = cocoRetrieve(question, contextText, 1);
  return hits.length ? hits[0].seg : '';
}

export function findCitationText(answer, question, contextText) {
  if (answer && contextText && contextText.toLowerCase().includes(answer.trim().toLowerCase()) && answer.trim().length > 8) {
    return answer.trim();
  }
  return findBestPassage(question, contextText) || answer || '';
}
