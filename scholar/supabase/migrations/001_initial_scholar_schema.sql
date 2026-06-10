create extension if not exists pgcrypto;

create type session_source as enum (
  'calendar_exact',
  'calendar_inferred',
  'manual',
  'import'
);

create type session_mode as enum (
  'live_class',
  'homework',
  'practice',
  'assessment',
  'unknown'
);

create type draft_state as enum (
  'backlog',
  'draft',
  'live_stack',
  'homework_pool',
  'archived',
  'committed'
);

create type assessment_kind as enum (
  'pre_class',
  'exit_ticket'
);

create type pacing_mode as enum (
  'unconfigured',
  'default',
  'school',
  'textbook',
  'manual'
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  country text,
  state text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_scope text,
  country_scope text,
  exam_date date,
  timezone text,
  content_bank_id uuid,
  pacing_mode pacing_mode not null default 'unconfigured',
  active_overlay_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (pacing_mode = 'unconfigured' and active_overlay_id is null)
    or
    (pacing_mode in ('default', 'manual') and active_overlay_id is null)
    or
    (pacing_mode in ('school', 'textbook') and active_overlay_id is not null)
  )
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_time text,
  duration_minutes integer,
  timezone text,
  meeting_days text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (student_id, subject_id)
);

create table public.curriculum_frameworks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  country text,
  state text,
  subject_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.learning_objectives (
  id text primary key,
  framework_id uuid not null references public.curriculum_frameworks(id) on delete cascade,
  code text not null,
  standard_code text,
  standard_name text,
  name text not null,
  sequence_index integer,
  metadata jsonb not null default '{}'::jsonb
);

create table public.sub_learning_objectives (
  id text primary key,
  lo_id text not null references public.learning_objectives(id) on delete cascade,
  code text not null,
  text text not null,
  sequence_index integer,
  metadata jsonb not null default '{}'::jsonb
);

create unique index learning_objectives_framework_code_idx on public.learning_objectives(framework_id, code);
create index sub_learning_objectives_lo_id_idx on public.sub_learning_objectives(lo_id);
create unique index sub_learning_objectives_lo_code_idx on public.sub_learning_objectives(lo_id, code);

create table public.content_banks (
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

create table public.school_overlays (
  id uuid primary key default gen_random_uuid(),
  content_bank_id uuid not null references public.content_banks(id) on delete cascade,
  overlay_key text not null,
  source_label text,
  source_kind text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (content_bank_id, overlay_key)
);

create table public.school_units (
  id uuid primary key default gen_random_uuid(),
  overlay_id uuid not null references public.school_overlays(id) on delete cascade,
  unit_key text not null,
  unit_name text not null,
  sequence_index integer not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (overlay_id, unit_key)
);

create table public.school_sections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.school_units(id) on delete cascade,
  section_key text not null,
  section_label text not null,
  section_title text,
  textbook_ref text,
  sequence_index integer not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (unit_id, section_key)
);

create table public.school_section_slos (
  id uuid primary key default gen_random_uuid(),
  school_section_id uuid not null references public.school_sections(id) on delete cascade,
  slo_id text not null references public.sub_learning_objectives(id) on delete cascade,
  role text not null default 'aligned',
  weight numeric(6,4),
  confidence text,
  note text,
  unique (school_section_id, slo_id, role)
);

create index school_section_slos_section_idx on public.school_section_slos(school_section_id);
create index school_section_slos_slo_idx on public.school_section_slos(slo_id);

