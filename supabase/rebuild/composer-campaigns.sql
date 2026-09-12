-- Additive campaign storage. Existing publishing and master records are untouched.
create table if not exists public.composer_campaigns (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 planner_id uuid not null references public.seller_master_records(id), title text not null,
 revision int not null default 1, brief_hash text not null, queue_position int,
 source jsonb not null default '{}', slides jsonb not null default '[]',
 status text not null default 'planned' check(status in ('planned','submitted','exported','cancelled')),
 preparation_started_at timestamptz, first_submitted_at timestamptz, last_submitted_at timestamptz,
 export_bundle jsonb, metrics jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.composer_campaign_requests (
 user_id uuid not null references auth.users(id), request_key text not null, request_hash text not null,
 campaign_id uuid not null references public.composer_campaigns(id), primary key(user_id,request_key)
);
alter table public.composer_compositions add column if not exists campaign_id uuid references public.composer_campaigns(id);
alter table public.composer_compositions add column if not exists slide_number int check(slide_number between 1 and 5);
alter table public.composer_compositions add column if not exists job_kind text not null default 'render' check(job_kind in ('render','preflight'));
alter table public.composer_compositions add column if not exists queued_at timestamptz;
alter table public.composer_compositions add column if not exists started_at timestamptz;
alter table public.composer_compositions add column if not exists completed_at timestamptz;
alter table public.composer_compositions add column if not exists timings jsonb not null default '{}';
create unique index if not exists composer_campaign_slide on public.composer_compositions(campaign_id,slide_number) where campaign_id is not null;
create index if not exists composer_campaign_next on public.composer_campaigns(user_id,status,queue_position,created_at);
create table if not exists public.composer_render_attempts (
 id uuid primary key, composition_id uuid not null references public.composer_compositions(id),
 user_id uuid not null references auth.users(id), revision int not null, attempt int not null,
 job_kind text not null, queued_at timestamptz, started_at timestamptz not null,
 completed_at timestamptz, status text not null, timings jsonb not null default '{}', validation jsonb
);
create index if not exists composer_attempts_composition on public.composer_render_attempts(composition_id,revision,started_at);
alter table public.composer_campaigns enable row level security;
alter table public.composer_campaign_requests enable row level security;
alter table public.composer_render_attempts enable row level security;
revoke all on public.composer_campaigns,public.composer_campaign_requests,public.composer_render_attempts from anon,authenticated;
grant all on public.composer_campaigns,public.composer_campaign_requests,public.composer_render_attempts to service_role;
update storage.buckets set allowed_mime_types=array['image/png','application/zip'] where id='composer-private';

-- Owner validation occurs at MCP entry. These invoker functions are callable only
-- by service_role and preserve atomicity across all five private composition rows.
create or replace function public.composer_save_campaign(p_owner uuid,p_id uuid,p_expected int,p_key text,p_hash text,p_brief_hash text,p_title text,p_planner uuid,p_source jsonb,p_position int,p_preparation timestamptz,p_slides jsonb,p_queue boolean,p_job_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_request composer_campaign_requests; camp composer_campaigns; comp composer_compositions; item jsonb; slots jsonb='[]'; changed int=0; queued int=0; new_id uuid; is_new boolean=false; target_revision int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||'/'||p_key,0));
 select * into old_request from composer_campaign_requests where user_id=p_owner and request_key=p_key;
 if found then
  if old_request.request_hash<>p_hash then raise exception 'Idempotency key belongs to different content'; end if;
  return jsonb_build_object('campaign_id',old_request.campaign_id,'replayed',true);
 end if;
 if (jsonb_array_length(p_slides)<>5 and (p_queue or jsonb_array_length(p_slides)<>0)) or p_job_kind not in ('render','preflight') then raise exception 'Five numbered slides are required'; end if;
 if not exists(select 1 from seller_master_records where id=p_planner and user_id=p_owner) then raise exception 'Planner not found'; end if;
 select * into camp from composer_campaigns where id=p_id and user_id=p_owner for update;
 if not found then
  if p_expected is not null then raise exception 'Campaign not found'; end if;
  insert into composer_campaigns(id,user_id,planner_id,title,brief_hash,source,queue_position,preparation_started_at)
   values(p_id,p_owner,p_planner,p_title,p_brief_hash,p_source,p_position,p_preparation) returning * into camp; is_new=true;
 else
  if camp.status='cancelled' or camp.revision is distinct from p_expected then raise exception 'Campaign revision conflict'; end if;
  if camp.planner_id<>p_planner then raise exception 'A campaign cannot change planner'; end if;
 end if;
 for item in select value from jsonb_array_elements(p_slides) order by (value->>'number')::int loop
  if (item->>'number')::int<>jsonb_array_length(slots)+1 then raise exception 'Slides must be numbered 1 to 5'; end if;
  select * into comp from composer_compositions where campaign_id=camp.id and slide_number=(item->>'number')::int and user_id=p_owner for update;
  if not found then
   if not is_new and jsonb_array_length(camp.slides)>0 then raise exception 'Campaign slide missing'; end if;
   new_id=gen_random_uuid();
   insert into composer_compositions(id,user_id,campaign_id,slide_number,request_key,request_hash,spec,layout,assets)
    values(new_id,p_owner,camp.id,(item->>'number')::int,'campaign:'||camp.id||':'||(item->>'number'),item->>'hash',item->'composition',item->'layout',item->'assets') returning * into comp;changed=changed+1;
  else
   if (item->>'expected_revision')::int is distinct from comp.revision then raise exception 'Slide revision conflict'; end if;
   if comp.spec<>item->'composition' then
    insert into composer_revisions(composition_id,revision,user_id,spec,layout,assets,result) values(comp.id,comp.revision,p_owner,comp.spec,comp.layout,comp.assets,comp.result) on conflict do nothing;
    update composer_render_attempts set status='superseded',completed_at=now() where id=comp.lease and status='running';
    update composer_compositions set revision=revision+1,spec=item->'composition',layout=item->'layout',assets=item->'assets',request_hash=item->>'hash',status='draft',result=null,approved_revision=null,lease=null,lease_until=null,queued_at=null,started_at=null,completed_at=null,timings='{}',updated_at=now() where id=comp.id returning * into comp;changed=changed+1;
   end if;
  end if;
  if p_queue and (comp.status in ('draft','failed','validation_failed') or (comp.job_kind='preflight' and p_job_kind='render' and comp.status in ('queued','running'))) then
   update composer_compositions set status='queued',job_kind=p_job_kind,queued_at=now(),started_at=null,completed_at=null,attempts=0,lease=null,lease_until=null,result=null,updated_at=now() where id=comp.id returning * into comp;queued=queued+1;
  end if;
  slots=slots||jsonb_build_array(jsonb_build_object('number',comp.slide_number,'composition_id',comp.id));
 end loop;
 target_revision=camp.revision+case when not is_new and (changed>0 or camp.brief_hash<>p_brief_hash) then 1 else 0 end;
 update composer_campaigns set revision=target_revision,title=p_title,brief_hash=p_brief_hash,source=p_source,queue_position=p_position,slides=case when jsonb_array_length(p_slides)=0 then camp.slides else slots end,
  preparation_started_at=coalesce(camp.preparation_started_at,p_preparation),
  status=case when p_queue then 'submitted' when changed>0 then 'planned' else camp.status end,
  first_submitted_at=case when p_queue and p_job_kind='render' then coalesce(camp.first_submitted_at,now()) else camp.first_submitted_at end,
  last_submitted_at=case when p_queue then now() else camp.last_submitted_at end,
  updated_at=now()
 where id=camp.id;
 insert into composer_campaign_requests(user_id,request_key,request_hash,campaign_id) values(p_owner,p_key,p_hash,camp.id);
 return jsonb_build_object('campaign_id',camp.id,'revision',target_revision,'changed_slides',changed,'queued_slides',queued,'replayed',false);
