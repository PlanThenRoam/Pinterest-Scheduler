-- Apply at coordinated cutover, after preserving all current DOCX files.
-- Cleanup jobs are transient references, never downloadable version history.
create table if not exists public.seller_storage_cleanup (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 bucket text not null,
 path text not null,
 created_at timestamptz not null default now(),
 unique(bucket,path)
);
alter table public.seller_storage_cleanup enable row level security;
revoke all on public.seller_storage_cleanup from public,anon,authenticated;
grant all on public.seller_storage_cleanup to service_role;

create or replace function public.commit_seller_master(p_user uuid,p_master uuid,p_expected integer,p_files jsonb,p_reason text,p_upload uuid default null,p_restore integer default null,p_metadata jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.seller_master_records; u public.seller_master_uploads; next_files jsonb;
begin
 if not exists(select 1 from public.app_owners where user_id=p_user) then raise exception 'Owner access required'; end if;
 if p_restore is not null then raise exception 'Only current Word backups are retained'; end if;
 select * into r from public.seller_master_records where id=p_master and user_id=p_user for update;
 if not found then raise exception 'Planner not found'; end if;
 if p_upload is not null then
  select * into u from public.seller_master_uploads where id=p_upload and master_id=p_master and user_id=p_user for update;
  if not found then raise exception 'Upload not found'; end if;
  if u.status='committed' then return jsonb_build_object('master_id',r.id,'revision',u.result_revision,'already_committed',true); end if;
  if u.status<>'prepared' or u.expires_at<now() then raise exception 'Upload expired or cancelled'; end if;
  if u.expected_revision<>p_expected or u.files<>p_files then raise exception 'Upload manifest mismatch'; end if;
  if jsonb_array_length(p_files)<>1 or p_files->0->>'role'<>'docx' or p_files->0->>'mime'<>'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then raise exception 'Storage accepts one DOCX per planner'; end if;
  next_files:=p_files;
 else
  if p_files<>'[]'::jsonb then raise exception 'Files require a verified upload'; end if;
  next_files:=case when coalesce((p_metadata->>'delete_docx')::boolean,false) then '[]'::jsonb else r.files end;
 end if;
 if r.revision<>p_expected then raise exception 'The current backup changed. Refresh before saving.' using errcode='40001'; end if;
 insert into public.seller_storage_cleanup(user_id,bucket,path)
 select p_user,'seller-master-files',f->>'path' from jsonb_array_elements(r.files) f
 where not exists(select 1 from jsonb_array_elements(next_files) n where n->>'path'=f->>'path')
 on conflict(bucket,path) do nothing;
 update public.seller_master_records set files=next_files,revision=revision+1,updated_at=now(),
 title=coalesce(p_metadata->>'title',title),category='planner' where id=r.id returning * into r;
 if p_upload is not null then update public.seller_master_uploads set status='committed',result_revision=r.revision where id=p_upload; end if;
 return jsonb_build_object('master_id',r.id,'revision',r.revision,'saved',true);
end $$;
revoke all on function public.commit_seller_master(uuid,uuid,integer,jsonb,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_seller_master(uuid,uuid,integer,jsonb,text,uuid,integer,jsonb) to service_role;

-- Retain only operational concurrency counters, not previous content.
create or replace function private.snapshot_review_project()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.manifest is distinct from new.manifest or old.media is distinct from new.media or old.title is distinct from new.title or old.preview_path is distinct from new.preview_path then
  if old.status='publishing' and current_user='authenticated' then raise exception 'Publication is in progress'; end if;
  new.revision:=greatest(new.revision,old.revision+1);
 end if;
 return new;
end $$;

-- Queue all superseded master objects, preserving the exact current DOCX.
insert into public.seller_storage_cleanup(user_id,bucket,path)
select r.user_id,'seller-master-files',o.name
from storage.objects o join public.seller_master_records r on o.name like r.user_id::text||'/'||r.id::text||'/%'
where o.bucket_id='seller-master-files' and not exists(
 select 1 from jsonb_array_elements(r.files) f where f->>'role'='docx' and f->>'path'=o.name
)
on conflict(bucket,path) do nothing;
update public.seller_master_records r set files=(select coalesce(jsonb_agg(f),'[]'::jsonb) from jsonb_array_elements(r.files) f where f->>'role'='docx'),category='planner';
delete from public.seller_master_versions;
delete from public.review_project_versions;
