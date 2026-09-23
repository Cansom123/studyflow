create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null default 'Study session',
  course text,
  session_date date not null,
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.study_sessions enable row level security;

create policy "Users can select own study sessions" on public.study_sessions
  for select using (auth.uid() = user_id);
create policy "Users can insert own study sessions" on public.study_sessions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own study sessions" on public.study_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own study sessions" on public.study_sessions
  for delete using (auth.uid() = user_id);
