-- Master objects are immutable. Only the authenticated owner-facing service
-- may advance a master revision; browsers have read-only table access.
create table public.seller_master_records (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 title text not null check (length(btrim(title)) between 1 and 180),
 category text not null check (category in ('planner','blueprint','image','other')),
 listing_id text check (listing_id is null or listing_id ~ '^[0-9]+$'),
 revision integer not null default 0 check (revision >= 0),
 files jsonb not null default '[]' check (jsonb_typeof(files) = 'array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index seller_master_owner_title on public.seller_master_records(user_id, lower(title));
create index seller_master_owner_updated on public.seller_master_records(user_id, updated_at desc);
create table public.seller_master_versions (
 master_id uuid not null references public.seller_master_records(id),
 user_id uuid not null references auth.users(id),
 revision integer not null check (revision > 0),
 title text not null, category text not null, listing_id text,
 files jsonb not null, reason text not null,
 restored_from integer, created_at timestamptz not null default now(),
 primary key(master_id, revision)
);
create index seller_master_versions_owner on public.seller_master_versions(user_id);
create table public.seller_master_uploads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 master_id uuid not null references public.seller_master_records(id),
 expected_revision integer not null check (expected_revision >= 0),
 files jsonb not null check (jsonb_typeof(files) = 'array'),
 reason text not null,
 status text not null default 'prepared' check(status in ('prepared','committed','cancelled')),
 result_revision integer,
 expires_at timestamptz not null default now() + interval '2 hours',
 created_at timestamptz not null default now()
);
create index seller_master_uploads_owner on public.seller_master_uploads(user_id, master_id);
create table public.seller_master_publications (
 master_id uuid not null references public.seller_master_records(id),
 user_id uuid not null references auth.users(id),
 role text not null, listing_id text not null,
 checksum text not null, master_revision integer not null,
 project_id uuid not null references public.review_projects(id),
 published_at timestamptz not null default now(),
 primary key(master_id, role, listing_id)
);
create index seller_master_publications_owner on public.seller_master_publications(user_id);
create index seller_master_publications_project on public.seller_master_publications(project_id);

alter table public.seller_master_records enable row level security;
alter table public.seller_master_versions enable row level security;
alter table public.seller_master_uploads enable row level security;
alter table public.seller_master_publications enable row level security;
create policy master_records_owner_read on public.seller_master_records for select to authenticated using(user_id=(select auth.uid()) and (select private.is_app_owner()));
create policy master_versions_owner_read on public.seller_master_versions for select to authenticated using(user_id=(select auth.uid()) and (select private.is_app_owner()));
create policy master_uploads_owner_read on public.seller_master_uploads for select to authenticated using(user_id=(select auth.uid()) and (select private.is_app_owner()));
create policy master_publications_owner_read on public.seller_master_publications for select to authenticated using(user_id=(select auth.uid()) and (select private.is_app_owner()));
revoke all on public.seller_master_records, public.seller_master_versions, public.seller_master_uploads, public.seller_master_publications from anon, authenticated;
grant select on public.seller_master_records, public.seller_master_versions, public.seller_master_uploads, public.seller_master_publications to authenticated;
grant all on public.seller_master_records, public.seller_master_versions, public.seller_master_uploads, public.seller_master_publications to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('seller-master-files','seller-master-files',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','image/webp','application/zip'])
on conflict(id) do nothing;
create policy master_objects_owner_read on storage.objects for select to authenticated
using(bucket_id='seller-master-files' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.is_app_owner()));
-- Uploads use unique signed upload destinations issued by the owner-checked
-- service. No browser UPDATE or DELETE policies can erase saved history.
update storage.buckets set allowed_mime_types=array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','image/png','image/jpeg','image/webp'] where id='etsy-assets';

create function public.commit_seller_master(p_user uuid,p_master uuid,p_expected integer,p_files jsonb,p_reason text,p_upload uuid default null,p_restore integer default null,p_metadata jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.seller_master_records; u public.seller_master_uploads; v public.seller_master_versions; next_files jsonb;
begin
 if not exists(select 1 from public.app_owners where user_id=p_user) then raise exception 'Owner access required'; end if;
 select * into r from public.seller_master_records where id=p_master and user_id=p_user for update;
 if not found then raise exception 'Master not found or access denied'; end if;
 if p_upload is not null then
  select * into u from public.seller_master_uploads where id=p_upload and master_id=p_master and user_id=p_user for update;
  if not found then raise exception 'Upload not found'; end if;
  if u.status='committed' then return jsonb_build_object('master_id',r.id,'revision',u.result_revision,'already_committed',true); end if;
  if u.status<>'prepared' or u.expires_at<now() then raise exception 'Upload expired or cancelled'; end if;
  if u.expected_revision<>p_expected or u.files<>p_files then raise exception 'Upload manifest mismatch'; end if;
 end if;
 if r.revision<>p_expected then raise exception 'Version conflict: current revision is %. Fetch the latest master before saving.',r.revision using errcode='40001'; end if;
 if p_restore is not null then
  select * into v from public.seller_master_versions where master_id=p_master and user_id=p_user and revision=p_restore;
  if not found then raise exception 'Saved version not found'; end if;
  next_files:=v.files;
  r.title:=v.title; r.category:=v.category; r.listing_id:=v.listing_id;
 else
  if p_upload is null and p_files<>'[]'::jsonb then raise exception 'Files require a verified upload'; end if;
  select coalesce(jsonb_agg(f order by f->>'role'),'[]'::jsonb) into next_files from (
   select f from jsonb_array_elements(r.files) f where not exists(select 1 from jsonb_array_elements(p_files) n where n->>'role'=f->>'role')
   union all select f from jsonb_array_elements(p_files) f
  ) merged;
  if p_metadata is not null then
   r.title:=coalesce(p_metadata->>'title',r.title); r.category:=coalesce(p_metadata->>'category',r.category);
   if p_metadata ? 'listing_id' then r.listing_id:=nullif(p_metadata->>'listing_id',''); end if;
  end if;
 end if;
 if length(btrim(p_reason)) not between 1 and 500 then raise exception 'A change note is required'; end if;
 if jsonb_array_length(next_files)>30 then raise exception 'Maximum 30 files per master'; end if;
 update public.seller_master_records set title=r.title,category=r.category,listing_id=r.listing_id,revision=r.revision+1,files=next_files,updated_at=now() where id=r.id returning * into r;
 insert into public.seller_master_versions(master_id,user_id,revision,title,category,listing_id,files,reason,restored_from)
 values(r.id,p_user,r.revision,r.title,r.category,r.listing_id,r.files,p_reason,p_restore);
 if p_upload is not null then update public.seller_master_uploads set status='committed',result_revision=r.revision where id=p_upload; end if;
 return jsonb_build_object('master_id',r.id,'revision',r.revision,'saved',true);
end $$;
revoke all on function public.commit_seller_master(uuid,uuid,integer,jsonb,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.commit_seller_master(uuid,uuid,integer,jsonb,text,uuid,integer,jsonb) to service_role;
