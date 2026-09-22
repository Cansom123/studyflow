-- Per-assignment submission score, so the Grades page can show students
-- exactly what's pulling a course grade down instead of only the
-- course-level aggregate already stored in `grades`. Canvas's assignment
-- API (with include[]=submission) already returns this per assignment --
-- it just wasn't being persisted.
alter table public.assignments add column if not exists score numeric;
alter table public.assignments add column if not exists is_missing boolean not null default false;
alter table public.assignments add column if not exists is_excused boolean not null default false;
