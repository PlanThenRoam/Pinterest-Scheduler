# Rebuild checkpoint

Implementation branch: rebuild/three-tab-workspace. Not deployed.

Completed: replaced the old layered frontend entry point with studio.js/studio.css; bottom navigation Editing, Posting, Storage; owner sign-in; review of current/proposed title, description, images and alt text; PDF preview; new listing and pin preview; current DOCX display/download/upload controls; failed submissions cannot be blindly re-approved. Added permanent cancellation handler that claims the pending record before cleanup and blocks unresolved publication deletion. Nine focused UI/cancellation tests pass.

Remaining before release:
- Complete current-DOCX-only storage backend including deletion, atomic replacement and removal of historical objects. UI currently calls delete_master_file, not yet registered. Existing upload backend still retains history. Do not deploy UI as complete.
- Replace/restrict MCP catalogue to agreed operations, with actual file transfer and retry-safe create/update calls. Remove creative/history/schedule actions and validate same rules server-side.
- Fix and verify image replacement plus matching alt text using authoritative Etsy API behaviour, without speculative re-association writes. Prior image gate remains; do not lift it on unit tests alone.
- Pinterest live status is trial_pending. Implement supported OAuth/boards/publish integration; real approval posting cannot be proved until access is active.
- Implement deletion cleanup as a durable operation, handle concurrent connector edits and stale/cancelled project mutations, and reconcile uncertain external writes without retaining old asset versions.
- Verify shared listing defaults against current Etsy listings, approval revision check, new-listing idempotency, readback and receipts.
- Browser visual QA and full integration tests. Existing legacy tests target old interface and will need replacement where scope intentionally changed.
- Service worker/cache cutover and coordinated release version; deploy same URL only after backend compatibility is verified.
- Migrate current DOCX backups, remove obsolete live tables/functions/assets and source files after dependency review. Nothing live deleted yet.

Live baseline: GitHub main e3763cd049426af07ab80f35b3365a55ccf2b979 (app33). Supabase publisher20/inbox34 contain candidate app34 safety pause. These are pre-existing deployment differences, not introduced by this checkpoint.
