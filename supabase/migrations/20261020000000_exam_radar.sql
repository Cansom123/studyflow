-- Exam radar.
-- 1) Exams a student adds themselves (announced in class, not in Canvas).
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  course text check (char_length(course) <= 200),
  exam_date date not null,
  exam_time time,
  created_at timestamptz not null default now()
);
create index if not exists exams_user_date_idx on public.exams (user_id, exam_date);
alter table public.exams enable row level security;
create policy "Users can select own exams" on public.exams for select using (auth.uid() = user_id);
create policy "Users can insert own exams" on public.exams for insert with check (auth.uid() = user_id);
create policy "Users can update own exams" on public.exams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own exams" on public.exams for delete using (auth.uid() = user_id);

-- 2) Full sync: which grade category an assignment is in ("Exams") and how
-- much that category counts (40). Spots exams whatever they're named, and
-- is what "worth about 4% of your grade" will be built on.
alter table public.assignments add column if not exists assignment_group text;
alter table public.assignments add column if not exists group_weight numeric;
