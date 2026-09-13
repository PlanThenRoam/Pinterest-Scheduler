-- Additive automatic art direction. No source assets, existing exports or publisher settings change.
create table if not exists public.composer_promotions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 planner_ids uuid[] not null, revision integer not null default 1, record jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.composer_campaign_plans (
 user_id uuid not null references auth.users(id),planner_id uuid not null references seller_master_records(id),
 revision integer not null default 1,record jsonb not null,updated_at timestamptz not null default now(),primary key(user_id,planner_id)
);
create table if not exists public.composer_design_history (
 user_id uuid not null references auth.users(id),campaign_id uuid not null references composer_campaigns(id),
 revision integer not null,record jsonb not null,created_at timestamptz not null default now(),primary key(user_id,campaign_id)
);
create table if not exists public.composer_export_history (
 user_id uuid not null references auth.users(id),campaign_id uuid not null references composer_campaigns(id),
 revision integer not null,review_token text not null,review_kind text not null,bundle jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,campaign_id,revision,review_token,review_kind)
);
alter table composer_promotions enable row level security;
alter table composer_campaign_plans enable row level security;
alter table composer_design_history enable row level security;
alter table composer_export_history enable row level security;
revoke all on composer_promotions,composer_campaign_plans,composer_design_history,composer_export_history from anon,authenticated;
grant all on composer_promotions,composer_campaign_plans,composer_design_history,composer_export_history to service_role;
create index if not exists composer_history_recent on composer_design_history(user_id,created_at desc);
alter table composer_compositions drop constraint if exists composer_compositions_slide_number_check;
alter table composer_compositions add constraint composer_compositions_slide_number_check check(slide_number between 1 and 20);
create or replace function public.composer_save_campaign(p_owner uuid,p_id uuid,p_expected int,p_key text,p_hash text,p_brief_hash text,p_title text,p_planner uuid,p_source jsonb,p_position int,p_preparation timestamptz,p_slides jsonb,p_queue boolean,p_job_kind text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_request composer_campaign_requests; camp composer_campaigns; comp composer_compositions; item jsonb; slots jsonb='[]'; changed int=0; queued int=0; new_id uuid; is_new boolean=false; target_revision int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||'/composer-history',0));
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||'/'||p_key,0));
 select * into old_request from composer_campaign_requests where user_id=p_owner and request_key=p_key;
 if found then
  if old_request.request_hash<>p_hash then raise exception 'Idempotency key belongs to different content'; end if;
  return jsonb_build_object('campaign_id',old_request.campaign_id,'replayed',true);
 end if;
 if p_source ? 'automatic' then
  if jsonb_array_length(p_slides) not between 1 and 20 then raise exception 'Automatic batch needs one to twenty outputs'; end if;
  if (p_source->'automatic'->'history_snapshot') is distinct from (select coalesce(jsonb_agg(jsonb_build_object('campaign_id',h.campaign_id,'revision',h.revision) order by h.created_at desc),'[]') from (select campaign_id,revision,created_at from composer_design_history where user_id=p_owner order by created_at desc limit 10) h) then raise exception 'HISTORY_CHANGED: retrieve context and retry with a new request key'; end if;
 else
  if (jsonb_array_length(p_slides)<>5 and (p_queue or jsonb_array_length(p_slides)<>0)) then raise exception 'Five numbered slides are required'; end if;
 end if;
 if p_job_kind not in ('render','preflight') then raise exception 'Invalid job kind'; end if;
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
  if (item->>'number')::int<>jsonb_array_length(slots)+1 then raise exception 'Outputs must be numbered consecutively'; end if;
  select * into comp from composer_compositions where campaign_id=camp.id and slide_number=(item->>'number')::int and user_id=p_owner for update;
  if not found then
   if not is_new and jsonb_array_length(camp.slides)>0 then raise exception 'Campaign output count is immutable; create a new campaign'; end if;
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
 if p_source ? 'automatic' then
  insert into composer_design_history(user_id,campaign_id,revision,record) values(p_owner,camp.id,target_revision,(p_source->'automatic'->'signatures')||jsonb_build_object('planner_id',p_planner,'seed',p_source->'automatic'->'seed','preset_version',p_source->'automatic'->'version','asset_versions',p_source->'automatic'->'asset_versions','exceptions',p_source->'automatic'->'exceptions')) on conflict(user_id,campaign_id) do update set revision=excluded.revision,record=excluded.record;
 end if;
 insert into composer_campaign_requests(user_id,request_key,request_hash,campaign_id) values(p_owner,p_key,p_hash,camp.id);
 return jsonb_build_object('campaign_id',camp.id,'revision',target_revision,'changed_slides',changed,'queued_slides',queued,'replayed',false);
end;$$;

