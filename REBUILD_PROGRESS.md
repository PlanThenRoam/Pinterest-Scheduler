# Release 35 rebuild status

Implemented the agreed in-place three-tab Seller Studio: Editing, Posting, Storage. Retains the existing app URL, Supabase project, owner sign-in and Etsy connection. Removed the retired frontend files and obsolete image-recovery code.

65 automated tests pass: isolated listing updates, PDF integrity/replacement, one-request image/alt upload, uncertain-write locks and read-only reconciliation, new-listing verification before activation, owner-only Pinterest approval, signed DOCX transfer and safe retries, current-only storage, permanent cancellation, and release/cache consistency. Skill validation passes. These are controlled integration tests, not proof of live customer publication.

The coordinated database migration passed a transaction rollback dry run: 18 planner sections, three existing DOCX backups preserved, no retained content-history rows, 229 superseded objects queued for durable deletion. The other 15 planners have no existing DOCX in this app and must be supplied; images cannot be converted into the missing Word originals.

Pinterest OAuth handler deployed successfully. Its live health response reports configured:false. Supabase needs PINTEREST_APP_ID and PINTEREST_APP_SECRET, a registered callback, and owner OAuth consent before Pinterest can post. Never put secrets into the repo or chat.

Browser verification infrastructure has timed out, and the attempted local preview was blocked by the environment. Live visual/private-flow acceptance remains unverified. No customer Etsy listings or Pinterest pins were changed during the rebuild.

Release deployment and post-deployment results are recorded below as they complete.

## Deployment verification

Applied `seller_studio_current_docx_and_pinterest` to the existing Supabase project. Deployed seller-tools-inbox (function version 36, app 35/API 4.0.0), etsy-publish (21), pinterest-publish (1), pinterest-oauth (1), and the cleanup-only queue-worker (8).

Authenticated `list_review_projects` returned app 35/API 4.0.0 and the 18-action catalogue. Authenticated `list_master_files` returned 18 planners and exactly the three preserved DOCX backups. Cleanup completed: zero pending jobs after deleting 229 superseded objects.

Compared all 18 active Etsy listings before/after backend cutover: listing snapshots, image identities, order and alt text are unchanged. No Etsy writes or Pinterest posts were issued.

GitHub checks passed for commit 962e06fe7a9c956a75d82813cb95a9dea3b13064. Cleanup was then improved to batch object removals; focused cleanup tests passed again. Browser acceptance and Pinterest credentials/owner connection remain outstanding external requirements.

Frontend release 35 is live at the existing GitHub Pages URL. Deployment 34147907289 succeeded for merge 9cc84308f21dc2ec779e6b91c77e221b2ee67829. Direct HTTP checks returned the new studio shell and release 35/API 4.0.0. Downloaded Japan, NC500 and South Korea DOCX files and verified all three SHA-256 checksums.

Fixed the inherited Cron credential mismatch using a dedicated private Vault credential, service-only verification function and cleanup-only worker version 9. No secret values were exposed or written to the repository. Added two credential-boundary tests; 67 tests now pass. The current ChatGPT session still holds the previous connector schemas, so refresh its PlanThenRoam connection to load the new actions/required revision fields.

Remaining external blockers: Pinterest app credentials are not configured and owner OAuth consent is needed. Browser CDP failed again with a service timeout, so private browser acceptance and real platform publication are not claimed. Existing Etsy listings remained unchanged.
