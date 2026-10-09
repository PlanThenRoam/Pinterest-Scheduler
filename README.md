# PlanThenRoam Seller Studio

Private mobile-first app at the existing GitHub Pages URL. Release 40 / connector API 4.3.0.

Bottom tabs: Editing, Posting, Storage. Owner sign-in and existing Etsy access are retained.

- Editing: owner-approved title, price, description, alt text for an existing image, individual image replacement with matching alt text, and PDF replacement. Price-only changes need no attachments and use the existing shop currency. Proposed prices must be positive numbers with at most two decimal places. Alt-text-only changes use the existing image ID and position and require no upload. Unselected listing content is preserved and checked after publication.
- Posting: new Etsy listing with customer PDF, title, description, 13 tags and seven images/alt texts (thumbnail plus six listing images), verified before activation; shared defaults captured from an existing listing. Pinterest pins use an existing board and the planner's resolved Etsy link, with owner approval.
- Storage: one private current DOCX per planner, with verified replacement and durable deletion of superseded objects. No content history.

Run `npm ci --ignore-scripts` and `npm test` with Node 24. Tests use controlled platform responses and do not publish real customer content. Live platform acceptance must be reported separately.

Deploy the coordinated SQL in `supabase/rebuild`, then functions with all relative dependencies, then the static app. `queue-worker` performs only private storage cleanup; it has no publishing or scheduling code. The service worker caches only the public application shell. Version 40 is shared by release metadata, frontend and backend.

Pinterest requires `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET` in Supabase secrets and the callback URL `https://wyoamcydkbblvujvyljs.supabase.co/functions/v1/pinterest-oauth/callback` registered with Pinterest. The owner then connects from the account dialog. Tokens are stored in service-role-only tables. Never put credentials in repository files or chat messages.

Price updates use Etsy's inventory endpoint for single-product GBP digital planners. Current inventory is read before any write; quantity, SKU, enabled state, properties and processing-profile values are preserved and verified. Listing PATCH never accepts price. Price review finalisation performs a read-only live inventory and attachment check. Failed attempts remain locked until verified recovery; owner approval is still required.

New-listing prices remain the explicit submitted amount throughout creation, upload checkpoints and draft verification. The shared template price is not a proposed product price. A failed, fully uploaded GBP draft can reconcile only its proposed price through `update_review_project`, after read-only Etsy identity, price, copy and attachment verification. The revision/status guard and all other fields remain locked. The repair stays failed until `finalize_review_project` verifies the stored assets and restores owner review; it never publishes.
