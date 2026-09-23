-- One-time recovery codes for students who set up 2FA, so losing an
-- authenticator app doesn't lock them out. Codes are hashed (SHA-256) client
-- side before they ever reach the database -- only the hash is stored.
create table public.mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.mfa_backup_codes enable row level security;

-- 2FA setup is opt-in, so a user only ever touches their own codes -- no
-- separate select/insert/delete policies needed.
create policy "Users manage own backup codes" on public.mfa_backup_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
