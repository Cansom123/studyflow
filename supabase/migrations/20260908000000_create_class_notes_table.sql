create table public.class_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  course text not null,
  title text not null default 'Untitled note',
  topic text,
  content text not null,
  source text not null default 'typed' check (source in ('typed','pdf')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.class_notes enable row level security;

create policy "Users can select own notes" on public.class_notes
  for select using (auth.uid() = user_id);
create policy "Users can insert own notes" on public.class_notes
  for insert with check (auth.uid() = user_id);
create policy "Users can update own notes" on public.class_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own notes" on public.class_notes
  for delete using (auth.uid() = user_id);
