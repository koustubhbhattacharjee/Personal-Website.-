create table public.showcase_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  device_fingerprint text
);

create index showcase_codes_code_idx on public.showcase_codes(code);
create index showcase_codes_used_idx on public.showcase_codes(used_at);
create index showcase_codes_expires_idx on public.showcase_codes(expires_at);
