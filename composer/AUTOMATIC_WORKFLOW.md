# Automatic Marketing Composer 2.0

Target app 38 / API 5.0.2. Private creation, preview and export only. Existing manual compositions, square and portrait assets, campaigns and publisher approval flows remain available.

## Main workflow

1. `get_automatic_campaign_context` takes a planner ID or unambiguous query. One response includes the editable campaign plan, central promotions, current genuine page IDs, both background formats and ten distinct campaigns of persistent design history. Include fonts only when needed.
2. `generate_marketing_campaign` takes exact output copy, roles, page IDs, campaign angle, intended publication timestamp and explicit promotion mode. Use five square slides and two portrait pins by default, with configurable quantities up to twenty. Every requested output must be supplied; copy is never invented. Every pin includes its own product identification and CTA. Format and role validation protects the hook/proof/cover structure.
3. Poll `get_marketing_campaign` at intervals of at least thirty seconds. It returns every composition ID, revision, preview, 360-pixel phone preview, validation result and timing. `queued` means waiting; only a worker claim means `running`.
4. `vary_marketing_campaign` offers another complete design, layout only, typography only or CTA only. Exact copy, offers, dates, source pages and roles remain unchanged. Locks preserve approved backgrounds, typography, layout, CTA or colour. Partial changes are explicitly marked and are not represented as complete campaign variation.
5. `correct_marketing_campaign_output` takes one explicitly corrected output. It resubmits the atomic campaign while retaining all unchanged specifications and PNGs. Individual manual controls adjust layout and placement; campaign-level controls change typography or CTA throughout the set; automatic-campaign copy/page corrections use the dedicated correction action. Typography, colours, headline effects and CTA treatment remain fixed across all campaign outputs.
6. `export_automatic_campaign` requires all ready previews, the exact review token and current campaign revision. `technical_test` records a private test export without owner approval. `owner_visual` requires actual owner visual approval. Both recheck sources, PNG bytes, dimensions and promotional validity, then export separate PNGs and one ZIP. Existing exports are retained.

The app exposes the same workflow from **Marketing Composer** while retaining the three existing bottom tabs. All new actions use the existing owner OAuth check. Tables are private, RLS enabled, with access restricted to the server's service role; no renderer credential is sent to the browser or MCP.

## Controlled variation

Visual randomisation happens only when choosing another complete campaign design. There is no per-output style randomisation option. Older saved campaigns and exports retain their exact bytes; choose another campaign design to apply the new shared style before using partial controls.

Twenty complete typography systems use eleven unboxed headline treatments and twelve geometric layout families. A carousel has a coherent one- or two-family pairing, with three different proof arrangements. Every slide and companion pin shares the same fonts, weights, palette, headline treatment and CTA treatment. Backgrounds and geometric arrangements can vary. New campaigns use unboxed text, underlined or integrated CTAs. Hard text back panels and filled CTA boxes are disabled. One soft image-wide fade and text-shadow treatment is shared by every output. Historical treatments remain readable for existing saved compositions.

Recent comparison uses the latest ten distinct campaign identities, including actual legacy campaigns. A square crop and portrait crop of the same source count as one photograph. Campaign design and random seed are persisted atomically with the compositions. A concurrent history change rejects the preparation and requires fresh context. Existing saved seeds/specifications reproduce without consulting subsequent history.

| Similarity factor | Weight |
| --- | ---: |
| Font category | 0.14 |
| Headline treatment | 0.16 |
| Layout structures, set overlap | 0.24 |
| Hierarchy | 0.14 |
| Alignment | 0.06 |
| CTA treatment and placement | 0.16 |
| Colour palette | 0.04 |
| Original photograph overlap | 0.06 |

A new complete system must score below **0.69** against every relevant recent system and differ in at least **three major factors**. Font family name alone has no similarity weight. Similarity is checked between complete campaigns. Pins in the same campaign are deliberately allowed to share its style. A partial layout/typography/CTA control retains other elements and rejects an unchanged exact combination; its intentionally limited scope is reported. If locks prevent meaningful full variation, return `NO_DISTINCT_COMPATIBLE_DESIGN`.

Approved photographs unused in ten campaigns are preferred. When none remain, use the least recently used suitable photograph and persist `BACKGROUND_LRU_REUSE`, including the original image identity and last use. Every output in a new default batch uses a separate original photograph. A bank too small for the requested quantity returns `INSUFFICIENT_DISTINCT_BACKGROUNDS`.

## Fonts and rendering

