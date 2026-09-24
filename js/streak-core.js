// Shared streak-advancement logic used by both the daily-login streak and
// the study streak (previously duplicated verbatim in bumpDailyStreak and
// bumpStudyStreak). Pure: takes the persisted { count, lastDate } record
// (or null) plus today's and yesterday's ymd keys, and returns what the
// new persisted record and displayed count should be -- no localStorage
// reads/writes here.
export function computeNextStreak(raw, todayKey, yesterdayKey) {
  if (raw && raw.lastDate === todayKey) {
    return { count: raw.count, changed: false, next: raw };
  }
  const count = (raw && raw.lastDate === yesterdayKey) ? raw.count + 1 : 1;
  return { count, changed: true, next: { count, lastDate: todayKey } };
}
