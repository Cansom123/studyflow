create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  note_id uuid not null references public.class_notes(id) on delete cascade,
  course_id text,
  front text not null,
  back text not null,
  source text not null default 'ai' check (source in ('ai','fallback')),
  created_at timestamptz not null default now()
);

alter table public.flashcards enable row level security;

create policy "Users can select own flashcards" on public.flashcards
  for select using (auth.uid() = user_id);
create policy "Users can insert own flashcards" on public.flashcards
  for insert with check (auth.uid() = user_id);
create policy "Users can update own flashcards" on public.flashcards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own flashcards" on public.flashcards
  for delete using (auth.uid() = user_id);

create index flashcards_note_idx on public.flashcards(user_id, note_id);
