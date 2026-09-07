-- Notes were being saved under the cleaned display name (via cleanCourseName())
-- but the class list looked them up by the raw Canvas course name, so a class
-- would always show "No notes yet" even after notes were saved to it.
-- Syllabi already solved this exact problem by joining on Canvas's stable
-- course_id instead of a name string -- bringing class_notes in line with that.
alter table public.class_notes rename column course to course_name;
alter table public.class_notes add column course_id text not null default '';
alter table public.class_notes alter column course_id drop default;

create index class_notes_course_id_idx on public.class_notes(user_id, course_id);
