# Private Marketing Composer

Implements `PlanThenRoam_Marketing_Composer_Authoritative_Spec_v1.0.md` with the owner's subsequent corrections: ChatGPT controls only, no Composer screen or tab, no Pinterest production, no new paid hosting service. The earlier Cloud Run proposal is superseded. Existing Etsy editing, posting and Word storage remain separate.

The Composer creates deterministic 1080 × 1080 PNGs from the locked final background bank, genuine current Word-master pages and one of twenty approved font families. No image-generation service, publishing endpoint or old video tool is used.

## ChatGPT workflow

1. Call `get_composer_catalog` with `include_options: true` once for the approved font weights/styles, profiles and layout presets. Filter subsequent catalogue calls by planner and asset kind. Results are paginated, at most twenty assets. Use `get_composer_asset` to inspect a single signed preview.
2. Submit exact text, selected IDs and layout via `create_marketing_composition` with a stable idempotency key. `auto` resolves a layout from page count and composition profile. Explicit presets are also supported.
3. Queue up to five items using `render_marketing_composition`. Read `get_composer_job` at least thirty seconds apart; processing can take several minutes. Scheduled GitHub jobs can be delayed by GitHub.
4. Read `get_marketing_composition` for exact copy, resolved geometry, validation and the private preview. `update_marketing_composition` requires the current revision and invalidates that composition's previous approval.
5. After owner review in ChatGPT, `export_marketing_composition` returns the reviewed PNG bytes through a fifteen-minute signed URL. It cannot publish or schedule. Download names contain planner/composition IDs and revision.
6. `delete_marketing_composition` cancels work and removes that composition's output files. Shared backgrounds, page assets and Word masters are untouched. Failed deletions can be retried.

`validate_marketing_composition` checks current source identities and geometry immediately. Rendering additionally checks actual font loading, glyph coverage, measured text overflow, exact text, visible text pixels, contrast, asset checksums and PNG dimensions.

## Implementation

- `supabase/functions/composer`: shared schemas, owner-scoped actions, immutable asset references, deterministic layout and font catalogue.
- `supabase/functions/composer-worker`: authenticated GitHub OIDC queue worker and scoped one-time asset ingestion. It accepts only this repository's main-branch Composer workflow identity. Import grants are hashed, time-limited and restricted to exact owner asset IDs.
- `supabase/rebuild/composer.sql`: four new private tables and a private PNG bucket. Browser roles have no table grants or storage access policies.
- `composer/renderer.mjs`: pinned Chromium/Playwright, Fontsource, fontkit and Sharp. Assets and fonts are loaded as local data; page rendering cannot fetch external URLs. Fonts are embedded, not substituted. Text and CTA use the one selected family; genuine page rasters preserve the source document's typography.
- `composer/browser.mjs`: portable extraction of the pinned browser and an explicit font configuration. Font files and browser version are captured in render results.
- `.github/workflows/composer-render.yml`: five-minute polling on the existing repository's standard runner. The lightweight probe skips installation and rendering when no jobs are queued. No service-role key is placed in GitHub or returned to ChatGPT.

All rendered pages contain the checksum of their source Word master. If that master changes, use of its old pages is rejected at creation, queueing, completion and export. Refresh that planner's genuine page bank from its new DOCX through the maintenance ingestion procedure before making another composition. Existing composition asset versions are retained for reproducibility.

## Ingestion procedure

Use only the final square background folder named in the authoritative specification. Check exactly nineteen destinations, ten backgrounds each, unique checksums and 1080-square dimensions. Render current DOCX masters to upright PNGs; retain each master ID, checksum, revision and page number. Page logical identity is planner plus page number; immutable asset IDs additionally pin the actual PNG checksum.

Provision asset rows through authenticated database administration, and issue a short-lived import grant restricted to those asset IDs. `import_prepare` issues immutable upload targets. Upload actual PNG bytes; `import_commit` downloads and verifies checksum, dimensions and size before marking each asset ready. Every file returns its own result. Revoke the import grant when ingestion and verification finish. Never commit grants, signed URLs, document content, backgrounds, page rasters or exported adverts to this public repository.

## QA

Run `npm test` from the repository root for existing app regression tests. Run `npm ci && npm test` in `composer` for source validation, action isolation, retry/revision/cancellation tests, all twenty real font renders, contrast/overflow rejection and identical-byte rerenders.

For private acceptance assets, `node composer/qa.mjs /path/to/private-assets` exercises Christmas in New York, Greece, Iceland and Munich with genuine pages and their correct backgrounds. Inspect the four PNGs visually. Keep acceptance outputs private and unpublished.

## Operational boundaries

There is no Composer user interface in the seller app. Updating the MCP server's tool catalogue cannot force an already open ChatGPT session to reload its cached actions; refresh the connection when the ten Composer actions are absent. The app shell remains version 37; API capability metadata is 4.2.0 and Composer renderer version is 1.0.0.

Protected focal zones are enforced when supplied. The initial background bank has no human-verified focal-zone rectangles, so each output still requires visual review. Font and geometry checks cannot establish marketing claims or predict conversion rates. Background choice, copy accuracy and genuine-page suitability remain review decisions.

No new hosting subscription or generation API is introduced. The private asset bank occupies approximately 834 MB in the existing Supabase storage allocation; storage and bandwidth still count toward that account's limits. GitHub scheduling is asynchronous and provides no immediate-render latency guarantee.
