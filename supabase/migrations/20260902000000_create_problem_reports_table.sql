create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  email text,
  report_type text not null default 'bug' check (report_type in ('bug','idea','other')),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.problem_reports enable row level security;

create policy "Users can insert own reports" on public.problem_reports
  for insert with check (auth.uid() = user_id);
