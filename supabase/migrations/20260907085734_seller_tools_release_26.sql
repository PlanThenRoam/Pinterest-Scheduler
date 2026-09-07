create table public.seller_publish_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.review_projects(id) on delete restrict,
  listing_key text not null,
  revision integer not null,
  status text not null check (status in ('running','succeeded','blocked','needs_review','dismissed')),
  steps jsonb not null default '[]'::jsonb,
  before_state jsonb,
  after_state jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.seller_publish_runs enable row level security;
revoke all on public.seller_publish_runs from anon, authenticated;
grant select on public.seller_publish_runs to authenticated;
grant all on public.seller_publish_runs to service_role;
create policy owner_reads_publish_runs on public.seller_publish_runs
  for select to authenticated using (private.is_app_owner());
create unique index seller_one_open_run_per_listing on public.seller_publish_runs(listing_key)
  where status in ('running','needs_review');
create index seller_runs_project_history on public.seller_publish_runs(project_id,created_at desc);

create or replace function private.snapshot_review_project()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.manifest is distinct from new.manifest or old.media is distinct from new.media
     or old.title is distinct from new.title or old.preview_path is distinct from new.preview_path then
    if old.status = 'publishing' and current_user = 'authenticated' then
      raise exception 'Wait for the current publishing operation before editing this project.';
    end if;
    insert into public.review_project_versions(project_id,revision,name,title,manifest,media)
      values (old.id,old.revision,'Saved before revision ' || (old.revision+1),old.title,old.manifest,old.media)
      on conflict (project_id,revision) do nothing;
    new.revision := greatest(new.revision,old.revision+1);
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_review_project() from public;
create trigger preserve_review_project_revision before update on public.review_projects
  for each row execute function private.snapshot_review_project();
