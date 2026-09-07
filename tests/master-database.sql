-- Run with a database administrator against the deployed schema. All fixtures
-- are rolled back. Never upload or alter a real planner for this check.
begin;
do $$
declare owner_id uuid; master_id uuid; upload_id uuid; saved jsonb; initial jsonb;
begin
 select user_id into owner_id from public.app_owners limit 1;
 if owner_id is null then raise exception 'An app owner is required for this test'; end if;
 insert into public.seller_master_records(user_id,title,category) values(owner_id,'Master workflow test '||gen_random_uuid(),'planner') returning id into master_id;
 perform set_config('seller.test_master',master_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 initial:='[{"role":"docx","path":"test/word","checksum":"word-v1"},{"role":"pdf","path":"test/pdf","checksum":"pdf-v1"}]';
 insert into public.seller_master_uploads(user_id,master_id,expected_revision,files,reason) values(owner_id,master_id,0,initial,'Initial pair') returning id into upload_id;
 saved:=public.commit_seller_master(owner_id,master_id,0,initial,'Initial pair',upload_id);
 if saved->>'revision'<>'1' then raise exception 'Initial pair was not committed'; end if;
 saved:=public.commit_seller_master(owner_id,master_id,0,initial,'Retry same upload',upload_id);
 if saved->>'already_committed'<>'true' then raise exception 'Upload retry was not idempotent'; end if;
 begin
  perform public.commit_seller_master(owner_id,master_id,0,'[]','Stale update');
  raise exception 'Stale save was accepted';
 exception when serialization_failure then null;
 end;
 perform public.commit_seller_master(owner_id,master_id,1,'[]','Rename',null,null,'{"title":"Renamed database fixture"}');
 perform public.commit_seller_master(owner_id,master_id,2,'[]','Restore first pair',null,1);
 if (select revision from public.seller_master_records where id=master_id)<>3 then raise exception 'Restore did not create a new revision'; end if;
 if (select files from public.seller_master_records where id=master_id)<>initial then raise exception 'Restored files differ'; end if;
 if (select count(*) from public.seller_master_versions where seller_master_versions.master_id=current_setting('seller.test_master')::uuid)<>3 then raise exception 'History was lost'; end if;
end $$;
set local role authenticated;
do $$
begin
 if (select count(*) from public.seller_master_records where id=current_setting('seller.test_master')::uuid)<>1 then raise exception 'Owner cannot read master'; end if;
 begin
  update public.seller_master_records set files='[]' where id=current_setting('seller.test_master')::uuid;
  raise exception 'Browser can bypass versioned save';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.commit_seller_master(auth.uid(),current_setting('seller.test_master')::uuid,3,'[]','Bypass');
  raise exception 'Browser can invoke privileged save';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.seller_master_records where id=current_setting('seller.test_master')::uuid) then raise exception 'Non-owner can read master'; end if;
 if exists(select 1 from public.seller_master_versions where master_id=current_setting('seller.test_master')::uuid) then raise exception 'Non-owner can read history'; end if;
end $$;
reset role;
rollback;
select 'Master save, retry, conflict, restore and owner-isolation checks passed; fixtures rolled back.' as verification;
