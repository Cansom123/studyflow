-- Students can now add their own steps to a study plan, distinct from
-- ai-generated or fallback-generated ones.
alter table public.assignment_checklists drop constraint assignment_checklists_source_check;
alter table public.assignment_checklists add constraint assignment_checklists_source_check
  check (source in ('ai', 'fallback', 'manual'));
