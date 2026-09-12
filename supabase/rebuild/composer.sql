create table if not exists public.composer_assets(
 id uuid primary key, user_id uuid not null references auth.users(id), planner_id uuid not null references public.seller_master_records(id),
 kind text not null check(kind in ('background','page')), logical_key text not null, checksum text not null check(checksum ~ '^[a-f0-9]{64}$'),
 path text not null unique, width int not null check(width>0), height int not null check(height>0), size bigint not null check(size>0),
 source_checksum text, metadata jsonb not null default '{}', ready boolean not null default false, created_at timestamptz not null default now(),
 unique(user_id,planner_id,kind,logical_key,checksum));
create table if not exists public.composer_compositions(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), revision int not null default 1,
 request_key text not null, request_hash text not null, spec jsonb not null, layout jsonb not null, assets jsonb not null,
 status text not null default 'draft' check(status in ('draft','queued','running','ready','validation_failed','failed','cancelled')),
 result jsonb, approved_revision int, lease uuid, lease_until timestamptz, attempts int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,request_key));
create table if not exists public.composer_revisions(
 composition_id uuid not null references public.composer_compositions(id) on delete cascade, revision int not null, user_id uuid not null references auth.users(id),
 spec jsonb not null, layout jsonb not null, assets jsonb not null, result jsonb, primary key(composition_id,revision));
create table if not exists public.composer_imports(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id), token_hash text not null unique, asset_ids uuid[] not null, expires_at timestamptz not null, revoked boolean not null default false);
alter table public.composer_assets enable row level security;
alter table public.composer_compositions enable row level security;
alter table public.composer_revisions enable row level security;
alter table public.composer_imports enable row level security;
-- Access is via authenticated, owner-checked server actions. No browser Data API grants.
revoke all on public.composer_assets,public.composer_compositions,public.composer_revisions,public.composer_imports from anon,authenticated;
grant all on public.composer_assets,public.composer_compositions,public.composer_revisions,public.composer_imports to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('composer-private','composer-private',false,52428800,array['image/png']) on conflict(id) do nothing;
create index if not exists composer_asset_search on public.composer_assets(user_id,planner_id,kind,ready);
create index if not exists composer_queue on public.composer_compositions(status,created_at);
