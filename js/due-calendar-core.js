import { ymd } from './checklist-core.js';

// Builds the Upcoming tab's month-grid cells (including the leading/trailing
// days from adjacent months needed to fill full weeks), with each cell's
// assignment count and study-session flag already computed. Returns plain
// data -- no DOM, no onclick strings -- so the classic script's
// renderDueCalendar() just maps this over its HTML template.
export function buildDueCalendarCells(year, month, dueCalAssignments, cachedStudySessions, todayStr, selectedDate) {
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const byDate = {};
  dueCalAssignments.forEach(a => {
    const d = new Date(a.due_date); d.setHours(0, 0, 0, 0);
    const key = ymd(d);
    (byDate[key] = byDate[key] || []).push(a);
  });

  const studyByDate = {};
  cachedStudySessions.forEach(s => {
    (studyByDate[s.session_date] = studyByDate[s.session_date] || []).push(s);
  });

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const dnum = daysInPrevMonth - i;
    cells.push({ dnum, dateObj: new Date(year, month - 1, dnum), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dnum: d, dateObj: new Date(year, month, d), otherMonth: false });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ dnum: trail, dateObj: new Date(year, month + 1, trail), otherMonth: true });
    trail++;
  }

  return cells.map(c => {
    const key = ymd(c.dateObj);
    return {
      dnum: c.dnum,
      key,
      otherMonth: c.otherMonth,
      isToday: key === todayStr,
      isSelected: key === selectedDate,
      count: (byDate[key] || []).length,
      hasStudy: !!(studyByDate[key] || []).length,
    };
  });
}
