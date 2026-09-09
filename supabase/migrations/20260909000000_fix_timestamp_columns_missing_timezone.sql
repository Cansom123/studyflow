-- assignments.due_date (and a few created_at columns) were declared as
-- `timestamp without time zone`. Every value written into them originated
-- as a UTC instant (Canvas's due_at, or JS's .toISOString()), but the
-- column silently dropped that timezone marker on write. When PostgREST
-- serialized the naive value back out, the JSON had no "Z"/offset, so the
-- browser's `new Date(...)` parsed it as LOCAL time instead of UTC --
-- shifting any late-evening Pacific due time (which is early-morning UTC
-- the *next* calendar day) forward by a full day. This is what caused an
-- assignment due today at 11:59pm to display as due tomorrow.
--
-- `AT TIME ZONE 'UTC'` on a naive column reinterprets its existing wall-clock
-- numbers as UTC (which is what they always represented) while converting
-- to a real timestamptz -- this restores the correct instant for existing
-- rows without shifting them, and makes future writes/reads round-trip
-- through PostgREST with an explicit offset so the browser parses them
-- correctly going forward.
alter table public.assignments alter column due_date type timestamptz using due_date at time zone 'UTC';
alter table public.assignments alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.goals alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.user_settings alter column created_at type timestamptz using created_at at time zone 'UTC';
