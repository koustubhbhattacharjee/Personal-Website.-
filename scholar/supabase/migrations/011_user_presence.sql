create table if not exists user_presence (
  id uuid primary key default gen_random_uuid(),
  user_key text not null unique,
  role text not null default 'student',
  email text,
  student_id uuid,
  student_name text,
  route text,
  section text,
  subject_id uuid,
  subject_name text,
  mode text,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_presence_last_seen_at
  on user_presence (last_seen_at desc);

create index if not exists idx_user_presence_student_id
  on user_presence (student_id);

create index if not exists idx_user_presence_subject_id
  on user_presence (subject_id);
