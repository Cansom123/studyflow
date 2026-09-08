-- Supports the dedicated Flashcards study mode: a card marked "known" can be
-- skipped in future study sessions until the student resets their progress.
alter table public.flashcards add column known boolean not null default false;
