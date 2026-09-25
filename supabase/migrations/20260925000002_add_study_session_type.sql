-- Distinguishes deep-work blocks (Cal Newport style: one long uninterrupted
-- session, no breaks) from the existing pomodoro-style focus timer sessions,
-- so the study chain calendar can mark deep-work days differently.
alter table public.study_sessions
  add column if not exists session_type text not null default 'pomodoro';
