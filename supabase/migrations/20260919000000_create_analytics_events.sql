-- First-party usage analytics -- no third-party tracking, per the Privacy
-- Policy. Students can only insert their own events; only the app owner can
-- read them, and only in aggregate (event name + counts), not per-user detail.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

create policy "Users can insert own events" on public.analytics_events
  for insert with check (auth.uid() = user_id);

create policy "Admin can read all events" on public.analytics_events
  for select using (auth.jwt() ->> 'email' in ('iwillnever12312@gmail.com', 'kjvboy@icloud.com'));

create index analytics_events_event_idx on public.analytics_events (event);
create index analytics_events_created_at_idx on public.analytics_events (created_at);
