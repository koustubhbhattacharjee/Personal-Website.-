-- 018_sources.sql
--
-- Add a registry of source PDFs (textbooks, FRQ packs, released exams, tutor
-- worksheets) keyed on textbook_key — the same key already stamped on every
-- question's metadata.source_reference by the importer (see
-- qt-extraction-prompt-mcq.md). The link to questions stays SOFT (a text key,
-- not a foreign key) so a book can be re-imported under a new textbook_key
-- without orphaning rows.
--
-- The Sources admin tab (introduced in this branch) lists rows from this
-- table, fetches the PDF from R2 via pdf_url, and overlays the bboxes on
-- questions whose metadata.source_reference.textbook_key matches the row's
-- textbook_key.

create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  textbook_key    text not null unique,
  label           text not null,
  source_type     text not null default 'textbook',
  pdf_url         text,
  pdf_storage_key text,
  page_count      integer,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  public.sources is
  'Registry of source PDFs (textbooks, FRQ packs, released exams). Joined to questions via metadata.source_reference.textbook_key (soft link).';
comment on column public.sources.textbook_key is
  'Stable key, identical to questions.metadata.source_reference.textbook_key. e.g. "tutor_ap1_workbook_book1_2014".';
comment on column public.sources.source_type is
  '"textbook" (named published book) | "external" (released exam, packet) | "worksheet_pack" (tutor-authored).';
comment on column public.sources.pdf_url is
  'Public R2 URL of the source PDF. Null while the row is registered but the file has not yet been uploaded.';
comment on column public.sources.pdf_storage_key is
  'R2 object key, conventionally "sources/<textbook_key>/source.pdf".';
comment on column public.sources.page_count is
  'Total pages in the PDF, populated when the file is uploaded; allows the UI to constrain page selection.';

alter table public.sources
  drop constraint if exists sources_source_type_chk;
alter table public.sources
  add  constraint sources_source_type_chk
       check (source_type in ('textbook', 'external', 'worksheet_pack'));

create index if not exists sources_textbook_key_idx
  on public.sources(textbook_key);
create index if not exists sources_source_type_idx
  on public.sources(source_type);

-- Match the existing project convention from earlier migrations: bump
-- updated_at on row touches via a trigger.
create or replace function public.sources_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sources_updated_at on public.sources;
create trigger sources_updated_at
  before update on public.sources
  for each row execute function public.sources_set_updated_at();
