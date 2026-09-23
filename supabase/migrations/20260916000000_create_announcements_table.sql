-- Create announcements table to store Canvas course announcements per user.
-- Uses an upsert (not delete-all-then-reinsert like assignments/grades) so
-- the read/unread flag survives re-syncs instead of resetting every sync.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_announcement_id text not null,
  course_name text not null,
  title text not null,
  message text,
  author_name text,
  posted_at timestamptz,
  announcement_url text,
  read boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, canvas_announcement_id)
);

-- Index for fast per-user lookups, newest first
create index if not exists announcements_user_id_posted_idx
  on public.announcements(user_id, posted_at desc);

-- Row-level security: users can only read/write their own rows
alter table public.announcements enable row level security;

create policy "Users can read own announcements"
  on public.announcements for select
  using (auth.uid() = user_id);

create policy "Users can insert own announcements"
  on public.announcements for insert
  with check (auth.uid() = user_id);

create policy "Users can update own announcements"
  on public.announcements for update
  using (auth.uid() = user_id);

create policy "Users can delete own announcements"
  on public.announcements for delete
  using (auth.uid() = user_id);

-- Allow the service role to bypass RLS (used by the edge function)
create policy "Service role full access"
  on public.announcements for all
  using (true)
  with check (true);
