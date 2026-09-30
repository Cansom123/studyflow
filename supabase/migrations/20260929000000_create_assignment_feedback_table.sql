-- Teacher comments left directly on a submission (Canvas "submission
-- comments") -- distinct from both Canvas Inbox messages (canvas_messages)
-- and course-wide announcements. Keyed by the teacher's own comment id, not
-- our local assignment row's id, since assignments are deleted and
-- re-inserted with a fresh id every sync (see canvas-sync-v3) -- there's no
-- stable local foreign key to point at. assignment_title/course_name let
-- the client match a feedback row back to an assignment by the same
-- title+course identity the rest of the app already uses (doneKey).
create table if not exists public.assignment_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_comment_id text not null,
  canvas_assignment_id text not null,
  assignment_title text not null,
  course_name text not null,
  author_name text,
  comment_text text not null,
  posted_at timestamptz,
  -- Tracked as our own app state, like canvas_messages.read -- excluded
  -- from the sync upsert payload so it isn't reset to unread every sync.
  read boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, canvas_comment_id)
);

create index if not exists assignment_feedback_user_id_posted_at_idx
  on public.assignment_feedback(user_id, posted_at desc);

alter table public.assignment_feedback enable row level security;

create policy "Users can read own assignment feedback"
  on public.assignment_feedback for select
  using (auth.uid() = user_id);

create policy "Users can insert own assignment feedback"
  on public.assignment_feedback for insert
  with check (auth.uid() = user_id);

create policy "Users can update own assignment feedback"
  on public.assignment_feedback for update
  using (auth.uid() = user_id);

create policy "Users can delete own assignment feedback"
  on public.assignment_feedback for delete
  using (auth.uid() = user_id);

create policy "Service role full access"
  on public.assignment_feedback for all
  using (true)
  with check (true);
