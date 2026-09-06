alter table public.review_projects
  drop constraint if exists review_projects_status_check;

alter table public.review_projects
  add constraint review_projects_status_check
  check (status = any (array[
    'draft', 'uploading_assets', 'assets_verified', 'ready_to_render',
    'rendering', 'ready', 'changes_requested', 'editing', 'approved',
    'scheduled', 'publishing', 'published', 'failed'
  ]::text[]));
