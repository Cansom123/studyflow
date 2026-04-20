-- Create grades table to store Canvas course grades per user
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_course_id text not null,
  course_name text not null,
  current_score numeric,
  final_score numeric,
  current_grade text,
  final_grade text,
  synced_at timestamptz not null default now(),
  unique (user_id, canvas_course_id)
);

-- Index for fast per-user lookups
create index if not exists grades_user_id_idx on public.grades(user_id);

-- Row-level security: users can only read/write their own rows
alter table public.grades enable row level security;

create policy "Users can read own grades"
  on public.grades for select
  using (auth.uid() = user_id);

create policy "Users can insert own grades"
  on public.grades for insert
  with check (auth.uid() = user_id);

create policy "Users can update own grades"
  on public.grades for update
  using (auth.uid() = user_id);

create policy "Users can delete own grades"
  on public.grades for delete
  using (auth.uid() = user_id);

-- Allow the service role to bypass RLS (used by the edge function)
create policy "Service role full access"
  on public.grades for all
  using (true)
  with check (true);
