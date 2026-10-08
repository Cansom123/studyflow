-- Canvas tokens move from a plain-text column into Supabase Vault
-- (encrypted at rest). Part 1 adds the storage and the functions only;
-- nothing is switched over yet (part 2 attaches the trigger and moves the
-- existing tokens, once the app and edge functions read from Vault).

-- Which Vault secret holds this student's token. Never set by the app.
alter table public.user_settings add column if not exists canvas_token_secret uuid;

-- What the app reads instead of the token itself: "is Canvas connected?"
alter table public.user_settings
  add column if not exists canvas_connected boolean
  generated always as (canvas_token_secret is not null) stored;

-- Trigger: a token written to canvas_token (by the app, as before) is moved
-- into Vault and the plain-text column is emptied in the same statement, so
-- it is never stored in the clear. Clearing canvas_token_secret (Disconnect
-- Canvas) deletes the Vault secret. The app can't point canvas_token_secret
-- at another secret: any change other than clearing it is ignored.
create or replace function public.store_canvas_token()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if tg_op = 'INSERT' then
    new.canvas_token_secret := null;
  elsif new.canvas_token_secret is not null
        and new.canvas_token_secret is distinct from old.canvas_token_secret then
    new.canvas_token_secret := old.canvas_token_secret;
  end if;

  if new.canvas_token is not null and btrim(new.canvas_token) <> '' then
    if new.canvas_token_secret is not null then
      perform vault.update_secret(new.canvas_token_secret, new.canvas_token);
    else
      new.canvas_token_secret := vault.create_secret(
        new.canvas_token,
        'canvas_token_' || new.user_id::text || '_' || gen_random_uuid()::text,
        'StudyFlow Canvas access token'
      );
    end if;
  end if;
  new.canvas_token := null;

  if tg_op = 'UPDATE' and old.canvas_token_secret is not null and new.canvas_token_secret is null then
    delete from vault.secrets where id = old.canvas_token_secret;
  end if;
  return new;
end;
$$;
revoke all on function public.store_canvas_token() from public, anon, authenticated;

-- For edge functions only (service role): the decrypted token for one
-- student. Falls back to the old plain-text column until part 2 has run.
create or replace function public.get_canvas_token(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(
    (select ds.decrypted_secret
       from public.user_settings us
       join vault.decrypted_secrets ds on ds.id = us.canvas_token_secret
      where us.user_id = p_user_id),
    (select us.canvas_token from public.user_settings us where us.user_id = p_user_id)
  );
$$;
revoke all on function public.get_canvas_token(uuid) from public, anon, authenticated;
grant execute on function public.get_canvas_token(uuid) to service_role;
