alter table public.assignments add column if not exists lock_reason text check (lock_reason in ('closed','unavailable'));

update public.assignments
set lock_reason = case
  when due_date is not null and due_date < now() then 'closed'
  else 'unavailable'
end
where is_locked = true and lock_reason is null;