-- A technical export is not owner approval. This transaction rechecks every
-- current revision and source after ZIP verification, under row locks.
create or replace function public.composer_record_automatic_export(p_owner uuid,p_id uuid,p_revision int,p_snapshot jsonb,p_bundle jsonb,p_metrics jsonb,p_owner_approved boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare camp composer_campaigns; c composer_compositions; s jsonb; master_checksum text; promo composer_promotions;
begin
 select * into camp from composer_campaigns where id=p_id and user_id=p_owner for update;
 if not found or camp.revision is distinct from p_revision or camp.status='cancelled' then raise exception 'Campaign revision conflict'; end if;
 for s in select value from jsonb_array_elements(coalesce(p_bundle->'promotion_snapshots','[]')) loop
  if coalesce((s->>'enforced')::boolean,false) then
   select * into promo from composer_promotions where id=(s->>'id')::uuid and user_id=p_owner for share;
   if not found or promo.revision<>(s->>'revision')::int or promo.record->>'confirmation_status'<>'confirmed' or now()>=(promo.record->>'ends_at')::timestamptz then raise exception 'PROMOTION_CHANGED_OR_EXPIRED: review current promotion before export'; end if;
  end if;
 end loop;
 if jsonb_array_length(p_snapshot)<>jsonb_array_length(camp.slides) or (select count(distinct value->>'number') from jsonb_array_elements(p_snapshot))<>jsonb_array_length(camp.slides) then raise exception 'All reviewed outputs required'; end if;
 select f->>'checksum' into master_checksum from seller_master_records m cross join lateral jsonb_array_elements(m.files) f where m.id=camp.planner_id and m.user_id=p_owner and f->>'role'='docx' limit 1;
 for s in select value from jsonb_array_elements(p_snapshot) order by (value->>'number')::int loop
  select * into c from composer_compositions where id=(s->>'composition_id')::uuid and campaign_id=camp.id and user_id=p_owner and slide_number=(s->>'number')::int for update;
  if not found or c.revision<>(s->>'revision')::int or c.status<>'ready' or (c.result->>'checksum') is distinct from (s->>'checksum') or (c.result->'validation'->>'valid') is distinct from 'true' then raise exception 'Reviewed output changed'; end if;
  if exists(select 1 from jsonb_array_elements(c.assets) a left join composer_assets live on live.id=(a->>'id')::uuid and live.user_id=p_owner where live.id is null or not live.ready or live.checksum<>a->>'checksum' or (live.kind='page' and live.source_checksum is distinct from master_checksum)) then raise exception 'Source changed before export'; end if;
  if p_owner_approved then update composer_compositions set approved_revision=c.revision where id=c.id; end if;
 end loop;
 insert into composer_export_history(user_id,campaign_id,revision,review_token,review_kind,bundle) values(p_owner,p_id,p_revision,p_bundle->>'review_token',p_bundle->>'review_kind',p_bundle) on conflict do nothing;
 update composer_campaigns set metrics=metrics||jsonb_build_object('automatic_export',p_metrics),status=case when p_owner_approved then 'exported' else status end,export_bundle=case when p_owner_approved then p_bundle else export_bundle end where id=camp.id;
 return jsonb_build_object('saved',true,'owner_approved',p_owner_approved);
end;$$;
revoke all on function public.composer_record_automatic_export(uuid,uuid,int,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.composer_record_automatic_export(uuid,uuid,int,jsonb,jsonb,jsonb,boolean) to service_role;

-- Seed editable marketing instructions from the owner's explicit brief. Exact
-- advance/active wording has not been approved, so it remains pending_wording.
insert into composer_campaign_plans(user_id,planner_id,record)
select user_id,id,jsonb_build_object('priority',case when title ilike '%Salem%' or title ilike '%New England%' then 100 when title ilike '%Christmas%' then 60 else 20 end,'focus',case when title ilike '%Salem%' or title ilike '%New England%' then 'Priority autumn promotion' when title ilike '%Christmas%' then 'Secondary Christmas focus' when title ilike '%Munich%' then 'Final campaign for this season' else 'Evergreen collection' end,'final_campaign_for_season',title ilike '%Munich%','season','2026','timezone','Europe/London','promotion_required',title ilike '%Salem%' or title ilike '%New England%','notes','Business timezone defaults to Europe/London and is editable. Munich latest campaign is its final campaign for the 2026 season.') from seller_master_records where category='planner' on conflict do nothing;
insert into composer_promotions(user_id,planner_ids,record)
select user_id,array_agg(id),jsonb_build_object('planner_ids',to_jsonb(array_agg(id)),'discount_percent',15,'starts_at','2026-09-13T23:00:00Z','ends_at','2026-09-20T23:00:00Z','announce_from','2026-09-12T23:00:00Z','timezone','Europe/London','date_wording','14–20 September 2026','confirmation_status','pending_wording','approved_wording',jsonb_build_object(),'enabled',true)
from seller_master_records m where (title ilike '%Salem%' or title ilike '%New England%') and not exists(select 1 from composer_promotions p where p.user_id=m.user_id and p.record->>'date_wording'='14–20 September 2026') group by user_id;
-- Seed actual legacy campaign history without inventing approvals or similarity
-- measurements. Original image identities are read from the verified asset rows.
insert into composer_design_history(user_id,campaign_id,revision,record,created_at)
select c.user_id,c.id,c.revision,jsonb_build_object('planner_id',c.planner_id,'legacy',true,'carousel',jsonb_build_object('font_pairing',jsonb_build_array(min(x.spec->>'font_family')),'font_category','serif','headline_treatment','legacy','layout_structure',jsonb_agg(x.spec->>'layout_preset' order by x.slide_number),'hierarchy','legacy','alignment','center','cta',jsonb_build_array(),'colour','legacy','background_ids',jsonb_agg(x.spec->>'background_id' order by x.slide_number),'source_images',jsonb_agg(coalesce(a.metadata->>'source_asset_id',a.id::text) order by x.slide_number)),'pins',jsonb_build_array()),c.created_at
from composer_campaigns c join composer_compositions x on x.campaign_id=c.id left join composer_assets a on a.id=(x.spec->>'background_id')::uuid where c.status<>'cancelled' and not (c.source ? 'automatic') and x.spec->>'output_type'='square' group by c.user_id,c.id,c.revision,c.planner_id,c.created_at on conflict do nothing;
