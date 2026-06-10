-- 019_source_reference_jsonb.sql
--
-- Convert questions.source_reference from text-holding-JSON to real jsonb,
-- and add an expression index on (source_reference->>'textbook_key') so the
-- Sources Studio admin can filter by textbook_key directly on the canonical
-- column.
--
-- Why this change exists:
--
-- The questions table was created in 001 with `source_reference text`. Every
-- writer in the codebase (importers, source-matchers) JSON.stringify's an
-- object into it, and every reader JSON.parse's it back. Because the column
-- type is text, jsonb operators (->, ->>) cannot reach inside it via
-- PostgREST — so when the Sources Studio API needed to filter by
-- textbook_key, it couldn't filter on this column. The workaround was a
-- backfill script (scripts/backfill-question-textbook-key.cjs) that copied
-- each question_type's textbook_key onto every child question's
-- metadata.textbook_key. That copy was wrong: a QT can pool questions from
-- multiple sources, so the per-question copy mistagged questions whose real
-- source differed from the QT's first-introducer.
--
-- Fixing the column type retires the entire bug class. After this migration:
--   - questions.source_reference is real jsonb, queryable via ->/->>
--   - the Sources API filters source_reference->>'textbook_key' directly
--   - metadata.textbook_key (the wrong copy) becomes obsolete
--   - the backfill script is no longer needed
--
-- Pre-flight (already run): scripts/preflight-source-reference-jsonb.cjs
-- confirmed all 1298 non-null source_reference rows parse cleanly to objects.
-- 114 null rows stay null. 0 malformed.
--
-- Mastery tables (student_question_types, student_question_attempts) are
-- intentionally untouched.

begin;

alter table public.questions
  alter column source_reference type jsonb
  using case
    when source_reference is null then null
    when source_reference = '' then null
    else source_reference::jsonb
  end;

create index if not exists questions_textbook_key_idx
  on public.questions ((source_reference->>'textbook_key'));

comment on column public.questions.source_reference is
  'Canonical provenance record for the question. JSON object with keys: textbook_key, worksheet_name, page, section, exercise_ref. Soft-linked to public.sources via textbook_key.';

commit;
