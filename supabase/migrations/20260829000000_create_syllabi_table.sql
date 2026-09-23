create table public.syllabi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  course_id text not null,
  course_name text,
  content text,
  source text not null default 'manual' check (source in ('canvas','manual')),
  found boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.syllabi enable row level security;

create policy "Users can select own syllabi" on public.syllabi
  for select using (auth.uid() = user_id);
create policy "Users can insert own syllabi" on public.syllabi
  for insert with check (auth.uid() = user_id);
create policy "Users can update own syllabi" on public.syllabi
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own syllabi" on public.syllabi
  for delete using (auth.uid() = user_id);
