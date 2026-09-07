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

## Continuation
Implemented current-DOCX storage admission, current-only reads, delete action, transactional replacement and durable old-object cleanup. Proposed SQL passed a BEGIN/ROLLBACK dry run against production: 18 planner records and zero records with multiple current files; no live changes persisted. Removed historical-version validation from PDF publishing because customer PDFs are review assets rather than storage masters in the agreed model.

Connector catalogue and backend edit validation now restrict edits to title, description, images with matching alt text and PDF replacements. Added idempotency keys for new review submissions. Added existing Pinterest-board retrieval, planner-to-Etsy matching and a Pinterest publisher adapter with a persisted attempt guard/readback. These Pinterest paths remain untested live and require an authorised access token; no OAuth connection flow yet.

Official Etsy OpenAPI specification retrieved at https://www.etsy.com/openapi/generated/oas/3.0.0.json clarifies listing_image_id is for assigning a previously deleted image. Removed the extra existing-ID reassignment after image upload in edit and new-listing flows. One upload carries image and alt_text; existing readback remains. The old image gate is STILL PRESENT and must be replaced only after appropriate integration verification. Do not claim live image behaviour verified.

Focused rebuild tests: 15 passing. Legacy image-master/version tests intentionally conflict with revised scope; replace those tests while retaining byte-integrity and retry coverage. Remaining: complete stale-approval protection for connector writes, pin OAuth/setup and live readback, asset cleanup across all histories, create/edit retry reconciliation, authoritative live draft image check, browser visual QA, deployment/version/cache coordination, obsolete component deletion. No production deployment or destructive migration yet.