end;$$;

create or replace function public.composer_claim_jobs(p_limit int default 2)
returns setof public.composer_compositions language plpgsql security invoker set search_path=public,pg_temp as $$
declare c composer_compositions;
begin
 update composer_render_attempts set status='lease_expired',completed_at=now() where status='running' and id in (select lease from composer_compositions where status='running' and lease_until<now());
 update composer_compositions set status=case when attempts<3 then 'queued' else 'failed' end,lease=null,lease_until=null,result=case when attempts>=3 then jsonb_build_object('error','Worker lease expired after three attempts') else result end where status='running' and lease_until<now();
 for c in select * from composer_compositions where status='queued' order by coalesce(queued_at,created_at),id for update skip locked limit greatest(1,least(p_limit,3)) loop
  update composer_compositions set status='running',lease=gen_random_uuid(),lease_until=now()+interval '15 minutes',started_at=now(),attempts=attempts+1 where id=c.id returning * into c;
  insert into composer_render_attempts(id,composition_id,user_id,revision,attempt,job_kind,queued_at,started_at,status) values(c.lease,c.id,c.user_id,c.revision,c.attempts,c.job_kind,coalesce(c.queued_at,c.created_at),c.started_at,'running');return next c;
 end loop;
end;$$;

create or replace function public.composer_approve_campaign(p_owner uuid,p_id uuid,p_revision int,p_snapshot jsonb,p_bundle jsonb,p_metrics jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare camp composer_campaigns; c composer_compositions; s jsonb; master_checksum text;
begin
 select * into camp from composer_campaigns where id=p_id and user_id=p_owner for update;
 if not found or camp.revision is distinct from p_revision or camp.status='cancelled' then raise exception 'Campaign revision conflict'; end if;
 if jsonb_array_length(p_snapshot)<>5 or (select count(distinct value->>'number') from jsonb_array_elements(p_snapshot))<>5 then raise exception 'Five reviewed slides required'; end if;
 select f->>'checksum' into master_checksum from seller_master_records m cross join lateral jsonb_array_elements(m.files) f where m.id=camp.planner_id and m.user_id=p_owner and f->>'role'='docx' limit 1;
 for s in select value from jsonb_array_elements(p_snapshot) order by (value->>'number')::int loop
  select * into c from composer_compositions where id=(s->>'composition_id')::uuid and campaign_id=camp.id and user_id=p_owner and slide_number=(s->>'number')::int for update;
  if not found or c.revision<>(s->>'revision')::int or c.status<>'ready' or (c.result->>'checksum') is distinct from (s->>'checksum') or (c.result->'validation'->>'valid') is distinct from 'true' then raise exception 'Reviewed slide changed or is not valid'; end if;
  if exists(select 1 from jsonb_array_elements(c.assets) a left join composer_assets live on live.id=(a->>'id')::uuid and live.user_id=p_owner where live.id is null or not live.ready or live.checksum<>a->>'checksum' or (live.kind='page' and live.source_checksum is distinct from master_checksum)) then raise exception 'Source changed before export'; end if;
  update composer_compositions set approved_revision=c.revision where id=c.id;
 end loop;
 if camp.export_bundle->>'review_token'=p_bundle->>'review_token' then return jsonb_build_object('approved',true,'campaign_id',camp.id,'revision',camp.revision,'bundle',camp.export_bundle); end if;
 update composer_campaigns set status='exported',export_bundle=p_bundle,metrics=metrics||p_metrics,updated_at=now() where id=camp.id;
 return jsonb_build_object('approved',true,'campaign_id',camp.id,'revision',camp.revision,'bundle',p_bundle,'previous_path',camp.export_bundle->>'path');
end;$$;
create or replace function public.composer_finish_job(p_id uuid,p_revision int,p_lease uuid,p_status text,p_result jsonb,p_timings jsonb,p_validation jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare c composer_compositions;
begin
 if p_status not in ('ready','draft','validation_failed','failed') then raise exception 'Invalid completion state'; end if;
 select * into c from composer_compositions where id=p_id and revision=p_revision and lease=p_lease and status='running' and lease_until>now() for update;
 if not found then return false; end if;
 update composer_compositions set status=p_status,result=p_result,timings=p_timings,completed_at=now(),lease=null,lease_until=null,updated_at=now() where id=c.id;
 insert into composer_render_attempts(id,composition_id,user_id,revision,attempt,job_kind,queued_at,started_at,completed_at,status,timings,validation)
  values(p_lease,c.id,c.user_id,c.revision,c.attempts,c.job_kind,coalesce(c.queued_at,c.created_at),coalesce(c.started_at,now()),now(),p_status,p_timings,p_validation)
  on conflict(id) do update set completed_at=excluded.completed_at,status=excluded.status,timings=excluded.timings,validation=excluded.validation;
 return true;
end;$$;
revoke all on function public.composer_finish_job(uuid,int,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.composer_finish_job(uuid,int,uuid,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.composer_save_campaign(uuid,uuid,int,text,text,text,text,uuid,jsonb,int,timestamptz,jsonb,boolean,text),public.composer_claim_jobs(int),public.composer_approve_campaign(uuid,uuid,int,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.composer_save_campaign(uuid,uuid,int,text,text,text,text,uuid,jsonb,int,timestamptz,jsonb,boolean,text),public.composer_claim_jobs(int),public.composer_approve_campaign(uuid,uuid,int,jsonb,jsonb,jsonb) to service_role;

-- Cancellation wins before storage cleanup. Paths remain available for safe retry.
create or replace function public.composer_cancel_campaign(p_owner uuid,p_id uuid,p_revision int)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare camp composer_campaigns; paths jsonb;
begin
 select * into camp from composer_campaigns where id=p_id and user_id=p_owner for update;
 if not found or camp.revision is distinct from p_revision then raise exception 'Campaign revision conflict'; end if;
 perform 1 from composer_compositions where campaign_id=p_id and user_id=p_owner order by slide_number for update;
 select coalesce(jsonb_agg(distinct path) filter(where path is not null),'[]') into paths from (
  select result->>'path' path from composer_compositions where campaign_id=p_id and user_id=p_owner
  union all select r.result->>'path' from composer_revisions r join composer_compositions c on c.id=r.composition_id where c.campaign_id=p_id and c.user_id=p_owner
  union all select camp.export_bundle->>'path'
 ) exports;
 update composer_render_attempts set status='cancelled',completed_at=now() where status='running' and composition_id in(select id from composer_compositions where campaign_id=p_id and user_id=p_owner);
 update composer_compositions set status='cancelled',lease=null,lease_until=null where campaign_id=p_id and user_id=p_owner;
 update composer_campaigns set status='cancelled',updated_at=now() where id=p_id;
 return jsonb_build_object('paths',paths);
end;$$;
create or replace function public.composer_purge_cancelled_campaign(p_owner uuid,p_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform 1 from composer_campaigns where id=p_id and user_id=p_owner and status='cancelled' for update;
 if not found then raise exception 'Campaign must be cancelled first'; end if;
 delete from composer_revisions where composition_id in(select id from composer_compositions where campaign_id=p_id and user_id=p_owner);
 update composer_compositions set spec='{}',assets='[]',layout='{}',result=null where campaign_id=p_id and user_id=p_owner and status='cancelled';
 update composer_campaigns set source='{}',export_bundle=null where id=p_id and user_id=p_owner;
 return true;
end;$$;
revoke all on function public.composer_cancel_campaign(uuid,uuid,int),public.composer_purge_cancelled_campaign(uuid,uuid) from public,anon,authenticated;
grant execute on function public.composer_cancel_campaign(uuid,uuid,int),public.composer_purge_cancelled_campaign(uuid,uuid) to service_role;
