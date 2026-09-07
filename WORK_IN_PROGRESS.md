# Seller Tools improvements: paused checkpoint

The owner asked to save the current work and continue later. Nothing in this checkpoint has been deployed. Keep sign-in, owner-only database access and private storage.

## Implemented locally, not yet validated

- Fixed numeric Etsy ID validation and added cross-origin request headers.
- Added preflight checks, attachment integrity checks, before/after comparisons and a durable publishing journal for existing-listing changes.
- Replacements upload the new file before deleting the selected original. Automatic replacement at five files is blocked safely.
- Added a migration for publishing locks/history and automatic project snapshots.
- Retained prior attachments and restored media references with project revisions.
- Changed project clearing to archive in the connector backend.
- Allowed Pinterest batches of 1–50 Pins in backend validation.
- Added shared frontend validation, performance-input validation, new styles and release metadata for proposed version 26 / API 3.2.0.

## Exact next steps

1. Finish the frontend workspace integration. `core.js`, `workspace.css` and `release.json` exist but are not wired into `index.html`. No new listing editor, history screen or sample-data mode has been completed.
2. Add searchable live listings, independently selected title/description/13 tags/price edits, file add/replace controls, image and alt-text editing, clear before/after review, asset preview, recoverable archive and revision history.
3. Replace misleading Pinterest publishing/scheduling labels with honest manual preparation/planning flows until an actual approved publisher exists.
4. Wire the version checks and service worker to version 26. Current `index.html` and `sw.js` are still version 25. Do not deploy this mixed checkpoint.
5. Review and test the backend changes, especially locking, failed/uncertain requests, snapshot concurrency, safe file replacement, preservation of omitted fields, and complete verification of images/files. New-listing publishing still needs review for uncertain upload outcomes.
6. Complete the publishing-history UI, including explicit owner acknowledgement of an unresolved run after checking Etsy. The endpoint exists but UI and stalled-run handling are unfinished.
7. Add regression tests and run interface tests with fictional sample data. No tests for this checkpoint have been completed. Never test by changing the owner's live Etsy listings.
8. Run Supabase security advisors and schema checks, then apply the migration and deploy the backend/frontend together only when tested. Verify the deployed code, version and private-data access controls.

## Access and sources

- GitHub: `PlanThenRoam/Pinterest-Scheduler`, production branch `main`.
- Supabase project: `wyoamcydkbblvujvyljs`.
- App: `https://planthenroam.github.io/Pinterest-Scheduler/`.
- Owner confirmed that sign-in must remain. A sample-data test mode must never expose real private records or enable real publishing without authentication.

Do not describe this checkpoint as finished, verified or deployed. Continue from the frontend integration; do not restart the review or discard these changes.
