-- 015_student_question_attempts.sql
--
-- Expand question_flags into a general per-question-attempt log.
-- A row represents a single student interaction with a specific question
-- (practice / homework / assessment). Flagging becomes one optional field
-- on an attempt row; saved scratch work becomes another.
--
-- Relationship to student_question_types is by shared join keys
-- (student_id, subject_id, question_type_id) with an optional FK on
-- score_row_id for direct navigation.

alter table public.question_flags rename to student_question_attempts;

alter index if exists question_flags_pkey           rename to student_question_attempts_pkey;
alter index if exists question_flags_question_key_idx rename to student_question_attempts_question_key_idx;
alter index if exists question_flags_student_idx    rename to student_question_attempts_student_idx;
alter index if exists question_flags_created_idx    rename to student_question_attempts_created_idx;

alter table public.student_question_attempts
  rename column reason to flag_reason;

alter table public.student_question_attempts
  alter column flag_reason drop not null;

alter table public.student_question_attempts
  add column if not exists mode text,
  add column if not exists result text,
  add column if not exists scratch_image_url text,
  add column if not exists score_row_id uuid
    references public.student_question_types(id) on delete set null;

-- Legacy rows written before this migration were flag-only; tag them.
update public.student_question_attempts
set mode = 'flag'
where mode is null;

create index if not exists student_question_attempts_mode_idx
  on public.student_question_attempts(mode);

create index if not exists student_question_attempts_score_row_idx
  on public.student_question_attempts(score_row_id)
  where score_row_id is not null;
