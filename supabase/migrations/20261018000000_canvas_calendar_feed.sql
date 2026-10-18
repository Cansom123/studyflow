-- Quick start: a student can connect with their Canvas calendar feed link
-- (Canvas > Calendar > Calendar Feed) instead of an access token. The link
-- is private (anyone with it can read that student's Canvas calendar), so it
-- is kept in Supabase Vault the same way tokens are (see
-- 20261007000000_encrypt_canvas_tokens_part1.sql): the app writes
-- canvas_feed_url, a trigger moves it into Vault and empties the column.

alter table public.user_settings add column if not exists canvas_feed_url text;
alter table public.user_settings add column if not exists canvas_feed_secret uuid;

-- What the app reads instead of the link itself: "is the calendar connected?"
alter table public.user_settings
  add column if not exists canvas_feed_connected boolean
  generated always as (canvas_feed_secret is not null) stored;

create or replace function public.store_canvas_feed()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  -- The app can't point canvas_feed_secret at another secret: on insert it
  -- starts empty, and any change other than clearing it is ignored.
  if tg_op = 'INSERT' then
    new.canvas_feed_secret := null;
  elsif new.canvas_feed_secret is not null
        and new.canvas_feed_secret is distinct from old.canvas_feed_secret then
    new.canvas_feed_secret := old.canvas_feed_secret;
  end if;

  if new.canvas_feed_url is not null and btrim(new.canvas_feed_url) <> '' then
    if new.canvas_feed_secret is not null then
      perform vault.update_secret(new.canvas_feed_secret, new.canvas_feed_url);
    else
      new.canvas_feed_secret := vault.create_secret(
        new.canvas_feed_url,
        'canvas_feed_' || new.user_id::text || '_' || gen_random_uuid()::text,
        'StudyFlow Canvas calendar feed link'
      );
    end if;
  end if;
  new.canvas_feed_url := null;

  -- Clearing canvas_feed_secret (disconnect, or upgrading to a token)
  -- deletes the stored link.
  if tg_op = 'UPDATE' and old.canvas_feed_secret is not null and new.canvas_feed_secret is null then
    delete from vault.secrets where id = old.canvas_feed_secret;
  end if;
  return new;
end;
$$;
revoke all on function public.store_canvas_feed() from public, anon, authenticated;

drop trigger if exists store_canvas_feed on public.user_settings;
create trigger store_canvas_feed
  before insert or update on public.user_settings
  for each row execute function public.store_canvas_feed();

-- For edge functions only (service role): the decrypted feed link for one student.
create or replace function public.get_canvas_feed(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select ds.decrypted_secret
    from public.user_settings us
    join vault.decrypted_secrets ds on ds.id = us.canvas_feed_secret
   where us.user_id = p_user_id;
$$;
revoke all on function public.get_canvas_feed(uuid) from public, anon, authenticated;
grant execute on function public.get_canvas_feed(uuid) to service_role;
