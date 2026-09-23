create table public.assignment_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  step_order int not null,
  step_text text not null,
  target_date date,
  completed boolean not null default false,
  source text not null default 'ai' check (source in ('ai','fallback')),
  created_at timestamptz not null default now()
);

alter table public.assignment_checklists enable row level security;

create policy "Users can select own checklist steps" on public.assignment_checklists
  for select using (auth.uid() = user_id);
create policy "Users can insert own checklist steps" on public.assignment_checklists
  for insert with check (auth.uid() = user_id);
create policy "Users can update own checklist steps" on public.assignment_checklists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own checklist steps" on public.assignment_checklists
  for delete using (auth.uid() = user_id);

create index assignment_checklists_assignment_idx on public.assignment_checklists(user_id, assignment_id);
