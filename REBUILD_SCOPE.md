# Seller Tools rebuild

Approved 7 September 2026. Replace the existing app in place, retaining its URL, owner sign-in and authorised platform connections. Bottom tabs: Editing, Posting, Storage. Editing opens first.

## Editing
ChatGPT submits only title, description, individual thumbnail/listing-image replacements with matching alt text, and customer PDF replacements. Preview current and proposed content. Owner approves or cancels. Cancellation permanently deletes the pending submission and its assets. Omitted fields and image order remain unchanged.

## Posting
New Etsy listing: customer PDF, SEO title, description, thumbnail plus five images, matching alt text and exactly 13 tags. Shared defaults are read from existing listings. Owner approval publishes. Pinterest: ChatGPT reads existing boards, chooses the best match, submits image/title/description linked to the correct existing planner listing. Preview board and link before owner approval.

## Storage
One current private DOCX per planner, grouped by planner. Owner and ChatGPT can read, download, replace or delete. No retained older versions or other asset categories. Storage never publishes. Replacement must verify bytes before deleting the previous current file.

## Reliability
Authenticated owner access. Idempotent submissions and publication receipts prevent duplicates. Ambiguous or partially completed external requests require reconciliation before retry. No version-history UI, scheduling, creative generation or unrelated editing controls.

## Verified starting state
Etsy connected. Pinterest platform connection is trial_pending, with no Pinterest credential table present. Current frontend consists of overlapping inline and external implementations. Existing image recovery remains unproven; do not claim it is fixed or enable unsafe writes during the rebuild.

## Cutover gate
Deploy only after frontend/backend contracts, owner access, scoped edits, cancellation cleanup, current-only storage and retry handling are verified. Remove obsolete live code/functions/tables/assets only after identifying dependencies and preserving current DOCX files and credentials. Keep no second live app.
