-- Study time to the second. minutes_studied stays (rounded, for older
-- clients and anything already reading it); seconds_studied is the exact
-- total and is what the app uses once the column exists.
alter table public.study_sessions
  add column if not exists seconds_studied integer not null default 0;

-- Carry existing minutes over so every total stays exactly the same.
update public.study_sessions
  set seconds_studied = minutes_studied * 60
  where seconds_studied = 0 and minutes_studied > 0;
