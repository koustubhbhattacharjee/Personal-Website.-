-- Move pacing state from subjects (shared) to enrollments (per student).
-- subjects.pacing_data was wrong — pacing order and skips are per student.

alter table public.enrollments
  add column if not exists pacing_data jsonb;

-- Remove from subjects (data loss is acceptable — no student has real pacing_data yet)
alter table public.subjects
  drop column if exists pacing_data;
