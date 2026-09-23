-- send-reminders previously computed "due tomorrow" using UTC midnight for
-- every student regardless of where they are, which silently shifts the day
-- boundary by several hours for anyone not on UTC -- the same class of bug
-- that caused a late-evening assignment to display on the wrong calendar day
-- (fixed for the client display path in fix_timestamp_columns_missing_timezone).
-- This stores each student's actual IANA timezone so the reminder function
-- can compute their real local "today"/"tomorrow" instead of guessing UTC.
alter table public.user_settings add column if not exists timezone text;
