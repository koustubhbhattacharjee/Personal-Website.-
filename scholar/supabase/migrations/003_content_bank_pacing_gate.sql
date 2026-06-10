do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'pacing_mode'
  ) then
    create type pacing_mode as enum (
      'unconfigured',
      'default',
      'school',
      'textbook',
      'manual'
    );
  end if;
end
$$;

create table if not exists public.content_banks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  subject_name text not null,
  framework_id uuid references public.curriculum_frameworks(id) on delete set null,
  source_label text,
  is_canonical boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subjects
  add column if not exists content_bank_id uuid references public.content_banks(id) on delete set null;

alter table public.subjects
  add column if not exists pacing_mode pacing_mode not null default 'unconfigured';

alter table public.subjects
  add column if not exists active_overlay_id uuid;

alter table public.school_overlays
  add column if not exists content_bank_id uuid references public.content_banks(id) on delete cascade;

alter table public.school_overlays
  add column if not exists overlay_key text;

update public.school_overlays
set overlay_key = coalesce(overlay_key, nullif(source_label, ''), id::text)
where overlay_key is null;

alter table public.school_overlays
  alter column overlay_key set not null;

create unique index if not exists school_overlays_content_bank_overlay_key_idx
  on public.school_overlays(content_bank_id, overlay_key);

alter table public.question_types
  add column if not exists content_bank_id uuid references public.content_banks(id) on delete cascade;

alter table public.question_types
  alter column subject_id drop not null;

create index if not exists question_types_content_bank_idx
  on public.question_types(content_bank_id);

alter table public.student_question_types
  drop constraint if exists student_question_types_student_id_question_type_id_key;

create unique index if not exists student_question_types_student_subject_qt_idx
  on public.student_question_types(student_id, subject_id, question_type_id);

alter table public.draft_items
  drop constraint if exists draft_items_student_id_question_type_id_assigned_session_date_key;

create unique index if not exists draft_items_student_subject_qt_date_idx
  on public.draft_items(student_id, subject_id, question_type_id, assigned_session_date);

alter table public.subjects
  add constraint subjects_active_overlay_fk
  foreign key (active_overlay_id) references public.school_overlays(id) on delete set null;

alter table public.subjects
  drop constraint if exists subjects_pacing_mode_check;

alter table public.subjects
  add constraint subjects_pacing_mode_check
  check (
    (pacing_mode = 'unconfigured' and active_overlay_id is null)
    or
    (pacing_mode in ('default', 'manual') and active_overlay_id is null)
    or
    (pacing_mode in ('school', 'textbook') and active_overlay_id is not null)
  );

create or replace function public.validate_subject_configuration()
returns trigger
language plpgsql
as $$
declare
  overlay_bank_id uuid;
begin
  if new.pacing_mode <> 'unconfigured' and new.content_bank_id is null then
    raise exception 'subject must have a content_bank_id before pacing can be configured';
  end if;

  if new.active_overlay_id is not null then
    select content_bank_id into overlay_bank_id
    from public.school_overlays
    where id = new.active_overlay_id;

    if overlay_bank_id is null then
      raise exception 'active_overlay_id % does not exist', new.active_overlay_id;
    end if;

    if new.content_bank_id is distinct from overlay_bank_id then
      raise exception 'active overlay must belong to the same content bank as the subject';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists subjects_validate_configuration on public.subjects;

create trigger subjects_validate_configuration
before insert or update on public.subjects
for each row execute function public.validate_subject_configuration();

create or replace function public.validate_student_question_type_bank()
returns trigger
language plpgsql
as $$
declare
  subject_bank_id uuid;
  qt_bank_id uuid;
begin
  select content_bank_id into subject_bank_id
  from public.subjects
  where id = new.subject_id;

  if subject_bank_id is null then
    raise exception 'subject % is not linked to a content bank', new.subject_id;
  end if;

  select content_bank_id into qt_bank_id
  from public.question_types
  where id = new.question_type_id;

  if qt_bank_id is null then
    raise exception 'question type % is not linked to a content bank', new.question_type_id;
  end if;

  if qt_bank_id <> subject_bank_id then
    raise exception 'question type content bank does not match subject content bank';
  end if;

  return new;
end;
$$;

drop trigger if exists student_question_types_validate_bank on public.student_question_types;

create trigger student_question_types_validate_bank
before insert or update on public.student_question_types
for each row execute function public.validate_student_question_type_bank();

create or replace function public.validate_draft_item_subject_readiness()
returns trigger
language plpgsql
as $$
declare
  subject_bank_id uuid;
  subject_pacing_mode pacing_mode;
  subject_overlay_id uuid;
  qt_bank_id uuid;
begin
  select content_bank_id, pacing_mode, active_overlay_id
    into subject_bank_id, subject_pacing_mode, subject_overlay_id
  from public.subjects
  where id = new.subject_id;

  if subject_bank_id is null then
    raise exception 'draft items require the subject to be linked to a content bank';
  end if;

  if subject_pacing_mode = 'unconfigured' then
    raise exception 'draft items are locked until a pacing mode is selected for the subject';
  end if;

  if subject_pacing_mode in ('school', 'textbook') and subject_overlay_id is null then
    raise exception 'draft items are locked until the selected pacing mode has an active overlay';
  end if;

  select content_bank_id into qt_bank_id
  from public.question_types
  where id = new.question_type_id;

  if qt_bank_id is null or qt_bank_id <> subject_bank_id then
    raise exception 'draft item question type must come from the subject content bank';
  end if;

  return new;
end;
$$;

drop trigger if exists draft_items_validate_subject_readiness on public.draft_items;

create trigger draft_items_validate_subject_readiness
before insert or update on public.draft_items
for each row execute function public.validate_draft_item_subject_readiness();
