create table if not exists public.cih_competitors (
  url text primary key,
  name text,
  market text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cih_reports (
  id text primary key,
  generated_at timestamptz not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cih_reviews (
  finding_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cih_catalog_overrides (
  service_line text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cih_competitors enable row level security;
alter table public.cih_reports enable row level security;
alter table public.cih_reviews enable row level security;
alter table public.cih_catalog_overrides enable row level security;

revoke all on table public.cih_competitors from anon, authenticated;
revoke all on table public.cih_reports from anon, authenticated;
revoke all on table public.cih_reviews from anon, authenticated;
revoke all on table public.cih_catalog_overrides from anon, authenticated;

grant select, insert, update, delete on table public.cih_competitors to service_role;
grant select, insert, update, delete on table public.cih_reports to service_role;
grant select, insert, update, delete on table public.cih_reviews to service_role;
grant select, insert, update, delete on table public.cih_catalog_overrides to service_role;

create index if not exists cih_competitors_name_idx on public.cih_competitors (name);
create index if not exists cih_reports_generated_at_idx on public.cih_reports (generated_at desc);
create index if not exists cih_reviews_updated_at_idx on public.cih_reviews (updated_at desc);
