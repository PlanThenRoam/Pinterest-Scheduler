# PlanThenRoam Seller Tools

Private, phone-first review workspace for Etsy listing edits and Pinterest content packs. Release 27 keeps owner sign-in and private storage.

## Release 27

- Master Files catalogue for planners, blueprints, images and other assets, separate from review projects.
- Private Word/PDF/image/ZIP uploads with SHA-256 verification, immutable storage, atomic version changes and optimistic concurrency.
- Current downloads, version history, restore, listing links and verified publishing records.
- ChatGPT actions to retrieve current masters, prepare signed uploads, commit a version and stage selected Etsy file updates.
- Word files remain DOCX in Master Files and are wrapped in ZIP when staged for Etsy.

## Existing Listing Tools

- Search live Etsy listings by title and state, then prepare an update from current listing data.
- Independently edit title, description, 13 tags, price, selected images, alt text and digital file additions/replacements.
- Compare current and proposed values before applying an update.
- Preserve original files until their replacement upload is confirmed. Five-file listings are blocked from automatic replacement because Etsy offers no transactional swap; free a slot or replace in Etsy.
- Record attempted and confirmed publishing steps, block duplicate/uncertain requests, and verify selected and preserved fields afterwards.
- Open completed projects, restore saved project revisions with attachments, and archive instead of permanently clearing files.
- Prepare Pinterest images/copy and manual posting plans. Automatic Pinterest publishing is unavailable until the platform approval and delivery adapter are complete.
- Manually record Etsy Stats periods. Conversion uses orders divided by shop visits; unknown values remain unknown.
- Shared sample-data mode at `?demo=1` uses fictional data and never calls private data or publishing endpoints. The normal app still requires owner sign-in.

## Validation And Deployment

Use Node 24 or newer. Run `npm ci --ignore-scripts` then `npm test`.

The release metadata, frontend build, service-worker cache and connector app version must agree. Regression tests enforce this and run on GitHub pushes.

Apply all tracked migrations, including `seller_master_files`, before deploying the updated `etsy-publish` and `seller-tools-inbox` functions. Include `safe-edit.ts` and `safety.ts` with the publisher and `master-files.ts` with the inbox. Run `tests/master-database.sql` through an administrator connection to verify permissions, conflicts and restores without retaining fixtures. Both functions validate the caller themselves using Supabase Auth and owner checks; preserve their existing gateway configuration. Deploy the static frontend after the backend. Verify the authenticated connector status and unauthenticated access denial after release.

Changing an Etsy listing requires the owner's final approval in the app. Test publishing failures with mocks, never by editing production listings.

## Review workflow

- **Etsy:** customer PDF, thumbnail, listing gallery, title, description, 13 tags, alt text, edit and clear. Publishing remains locked until the approved Etsy API connection is enabled.
- **Pinterest:** a 1–50-Pin batch with images, SEO copy, exact links and boards, edit, clear, manual copying, image download and posting plans. Direct publishing remains locked until Pinterest trial access is approved.

All assets use private Supabase buckets and owner-only Row Level Security. Incomplete imports remove files they uploaded. Archiving a project preserves stored assets and revision history.

## ChatGPT connector

The authenticated MCP endpoint is:

```
https://wyoamcydkbblvujvyljs.supabase.co/functions/v1/seller-tools-inbox
```

Its tools can create projects, attach assets, finalize validated packs, read revision requests, update a project and archive one confirmed project. The packaged plugin is under `plugins/planthenroam-seller-tools`.

Before connecting ChatGPT, enable Supabase Auth OAuth 2.1 Server with dynamic client registration and set the authorization path to:

```
/oauth-consent.html
```

## Manual ZIP fallback

A ZIP must contain `manifest.json` plus the named files. Required manifest rules:

- `kind: "etsy"` with `title`, exactly 13 `tags`, `customerPdf`, `thumbnail`, and `listingImages`.
- `kind: "pinterest"` with `title` and 1–50 `pins`; each Pin includes `imageFile`, `title`, `description`, `altText`, `link`, and `board`.

The installed PWA checks for updates on launch and hourly. Navigation and same-origin assets use network-first caching so a normal reopen receives the current version without reinstalling.

## Master File Workflow

`list_master_files` → `get_master_file` → edit and verify locally → `prepare_master_upload` → upload bytes → `commit_master_upload`. Reuse the master ID and file roles. Reserve all changed files in the same upload session; untouched roles are retained. Both Word and PDF are customer deliverables.

Each file is limited to 50 MB; each save to 100 MB and 20 changed files. Download URLs expire after 15 minutes and signed uploads after two hours. Retry a committed upload ID safely. A conflict means another save won: read and reconcile the latest version first. Do not auto-advance a stale revision.

The master tables and bucket are private. Browsers have owner-scoped SELECT access only. The authenticated, owner-checked inbox issues signed uploads and uses a service-only, security-invoker database transaction to commit versions. Old objects are retained, not overwritten or deleted. Incomplete uploads cannot replace current files.

Saving, linking and restoring never publish. `attach_master_files_to_review` stages selected customer downloads; final Etsy approval remains in the app. The publisher records master hashes only after verifying the live update. Changes made directly on Etsy are not automatically observed by that record. Existing listings show an unknown published master until a tracked master update succeeds.

ChatGPT needs the refreshed connector tool catalogue in a new chat to discover newly added actions. Source instructions are tracked in this repository. Merely changing a message in another chat does not save a file. Existing chat attachments are not automatically chosen as approved masters.

## Master Files connector (release 28 / API 3.4.0)

The MCP `initialize` and `tools/list` endpoints expose public capability metadata with no private data. Every `tools/call` still validates the owner's Supabase session and owner access. Tool descriptors declare OAuth requirements. Responses are not cached. `list_review_projects` includes the canonical registration names so a stale ChatGPT tool catalogue can be identified without pretending a capability flag proves client availability.

`upload_master_files` accepts native ChatGPT file inputs using `openai/fileParams`, with separate explicit file-to-role assignments. `import_review_images_to_master` copies a complete six-image set from an owned Review Box project linked to the same planner. Both verify bytes, preserve master identity/history, keep stable thumbnail/photo positions, and use idempotency keys to resume uploads without duplicate objects. Commit results report each saved file. `get_master_file` returns current or historical verified references and temporary private downloads. Neither save route calls Etsy, publishes or schedules. Only customer PDFs can be selected for this shop's separate Etsy download update.

If ChatGPT still advertises seven old Review Box tools, inspect and refresh the registered connection's metadata, verify its URL, and start a fresh conversation. Reconnecting OAuth alone is not proof that tool metadata changed. The runtime's active action catalogue cannot be edited by changing this repository.

### Release 29 / API 3.4.1

Repairs Review Box imports against the deployed schema, retaining owner OAuth, RLS and private source-path checks. Database errors now preserve their diagnostic message. The schema regression, ownership restrictions and idempotent retries are covered by the automated tests.
