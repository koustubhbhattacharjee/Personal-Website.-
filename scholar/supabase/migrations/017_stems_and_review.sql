-- 017_stems_and_review.sql
--
-- Support for two new flows:
--   (1) Stem-based questions — one stimulus with multiple child parts. All
--       children belong to the same question_type and share a stem group.
--   (2) Free-response review — questions that cannot be auto-graded need a
--       student-submitted artifact (Excalidraw JSON or uploaded image/PDF)
--       and an admin verdict before they contribute to mastery.

-- Stem grouping on questions. Children of the same stem share stem_group_id;
-- is_stem_child marks children so progression logic can skip per-child locks.
alter table public.questions
  add column if not exists stem_group_id uuid,
  add column if not exists is_stem_child boolean not null default false,
  add column if not exists stem_header_content jsonb;

create index if not exists questions_stem_group_idx
  on public.questions(stem_group_id)
  where stem_group_id is not null;

-- Per-attempt review state. mode/result/scratch_image_url are already on the
-- row (see 015). New columns track whether the attempt is pending admin
-- grading, what the student submitted, and how the admin graded it.
alter table public.student_question_attempts
  add column if not exists review_status text not null default 'auto',
  add column if not exists student_work_type text,
  add column if not exists excalidraw_json jsonb,
  add column if not exists upload_url text,
  add column if not exists admin_verdict text,
  add column if not exists score numeric(4,3),
  add column if not exists graded_by text,
  add column if not exists graded_at timestamptz;

-- 'auto' = auto-graded (MCQ) or legacy, 'pending' = waiting on admin,
-- 'graded' = admin has assigned a verdict.
alter table public.student_question_attempts
  drop constraint if exists student_question_attempts_review_status_chk;
alter table public.student_question_attempts
  add constraint student_question_attempts_review_status_chk
    check (review_status in ('auto', 'pending', 'graded'));

alter table public.student_question_attempts
  drop constraint if exists student_question_attempts_work_type_chk;
alter table public.student_question_attempts
  add constraint student_question_attempts_work_type_chk
    check (student_work_type is null or student_work_type in ('excalidraw', 'upload'));

alter table public.student_question_attempts
  drop constraint if exists student_question_attempts_verdict_chk;
alter table public.student_question_attempts
  add constraint student_question_attempts_verdict_chk
    check (admin_verdict is null or admin_verdict in ('correct', 'partial', 'incorrect'));

-- Score: 1.0 correct, 0.5 partial, 0.0 incorrect. Null until graded.
alter table public.student_question_attempts
  drop constraint if exists student_question_attempts_score_chk;
alter table public.student_question_attempts
  add constraint student_question_attempts_score_chk
    check (score is null or (score >= 0 and score <= 1));

create index if not exists student_question_attempts_review_status_idx
  on public.student_question_attempts(review_status)
  where review_status = 'pending';
