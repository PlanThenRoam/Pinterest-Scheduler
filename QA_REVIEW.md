# Seller Tools compatibility review

Reviewed 7 September 2026. Release 33, API 3.4.5.

## Live evidence

- All 18 active Etsy listings returned six ordered image positions.
- Downloaded and decoded all 108 full-size Etsy images successfully: JPEG, 2000 × 2000 pixels. Largest served file 358,653 bytes. All returned alt text was within 500 characters.
- Rome’s live sixth image was visually checked against the approved no-page-count replacement. Its image changed, but the previous alt text remained. Christmas in London has the same recorded verification failure.
- Two image-only updates remain failed/locked for recovery and 15 remain ready. This review did not publish, replace, schedule or cancel any Etsy content.

## Repairs

- Save replacement alt text against the confirmed new image ID; verify the exact ID, rank and text. Preserve failed post-write readback.
- Recover confirmed image-only uploads without uploading again. Check revision, owner, unchanged fields, digital file IDs, other images and expected replacement IDs. Serialize recovery with the existing publishing lock.
- Block stale selected images, unexpected image counts and duplicate ranks.
- Validate selected attachment size, PDF/PNG/JPEG signature, filename and available checksum before Etsy writes. Only PDFs may be customer downloads. Private Master Files continue to accept editable originals.
- New listings validate every attachment before draft creation, record upload attempts, block uncertain duplicate uploads, and verify six images, alt text, PDF ID, title, description, tags and price before activation. Confirm active state afterwards.
- Reject oversized alt text and invalid/overprecise prices rather than silently truncating or rounding. Align image-position support with the current 20-image API limit while retaining the shop’s six-image blueprint.
- Authenticated discovery includes safe image metadata and listing snapshots.
- Compatibility checks cover both connector and publisher versions. Automatic refresh waits while publishing or editing is active.

## Verification

71 automated tests pass. Coverage includes independent title/description/tags/price edits; file upload-before-delete and capacity limits; changed attachment bytes; stale drafts; unselected-field preservation; image identity and alt text; legacy recovery; parallel requests; interrupted uploads; pre-activation verification; cancel/unsaved-edit behaviour; revision preservation; Master Files upload retry/idempotency; native file schemas; private authentication and release-version consistency.

Production write paths were exercised with isolated HTTP/database fixtures, not by making unapproved changes to Etsy. The corrected Etsy alt-text write still needs confirmation from the next owner-approved update. Live customer-PDF bytes for all 18 listings were not downloaded in this review. Rome and London are not marked complete before actual Etsy readback succeeds.

## Sources checked

- [Etsy API reference](https://developers.etsy.com/documentation/reference): image upload/assignment, alt text, ranks and current image capacity.
- [Etsy listing tutorial](https://developer.etsy.com/documentation/tutorials/listings): draft creation and activation.
- [Digital listing limits](https://help.etsy.com/hc/en-gb/articles/115015628347-How-to-Manage-Your-Digital-Listings): five files, 20 MB each.
- [Image requirements](https://help.etsy.com/hc/en-gb/articles/115015663347-Requirements-and-Best-Practices-for-Images-in-Your-Etsy-Shop).
- [Supabase function authentication](https://supabase.com/docs/guides/functions/auth-legacy-jwt).

External API outages, changed platform rules and concurrent edits can still cause errors. The tool must stop safely and retain evidence rather than claim success or blindly repeat writes.
