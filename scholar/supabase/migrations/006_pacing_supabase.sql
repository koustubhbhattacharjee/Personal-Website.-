-- Supabase-backed pacing guide state per subject.
-- pacing_data shape: { sections: [{sectionId, skipped}], updatedAt }
alter table public.subjects
  add column if not exists pacing_data jsonb;
