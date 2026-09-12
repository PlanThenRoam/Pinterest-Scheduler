# Private Marketing Composer

Implements `PlanThenRoam_Marketing_Composer_Authoritative_Spec_v1.0.md` with the owner's subsequent corrections: ChatGPT controls only, no Composer screen or tab, no new paid hosting service. The earlier Cloud Run proposal is superseded. Existing Etsy editing, posting and Word storage remain separate.

The Composer creates deterministic 1080 × 1080 square PNGs or 1000 × 1500 Pinterest PNGs from the locked final background bank, genuine current Word-master pages and one of twenty approved font families. No image-generation service, publishing endpoint or old video tool is used.

## Campaign workflow (API 4.4.0)

1. `get_composer_campaign_brief` returns the next saved planned campaign (or named planner), saved exact copy, current genuine page titles, observed background scene descriptions and recent approved typography. Missing agreed copy is labelled `NEEDS_COPY`; the action never invents it. `save_composer_campaign_brief` saves a plan, provenance, agreed copy and queue position across chats. Source document version is separate from campaign revision.
2. Settle copy, genuine pages and backgrounds. `submit_marketing_campaign` saves exactly five numbered slide specifications in one atomic transaction and queues them. Use a stable `idempotency_key`. Existing campaigns require the campaign revision and every slide revision. A retry cannot duplicate slides; a correction queues only changed slides. A new retry key can retry failed unchanged slides.
3. Actual embedded-font preflight runs before asset downloads or PNG rendering. It measures line wrapping and isolated final words, tries balanced wrapping and sizes within the established readability bounds, and retains every character and explicit newline. It returns measured lines, original isolated words, selected sizes and adjustment warnings. `preflight_marketing_campaign` can queue this stage separately for saved draft slides. Existing validated ready slides retain their measurements. It is asynchronous, not a synchronous font service.
4. `get_marketing_campaign` returns all five signed previews, exact copy, revisions, validation, measured text and stage timings together. Review every slide visually. Poll at least thirty seconds apart. The returned `review_token` identifies the exact five revisions and checksums.
5. After explicit owner approval, `export_marketing_campaign` validates that review token, all current sources and all five stored PNG checksums. It returns five numbered PNG downloads and a private ZIP. Both first export and retries retain the exact reviewed bytes. Signed downloads expire after fifteen minutes and can be renewed by retrieval/export. A concurrent revision or source change blocks approval.
6. `delete_marketing_campaign` cancels all five slides atomically before deleting outputs. Cancellation and cleanup can be retried. Shared sources and masters are preserved.

The ten existing individual-composition actions remain available. No publication or scheduling is available through any Composer action. Private campaign data is never part of the public repository.

## Renderer startup and performance

Submission requests an immediate dispatch of the existing `composer-render.yml` workflow. Configure a repository-scoped GitHub credential with **Actions: write** as the Supabase Edge Function secret `COMPOSER_GITHUB_DISPATCH_TOKEN`. The workflow URL and `main` ref are fixed in code. A missing credential, rejected request or timeout returns an explicit `scheduled_backup` response; it never claims immediate startup. GitHub scheduling remains the backup and may be delayed. This connection cannot provision GitHub credentials.

One worker reuses one browser, separate pages, pinned fonts and a bounded 128 MiB cache of fully decoded and checksum-verified source bytes. Cache keys include owner, asset identity, checksum and dimensions. The default is two simultaneous slides; `COMPOSER_CONCURRENCY` supports one to three. The workflow caches its pinned installed dependencies and only installs/renders when work exists.

The private five-slide benchmark on 12 September measured 7.131 s with five browser instances, 6.637 s with a shared serial browser, 5.329 s with concurrency two and 4.786 s with concurrency three. All twenty outputs had identical per-slide checksums and passed full validation. These are local renderer-only measurements after source downloading, not end-to-end service promises. Source retrieval took 73.890 s separately. Creative preparation, GitHub startup, queue wait, uploads and export are excluded from those renderer figures.

Campaign results report client-declared preparation, first submitted time, queue wait, font loading, text preflight, asset loading, rendering, PNG encoding, validation, result upload, storage verification and export. First-pass completion and later corrected completion are separate. Historical campaigns have no fabricated timings. Concurrent slide durations overlap and must not be added as elapsed campaign time.

## Implementation

- `supabase/functions/composer`: shared schemas, owner-scoped actions, immutable asset references, deterministic layout and font catalogue.
- `supabase/functions/composer-worker`: authenticated GitHub OIDC queue worker and scoped one-time asset ingestion. It accepts only this repository's main-branch Composer workflow identity. Import grants are hashed, time-limited and restricted to exact owner asset IDs.
- `supabase/rebuild/composer.sql`: private source/composition tables and a private bucket; `composer-campaigns.sql` adds campaign, request and attempt records plus owner-checked atomic RPCs. Browser roles have no table grants or storage access policies.
- `composer/renderer.mjs`: pinned Chromium/Playwright, Fontsource, fontkit and Sharp. Assets and fonts are loaded as local data; page rendering cannot fetch external URLs. Fonts are embedded, not substituted. Text and CTA use the one selected family; genuine page rasters preserve the source document's typography.
- `composer/browser.mjs`: portable extraction of the pinned browser and an explicit font configuration. Font files and browser version are captured in render results.
- `.github/workflows/composer-render.yml`: five-minute polling on the existing repository's standard runner. The lightweight probe skips installation and rendering when no jobs are queued. No service-role key is placed in GitHub or returned to ChatGPT.