create table public.question_types (
  id uuid primary key default gen_random_uuid(),
  content_bank_id uuid not null references public.content_banks(id) on delete cascade,
  school_section_id uuid references public.school_sections(id) on delete set null,
  title text not null,
  unit_label text,
  primary_slo_id text references public.sub_learning_objectives(id) on delete set null,
  aligned_slo_ids text[] not null default '{}',
  reinforcement_slos jsonb not null default '[]'::jsonb,
  source_label text,
  source_reference jsonb not null default '{}'::jsonb,
  lo_confidence text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_types_content_bank_idx on public.question_types(content_bank_id);
create index question_types_primary_slo_idx on public.question_types(primary_slo_id);
create index question_types_school_section_idx on public.question_types(school_section_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  question_type_id uuid not null references public.question_types(id) on delete cascade,
  qhash text not null unique,
  ordinal integer not null default 0,
  question_format text,
  question_text text not null,
  answer_text text,
  options jsonb not null default '[]'::jsonb,
  correct_option text,
  explanation text,
  primary_slo_id text references public.sub_learning_objectives(id) on delete set null,
  aligned_slo_ids text[] not null default '{}',
  reinforcement_slos jsonb not null default '[]'::jsonb,
  source_file text,
  source_page integer,
  source_reference text,
  local_context_text text,
  context_snippets jsonb not null default '[]'::jsonb,
  candidate_image_refs jsonb not null default '[]'::jsonb,
  diagram_required text,
  metadata jsonb not null default '{}'::jsonb
);

create index questions_question_type_idx on public.questions(question_type_id);
create index questions_primary_slo_idx on public.questions(primary_slo_id);

create table public.question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  asset_kind text not null,
  asset_url text,
  storage_key text,
  page_number integer,
  block_ref text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.student_question_types (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_type_id uuid not null references public.question_types(id) on delete cascade,
  assigned_session_id uuid,
  date_introduced date,
  weakness_score numeric(8,3) not null default 0,
  status text,
  hw_source text,
  unit_label text,
  primary_slo_id text references public.sub_learning_objectives(id) on delete set null,
  aligned_slo_ids text[] not null default '{}',
  reinforcement_slos jsonb not null default '[]'::jsonb,
  correct_question_keys text[] not null default '{}',
  daily_seen_dates date[] not null default '{}',
  daily_wrong_dates date[] not null default '{}',
  mastery_events jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id, question_type_id)
);

create index student_question_types_student_subject_idx on public.student_question_types(student_id, subject_id);
create index student_question_types_primary_slo_idx on public.student_question_types(primary_slo_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  student_session_date date not null,
  tutor_session_date date,
  start_time timestamptz,
  end_time timestamptz,
  source session_source not null default 'manual',
  mode session_mode not null default 'unknown',
  calendar_event_id text,
  import_status text,
  import_override boolean not null default false,
  override_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_student_subject_date_idx on public.sessions(student_id, subject_id, student_session_date desc);
create unique index sessions_calendar_event_idx on public.sessions(calendar_event_id) where calendar_event_id is not null;

alter table public.student_question_types
  add constraint student_question_types_assigned_session_fk
  foreign key (assigned_session_id) references public.sessions(id) on delete set null;

create table public.draft_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  question_type_id uuid not null references public.question_types(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  assigned_session_date date,
  state draft_state not null default 'draft',
  plan_source text,
  order_index integer,
  committed boolean not null default false,
  committed_at timestamptz,
  dates_inferred boolean not null default false,
  inference_reason text,
  notes text,
  primary_slo_id text references public.sub_learning_objectives(id) on delete set null,
  aligned_slo_ids text[] not null default '{}',
  reinforcement_slos jsonb not null default '[]'::jsonb,
  school_unit_name text,
  school_section_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, question_type_id, assigned_session_date)
);

create index draft_items_student_subject_date_idx on public.draft_items(student_id, subject_id, assigned_session_date);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  assessment_kind assessment_kind not null,
  session_date date,
  status text,
  score integer,
  total integer,
  question_payload jsonb not null default '[]'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  pdf_url text,
  storage_key text,
  submitted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index assessment_attempts_student_subject_idx on public.assessment_attempts(student_id, subject_id, created_at desc);

create table public.homework_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  batch_key text,
  cycle_key text,
  session_date date,
  unlock_at timestamptz,
  expire_at timestamptz,
  status text,
  score integer,
  total integer,
  source_summary text,
  question_payload jsonb not null default '[]'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  attempt_number integer,
  is_latest boolean not null default true,
  is_official boolean not null default true,
  pdf_url text,
  storage_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index homework_attempts_student_subject_idx on public.homework_attempts(student_id, subject_id, created_at desc);

create table public.lo_graph_edges (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.curriculum_frameworks(id) on delete cascade,
  from_lo_id text not null references public.learning_objectives(id) on delete cascade,
  to_lo_id text not null references public.learning_objectives(id) on delete cascade,
  weight numeric(6,4) not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (framework_id, from_lo_id, to_lo_id),
  check (from_lo_id <> to_lo_id),
  check (weight >= 0 and weight <= 1)
);

create index lo_graph_edges_from_idx on public.lo_graph_edges(from_lo_id);
create index lo_graph_edges_to_idx on public.lo_graph_edges(to_lo_id);

alter table public.subjects
  add constraint subjects_content_bank_fk
  foreign key (content_bank_id) references public.content_banks(id) on delete set null;

alter table public.subjects
  add constraint subjects_active_overlay_fk
  foreign key (active_overlay_id) references public.school_overlays(id) on delete set null;

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

create trigger draft_items_validate_subject_readiness
before insert or update on public.draft_items
for each row execute function public.validate_draft_item_subject_readiness();
