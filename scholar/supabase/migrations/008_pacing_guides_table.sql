-- Replace enrollments.pacing_data (jsonb blob) with a proper pacing_guides table.
-- Every save creates a new row — full history is preserved, queryable by timestamp.
-- enrollments.active_pacing_guide_id points to whichever row is currently active.

-- 1. Create the table
create table if not exists public.pacing_guides (
  id          uuid        primary key default gen_random_uuid(),
  student_id  uuid        not null references public.students(id)  on delete cascade,
  subject_id  uuid        not null references public.subjects(id)  on delete cascade,
  sections    jsonb       not null default '[]',
  created_at  timestamptz not null default now()
);

create index if not exists pacing_guides_student_subject_idx
  on public.pacing_guides (student_id, subject_id, created_at desc);

-- 2. Add FK on enrollments
alter table public.enrollments
  add column if not exists active_pacing_guide_id uuid
    references public.pacing_guides(id) on delete set null;

-- 3. Drop the old blob column if it was ever applied (007 may not have run on prod)
alter table public.enrollments
  drop column if exists pacing_data;
