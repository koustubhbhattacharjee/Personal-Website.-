-- Pacing guide hierarchy:
--   enrollments custom > school overlay native > subject LO default
--
-- The table now stores multiple guide kinds instead of only student snapshots.

alter table public.pacing_guides
  alter column subject_id drop not null;

alter table public.pacing_guides
  add column if not exists overlay_id uuid
    references public.school_overlays(id) on delete cascade;

alter table public.pacing_guides
  add column if not exists guide_type text
    not null default 'enrollment_custom';

update public.pacing_guides
set guide_type = case
  when student_id is null then 'subject_default'
  else 'enrollment_custom'
end
where guide_type is null
   or guide_type = 'enrollment_custom';

alter table public.pacing_guides
  drop constraint if exists pacing_guides_scope_check;

alter table public.pacing_guides
  add constraint pacing_guides_scope_check
  check (
    (
      guide_type = 'enrollment_custom'
      and student_id is not null
      and subject_id is not null
      and overlay_id is null
    )
    or
    (
      guide_type = 'subject_default'
      and student_id is null
      and subject_id is not null
      and overlay_id is null
    )
    or
    (
      guide_type = 'overlay_native'
      and student_id is null
      and overlay_id is not null
    )
  );

alter table public.school_overlays
  add column if not exists native_pacing_guide_id uuid
    references public.pacing_guides(id) on delete set null;

create index if not exists pacing_guides_custom_latest_idx
  on public.pacing_guides (student_id, subject_id, created_at desc)
  where guide_type = 'enrollment_custom';

create index if not exists pacing_guides_subject_default_idx
  on public.pacing_guides (subject_id, created_at desc)
  where guide_type = 'subject_default';

create index if not exists pacing_guides_overlay_native_idx
  on public.pacing_guides (overlay_id, created_at desc)
  where guide_type = 'overlay_native';