All rendered pages contain the checksum of their source Word master. If that master changes, use of its old pages is rejected at creation, queueing, completion and export. Refresh that planner's genuine page bank from its new DOCX through the maintenance ingestion procedure before making another composition. Existing composition asset versions are retained for reproducibility.

## Ingestion procedure

Use only the final square background folder named in the authoritative specification. Check exactly nineteen destinations, ten backgrounds each, unique checksums and 1080-square dimensions. Render current DOCX masters to upright PNGs; retain each master ID, checksum, revision and page number. Page logical identity is planner plus page number; immutable asset IDs additionally pin the actual PNG checksum.

Provision asset rows through authenticated database administration, and issue a short-lived import grant restricted to those asset IDs. `import_prepare` issues immutable upload targets. Upload actual PNG bytes; `import_commit` downloads and verifies checksum, dimensions and size before marking each asset ready. Every file returns its own result. Revoke the import grant when ingestion and verification finish. Never commit grants, signed URLs, document content, backgrounds, page rasters or exported adverts to this public repository.

## QA

`supabase/rebuild/composer-campaigns-qa.sql` exercises actual database transactions and rolls back every test row. It covers create/update idempotency, five-slide atomicity, exclusive claims, stale leases, unchanged slide preservation, stale/null export checks, ZIP retry identity, cancellation and RPC access. Run it through authorised database administration after the additive migration. `composer/benchmark.mjs` accepts a private five-slide input manifest and produces private benchmark previews/results; never commit that manifest or its signed URLs.


Run `npm test` from the repository root for existing app regression tests. Run `npm ci && npm test` in `composer` for source validation, action isolation, retry/revision/cancellation tests, all twenty real font renders, contrast/overflow rejection and identical-byte rerenders.

For private acceptance assets, `node composer/qa.mjs /path/to/private-assets` exercises Christmas in New York, Greece, Iceland and Munich with genuine pages and their correct backgrounds. Inspect the four PNGs visually. Keep acceptance outputs private and unpublished.

## Operational boundaries

There is no Composer user interface in the seller app. Updating the MCP server's tool catalogue cannot force an already open ChatGPT session to reload its cached actions; refresh the connection when the seventeen Composer actions are absent. The app shell remains version 37; API capability metadata is 4.4.0 and Composer renderer version is 1.2.0.

Protected focal zones are enforced when supplied. The initial background bank has no human-verified focal-zone rectangles, so each output still requires visual review. Font and geometry checks cannot establish marketing claims or predict conversion rates. Background choice, copy accuracy and genuine-page suitability remain review decisions.

No new hosting subscription or generation API is introduced. The private asset bank occupies approximately 834 MB in the existing Supabase storage allocation; storage and bandwidth still count toward that account's limits. GitHub startup is asynchronous even after accepted immediate dispatch; there is no guaranteed completion latency.

## Pinterest portrait extension

Set `output_type: "pinterest"` on each composition and when retrieving a catalogue or campaign brief. The default remains square, including saved older square briefs. Save portrait planned briefs with `source.output_type: "pinterest"`. A campaign has one format; five portrait pins may each use their own selected font and must use five different backgrounds. Existing square batches retain their shared-font rule. PNG rendering, contrast measurement, stored-file validation and five-file ZIP exports all use the declared canvas dimensions.

Portrait backgrounds must already be verified 1000 × 1500 assets. The renderer rejects square backgrounds for portrait output and never crops or stretches them. Keep the 190 locked square sources intact. Ingest the approved portrait artwork through the existing private asset ingestion procedure, with separate logical keys and exact checksums. Genuine current DOCX pages are shared by both formats.

After visual approval and export, use `prepare_pin_review` to match an existing Etsy listing and Pinterest board. Then `attach_project_asset_from_composer` accepts the review project revision, composition ID, composition revision and exact reviewed PNG checksum. It verifies owner, portrait dimensions, approval, current source pages and the master record's Etsy listing identity, then copies the exact bytes into the existing private pin project. Use `finalize_review_project` to place it in the owner approval queue. This transfer never posts or schedules a pin. No user interface or publisher changes are required.

Deployment alone does not supply portrait artwork. An empty portrait bank is reported as `NEEDS_BACKGROUNDS` by the planner brief. Before production, complete and visually approve the portrait bank; never treat the existing square bank as compatible. The original interrupted crop script has not been added to this implementation.
