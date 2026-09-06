alter table public.creative_styles
alter column channels set default array['pinterest','etsy']::text[];

delete from public.creative_styles
where channels <@ array['tiktok']::text[];

update public.creative_styles
set channels = array_remove(channels, 'tiktok'),
    updated_at = now()
where 'tiktok' = any(channels);
