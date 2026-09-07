-- A dedicated private credential lets Cron retry cleanup without a user session.
do $$ begin
 if not exists(select 1 from vault.secrets where name='seller_storage_cleanup_token') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'seller_storage_cleanup_token','Private credential for Seller Studio storage cleanup only');
 end if;
end $$;
create or replace function public.verify_seller_cleanup_token(p_token text)
returns boolean language sql security definer set search_path='' as $$
 select length(p_token)=72 and exists(select 1 from vault.decrypted_secrets where name='seller_storage_cleanup_token' and decrypted_secret=p_token);
$$;
revoke all on function public.verify_seller_cleanup_token(text) from public,anon,authenticated;
grant execute on function public.verify_seller_cleanup_token(text) to service_role;
do $$ declare j record; begin
 for j in select jobid from cron.job where position('queue-worker' in command)>0 loop
  perform cron.alter_job(j.jobid,command:=$cron$
   select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/queue-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-token',(select decrypted_secret from vault.decrypted_secrets where name='seller_storage_cleanup_token')),
    body:='{}'::jsonb
   );
  $cron$);
 end loop;
end $$;