The twenty requested additions are bundled as **71 unmodified TTF files**, 13,349,136 bytes, from official [Google Fonts](https://github.com/google/fonts/tree/809e4d8b8d7e9364a914909bb777679606c178b8). Every licence and catalogue metadata file is retained. Roboto Slab is Apache 2.0; the other nineteen additions are SIL OFL 1.1. `font-manifest.mjs` records exact SHA-256 values, available weights/styles, variable axes, complete character maps, catalogue URLs and source revision. The existing twenty families remain pinned in the package lockfile.

The browser embeds actual verified files with font synthesis disabled. Unsupported weight, italic and glyph requests fail. Each text block supports independent font, weight, italic, size, position, width, alignment, spacing, tracking, colour, explicit line breaks and exact offset-based emphasis spans. At most two font families are allowed in a design system; planner-page pixels and their original typography are never changed.

Actual Chromium font metrics, reflow, overflow and readable floors are checked before image loading. Floors are 56 pixels for headlines, 32 for supporting copy and 30 for CTAs. Short deliberate stacks remain readable without unnecessarily shrinking. Copy that cannot fit returns a field-specific error. New campaigns fix the same text colour, shadow and image-wide fade throughout. No output uses a hard back panel. Corresponding text blocks use a conservatively fitted common size across the complete campaign. Actual Chromium measurement verifies it; an individual output cannot shrink its font independently. Copy that still does not fit is rejected for correction. Contrast is still checked on verified image pixels. Contrast is measured on the rendered image. Complete PNG decoding, framing, dimensions, checksums, page aspect ratios, margins, protected zones and non-overlap are checked. Automation never constitutes human approval.

The worker shares a browser and verified per-owner asset/font caches and renders two outputs concurrently (hard cap three). Unchanged revisions are not queued again. Preview and ZIP exports bind exact reviewed revisions. All timing fields are wall-clock measurements, not sums of overlapping jobs.

## Promotions and plan records

`save_marketing_campaign_plan` edits priority, focus, final-season status, business timezone and required promotion status. `save_composer_promotion` stores planner IDs, percentage, absolute start/end timestamps, IANA timezone, exact date wording, advance/active wording and confirmation status. It never changes Etsy prices or live discounts.

Seeded from the owner's request:

- Salem and New England are the primary focus; Christmas is secondary.
- Munich's latest campaign is its final campaign for the 2026 season.
- Salem and New England: 15% off, 14–20 September 2026. Europe/London is an editable business-timezone default. Start: 13 September 23:00 UTC. End, exclusive: 20 September 23:00 UTC, covering all of 20 September locally.
- Exact advance and active wording has not been approved. The record deliberately remains `pending_wording`. Save both owner-approved variants before promotional production; the known discount facts are not treated as approval of invented copy.

Validation uses the intended publication timestamp and saved business timezone. Required discount/date/wording errors identify the affected cover/CTA slide or pin and return the required correction. Hook/proof outputs do not gain sales CTAs. Explicit evergreen pins omit dated offers and remain separate from promotional pins. Expired promotional drafts/exports are flagged stale before reuse. No countdown, "ends tonight" or live-sale status is invented.

## Renderer dispatch configuration

The existing scheduled worker remains recovery. Immediate dispatch requires the supported server-side secret `COMPOSER_GITHUB_DISPATCH_TOKEN`, restricted to `PlanThenRoam/Pinterest-Scheduler` with GitHub **Actions: write**. Configure it through [Supabase Edge Function secrets](https://supabase.com/dashboard/project/wyoamcydkbblvujvyljs/functions/secrets), or the official `supabase secrets set` command. Never put it in a chat, source file, workflow input, database record or browser form. GitHub's [workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) accepts a properly scoped repository token.

No credential was available during implementation. The code therefore continues to report `DISPATCH_CREDENTIAL_NOT_CONFIGURED`; configuration must not be reported as repaired until a supported credential is actually installed and a live dispatch succeeds. Dispatch acceptance itself still means **queued**, not rendering.

## Acceptance and remaining deployment gate

Run both existing regression suites and `composer/test/automatic.test.mjs`. The private `demonstrate-automatic.mjs` harness renders two actual seven-output campaigns from current genuine London assets, verifies all files, creates phone previews and exports ZIPs. Its private manifest and generated assets are outside Git.

Local acceptance is not the live ChatGPT acceptance gate. After deploying app/API/worker together, refresh the Seller Tools connection if it still exposes old schemas. Complete two campaigns, their correction/export checks and dispatch timing through the newly exposed actions before declaring the upgrade complete. Rendered samples and automated tests must not be described as owner approval, publishing, scheduling or a verified live dispatch.

Static font selection follows Google catalogue weight labels and records the original internal weight class separately. Variable ranges use the actual font axes, including DM Sans 1000. The preset version remains 2.0.0; existing resolved designs keep their seed and composition.
