---
name: send-to-seller-tools
description: Save current planner DOCX backups or submit Etsy listing edits, new Etsy listings, and Pinterest pins for owner approval in PlanThenRoam Seller Tools.
---

# PlanThenRoam Seller Tools

The existing private app has three tabs: Editing, Posting, Storage. Owner sign-in remains required. Use `list_review_projects` for live app/API status. Compare available session actions with the reported MCP catalogue; a capability flag does not prove that a missing action ran.

## Editing

Find the exact existing planner using `list_etsy_shop_listings`, then use `prepare_etsy_listing_update` with a stable `idempotency_key`. Supply only requested title, description, individual image replacements with exact rank and matching alt text, or customer PDF replacements with their existing file IDs. Other Etsy fields stay untouched. Thumbnail is rank 1; the five additional listing images occupy ranks 2–6.

Attach actual bytes using `attach_project_asset` or a trusted ChatGPT HTTPS file URL using `attach_project_asset_from_url`. Keep the role selected in the prepared manifest. Pass the current `expected_revision` when attaching, updating or finalizing; use the returned revision for the next step, or refresh `list_review_projects`. Then call `finalize_review_project`; the owner previews and approves in the app. Do not publish through another path.

## Posting

New Etsy listings use `create_review_project` with kind `etsy`, a stable submission key, SEO title, description, exactly 13 unique tags of at most 20 characters, and six matching `altText` entries. The server captures shared defaults from an existing listing. Attach `customer-pdf`, `thumbnail`, and `listing-image-1` through `listing-image-5`; finalize for owner approval. Only PDF customer downloads go to Etsy.

For a pin, retrieve existing boards with `list_pinterest_boards` and choose the closest relevant board. Use `prepare_pin_review` with the planner name, board ID, SEO title, description and stable submission key. The server resolves the planner's existing Etsy link. Attach the `pin-1` image and finalize. The owner reviews the image, copy, board and link before posting. No scheduling.

## Storage

Storage is one current DOCX backup per planner. Search `list_master_files`, then read `get_master_file` before replacing the existing master identity. Use `upload_master_files` for one actual ChatGPT DOCX attachment, with its file assignment, expected revision and stable idempotency key. Alternatively call `prepare_master_upload`, transfer actual bytes to the signed upload destination, then call `commit_master_upload`. Verify per-file save results and retrieve the stored file. Saves never publish.

Use `create_master_file` only for a genuinely new planner after searching. `delete_master_file` permanently deletes its current DOCX. Previous backups are deleted after a verified replacement; no older versions are retained. Do not store PDFs, images or blueprints in this tab.

## Retries and cancellation

Reuse the same submission/upload key and content after a lost response. A conflict requires reading current state; do not overwrite a newer submission with stale data. Never claim a transfer succeeded without returned save results.

`clear_review_project` permanently deletes a pending submission and its assets after the owner requests cancellation. It does not undo live changes. Uncertain platform writes stay locked until their live result is checked in the app; never work around that lock by creating another copy.
