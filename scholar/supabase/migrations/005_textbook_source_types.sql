-- 005_textbook_source_types.sql
--
-- Adds two-track import support: textbook vs external question sources.
--
-- Textbook QTs are directly tagged to a school_section at import time.
-- Their section mastery = mean(qt_mastery) for all QTs in that section.
-- External QTs flow through SLO weights via school_section_slos.
--
-- school_units gains unit_type to separate textbook and external units.
-- question_types gains source_type and school_section_id.
-- questions gains a richer source_reference structure (worksheet_name, page, exercise_ref).

-- ── school_units ───────────────────────────────────────────────────────────
alter table public.school_units
  add column if not exists unit_type text not null default 'textbook';

comment on column public.school_units.unit_type is
  '"textbook" — fixed sections from a specific textbook, QTs tagged directly to sections. '
  '"external" — mirror unit for non-textbook sources; section mastery via SLO weight projection.';

-- ── question_types ─────────────────────────────────────────────────────────
alter table public.question_types
  add column if not exists source_type text not null default 'external';

alter table public.question_types
  add column if not exists school_section_id uuid references public.school_sections(id) on delete set null;

comment on column public.question_types.source_type is
  '"textbook" — QT is from a specific textbook; school_section_id is set at import. '
  '"external" — QT from worksheets, past papers, or other sources; routes through SLO weight projection.';

comment on column public.question_types.school_section_id is
  'Set only for source_type = "textbook". Direct tag to a school_section row. '
  'Null for external QTs — those use SLO→section weight projection instead.';

create index if not exists question_types_school_section_idx
  on public.question_types(school_section_id)
  where school_section_id is not null;

create index if not exists question_types_source_type_idx
  on public.question_types(source_type);
