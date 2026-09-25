-- Dismissing an announcement was previously tracked only in the browser's
-- localStorage, so it never survived a device change, a cleared browser
-- profile, or even just the announcement getting upserted again by the next
-- Canvas sync landing on a different tab/session. Moving it to a real column
-- (same pattern as the existing `read` column, which the sync's upsert never
-- touches since it's excluded from the payload) makes dismissal permanent
-- and consistent across devices, the same way `read` already is.
alter table public.announcements
  add column if not exists dismissed boolean not null default false;
