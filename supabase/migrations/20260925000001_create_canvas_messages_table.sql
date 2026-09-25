-- Canvas Inbox/Conversations (private messages between the student and
-- teachers/classmates) -- a separate Canvas feature from course
-- announcements, not synced before now. Mirrors the announcements table's
-- shape and RLS pattern.
create table if not exists public.canvas_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_conversation_id text not null,
  subject text not null default '(no subject)',
  last_message text,
  participants text,
  message_count integer,
  last_message_at timestamptz,
  conversation_url text,
  -- Tracked as our own app state (like announcements.read), not derived from
  -- Canvas's workflow_state on every sync -- otherwise marking it read in
  -- StudyFlow would just flip back to unread the next time it's upserted,
  -- since Canvas itself was never told it was read.
  read boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (user_id, canvas_conversation_id)
);

create index if not exists canvas_messages_user_id_last_message_idx
  on public.canvas_messages(user_id, last_message_at desc);

alter table public.canvas_messages enable row level security;

create policy "Users can read own messages"
  on public.canvas_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own messages"
  on public.canvas_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own messages"
  on public.canvas_messages for update
  using (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.canvas_messages for delete
  using (auth.uid() = user_id);

-- Allow the service role to bypass RLS (used by the edge function)
create policy "Service role full access"
  on public.canvas_messages for all
  using (true)
  with check (true);
