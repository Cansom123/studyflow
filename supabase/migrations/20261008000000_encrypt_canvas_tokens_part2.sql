-- Part 2 of moving Canvas tokens into Supabase Vault (see part 1).
-- From here on every token written to user_settings.canvas_token is moved
-- into Vault by the trigger and the plain-text column is emptied.
drop trigger if exists store_canvas_token on public.user_settings;
create trigger store_canvas_token
  before insert or update on public.user_settings
  for each row execute function public.store_canvas_token();

-- Move the tokens already stored: re-writing each one fires the trigger,
-- which encrypts it into Vault and clears the plain-text copy.
update public.user_settings set canvas_token = canvas_token where canvas_token is not null;
