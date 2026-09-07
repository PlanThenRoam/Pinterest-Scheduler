# PlanThenRoam Seller Studio

Private mobile-first app at the existing GitHub Pages URL. Release 35 / connector API 4.0.0.

Bottom tabs: Editing, Posting, Storage. Owner sign-in and existing Etsy access are retained.

- Editing: owner-approved title, description, individual image with matching alt text, and PDF replacement. Unselected listing content is preserved and checked after publication.
- Posting: new Etsy listing with customer PDF, title, description, 13 tags and six images/alt texts; shared defaults captured from an existing listing. Pinterest pins use an existing board and the planner's resolved Etsy link, with owner approval.
- Storage: one private current DOCX per planner, with verified replacement and durable deletion of superseded objects. No content history.

Run `npm ci --ignore-scripts` and `npm test` with Node 24. Tests use controlled platform responses and do not publish real customer content. Live platform acceptance must be reported separately.

Deploy the coordinated SQL in `supabase/rebuild`, then functions with all relative dependencies, then the static app. `queue-worker` performs only private storage cleanup; it has no publishing or scheduling code. The service worker caches only the public application shell. Version 35 is shared by release metadata, frontend and backend.

Pinterest requires `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET` in Supabase secrets and the callback URL `https://wyoamcydkbblvujvyljs.supabase.co/functions/v1/pinterest-oauth/callback` registered with Pinterest. The owner then connects from the account dialog. Tokens are stored in service-role-only tables. Never put credentials in repository files or chat messages.
