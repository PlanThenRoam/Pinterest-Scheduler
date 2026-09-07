# PlanThenRoam Seller Tools

Private, phone-first review workspace for Etsy listing edits and Pinterest content packs. Release 26 keeps owner sign-in and private storage.

## Release 26

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

Apply the release-26 migration before deploying the updated `etsy-publish` and `seller-tools-inbox` functions. Include `safe-edit.ts` and `safety.ts` with the publisher. Both functions validate the caller themselves using Supabase Auth and owner checks; preserve their existing gateway configuration. Deploy the static frontend after the backend. Verify the authenticated connector status and unauthenticated access denial after release.

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
