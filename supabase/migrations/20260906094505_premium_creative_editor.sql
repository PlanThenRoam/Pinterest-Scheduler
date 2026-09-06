create table public.creative_styles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  channels text[] not null default array['tiktok','pinterest','etsy']::text[],
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.creative_styles enable row level security;
create policy "Owner manages creative styles" on public.creative_styles
for all to authenticated
using ((select auth.uid()) = user_id and private.is_app_owner())
with check ((select auth.uid()) = user_id and private.is_app_owner());

create table public.review_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.review_projects(id) on delete cascade,
  revision integer not null check (revision > 0),
  name text,
  title text not null,
  manifest jsonb not null,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

alter table public.review_project_versions enable row level security;
create policy "Owner manages project versions" on public.review_project_versions
for all to authenticated
using (private.is_app_owner())
with check (private.is_app_owner());

create index review_project_versions_project_idx
on public.review_project_versions(project_id, revision desc);
