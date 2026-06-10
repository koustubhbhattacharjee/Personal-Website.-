-- Subject-level default pacing guide (auto-built from overlay section order).
-- Student-specific custom pacing lives in enrollments.active_pacing_guide_id (already exists).

-- 1. Make pacing_guides.student_id nullable so subject-default rows don't need a student.
alter table public.pacing_guides
  alter column student_id drop not null;

-- 2. Add default_pacing_guide_id to subjects — set automatically when an overlay is linked.
alter table public.subjects
  add column if not exists default_pacing_guide_id uuid
    references public.pacing_guides(id) on delete set null;
