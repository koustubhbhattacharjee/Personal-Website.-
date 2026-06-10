create table public.question_flags (
  id uuid primary key default gen_random_uuid(),
  question_key text not null,
  question_type_id uuid references public.question_types(id) on delete set null,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index question_flags_question_key_idx on public.question_flags(question_key);
create index question_flags_student_idx on public.question_flags(student_id);
create index question_flags_created_idx on public.question_flags(created_at desc);
