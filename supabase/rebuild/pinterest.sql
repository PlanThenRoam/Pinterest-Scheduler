create table if not exists public.pinterest_credentials (
 user_id uuid primary key references auth.users(id),access_token text not null,refresh_token text,expires_at timestamptz not null
);
create table if not exists public.pinterest_oauth_states (
 state text primary key,user_id uuid not null references auth.users(id),expires_at timestamptz not null
);
alter table public.pinterest_credentials enable row level security;
alter table public.pinterest_oauth_states enable row level security;
revoke all on public.pinterest_credentials,public.pinterest_oauth_states from public,anon,authenticated;
grant all on public.pinterest_credentials,public.pinterest_oauth_states to service_role;
