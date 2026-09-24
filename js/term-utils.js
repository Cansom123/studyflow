import { extractSectionCode } from './format-utils.js';

export function getSchoolYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fallYear = month >= 8 ? year : year - 1;
  const springYear = fallYear + 1;
  const fy2 = String(fallYear).slice(-2);
  const sy2 = String(springYear).slice(-2);
  return {
    fallYear, springYear, fy2, sy2,
    currentFall: 'FAL' + fy2,
    currentSpring: 'SPR' + sy2,
    schoolYearShort: fy2 + '/' + sy2,
  };
}

export function isCurrentYearCourse(name, sy) {
  if (!name) return false;
  const n = name.toUpperCase();
  // Match FAL/SPR/SUM/WIN abbreviations, full 4-digit years, or 2-digit year codes
  return (
    n.includes('FAL' + sy.fy2) || n.includes('SPR' + sy.sy2) ||
    n.includes('SUM' + sy.sy2) || n.includes('WIN' + sy.sy2) ||
    n.includes(String(sy.fallYear)) || n.includes(String(sy.springYear)) ||
    n.includes(sy.fy2 + '/' + sy.sy2) || n.includes(sy.fy2 + '-' + sy.sy2)
  );
}

// Returns true only when a course name contains a term tag whose end date is in the past.
// Courses without any FAL/SPR/SUM/WIN tag (e.g. "Speech and Debate") return false —
// they are treated as active because we cannot determine their term from the name alone.
export function isCourseTermConcluded(name, now = new Date()) {
  const m = (name || '').toUpperCase().match(/\b(FAL|SPR|SUM|WIN)(\d{2})\b/);
  if (!m) return false;
  const endMonth = { FAL: 11, SPR: 4, SUM: 7, WIN: 1 };
  const termEnd = new Date(2000 + parseInt(m[2], 10), endMonth[m[1]] ?? 11, 28);
  return termEnd < now;
}

// Filters raw Canvas courses down to the current school year (courses with
// no term tag are always kept -- their term can't be determined from the
// name alone) and works out which ones should start pre-checked: directly
// in the user's existing selection, or the current-semester equivalent of
// a concluded selection (same section code, different semester tag).
// Returns [{ course, preSelected }] so the caller can build DOM nodes
// without redoing this logic.
export function computeSelectableCourses(courses, existingIds, concludedCodes, schoolYear) {
  const filtered = (courses || []).filter(c => {
    const n = (c.name || '').toUpperCase();
    const hasTag = /\b(FAL|SPR|SUM|WIN)\d{2}\b/.test(n);
    if (!hasTag) return true;
    return isCurrentYearCourse(c.name, schoolYear) && !isCourseTermConcluded(c.name);
  });

  return filtered.map(course => {
    const sectionCode = extractSectionCode(course.name);
    const preSelected = existingIds.has(String(course.id)) ||
      (sectionCode !== null && concludedCodes.has(sectionCode));
    return { course, preSelected };
  });
}
