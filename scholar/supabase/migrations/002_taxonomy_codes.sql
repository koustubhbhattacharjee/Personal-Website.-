alter table public.learning_objectives
  add column if not exists code text;

alter table public.sub_learning_objectives
  add column if not exists code text;

create unique index if not exists learning_objectives_framework_code_idx
  on public.learning_objectives(framework_id, code);

create unique index if not exists sub_learning_objectives_lo_code_idx
  on public.sub_learning_objectives(lo_id, code);
