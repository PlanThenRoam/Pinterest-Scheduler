---
name: send-to-seller-tools
description: Retrieve and update current master planners, blueprints and assets, or prepare scoped Etsy and Pinterest updates in the private PlanThenRoam Seller Tools app.
---

# Send to PlanThenRoam Seller Tools

Use the seller-tools MCP server when the owner asks to prepare, send, import, update, revise or clear a Seller Tools project.

## Master files

Use the Master Files catalogue when the owner asks to work on a planner, blueprint or asset stored in Seller Tools. It is a shared source of current files for chats with this connection. Search with `list_master_files`; do not infer the current version from a filename, chat attachment or memory.

1. Call `get_master_file` with the stable `master_id`. Download the current source files using the returned temporary URLs. Keep the `current_revision` and the existing file roles.
2. Make only the requested edits using the relevant document or image workflow. For a planner, update the editable Word and matching PDF together unless the owner requests Word-only work. Both are customer deliverables. Preserve unrelated assets.
3. Compute each changed file’s SHA-256 checksum and byte size. Call `prepare_master_upload` with the same master ID, `expected_revision`, changed files and a short change note. Use the same role to replace an existing file, such as `docx` or `pdf`.
4. Upload each file’s raw bytes to its returned signed upload URL using PUT, its MIME Content-Type and `x-upsert: false`, or the Supabase `uploadToSignedUrl` client method. Call `commit_master_upload` only after the uploads finish. The server verifies all bytes before atomically advancing the version.
5. Report the saved revision only after commit succeeds. Retrying the same upload ID is safe. On a version conflict, retrieve the latest master and reconcile the changes; never silently retry against the newer revision with stale content.

A request to edit a master includes saving the completed edit back to it. This does not authorise publishing to Etsy. An older chat must fetch the current master again before starting new edits. There is no background watcher that syncs unrelated chat messages.

Use `create_master_file` for a genuinely new master after checking for duplicates. Use `update_master_details` for the title, category or Etsy listing link, and `restore_master_version` for an explicitly requested rollback. History remains recoverable.

To prepare an Etsy update, use the linked listing, prepare its current review project, and call `attach_master_files_to_review` with explicit add/replacement choices. Replacements must identify the current Etsy file ID. This tool packages Word files in ZIP for customer delivery. The owner reviews the selected changes before publishing. Saving, restoring or linking a master never publishes.

## Existing Etsy listing image updates

When the owner names an existing product and asks for new Etsy photos:

1. Find the listing by product or destination name. Do not ask the owner for a listing ID.
2. Prepare an image-only update project. Store only the secure target listing ID, its six image positions and current alt text. Do not copy title, description, tags, price, quantity, PDF or any other listing content into the review project.
3. Attach exactly one approved replacement thumbnail as `thumbnail` and five approved replacement listing photos as `listing-image-1` through `listing-image-5`.
4. Set exactly six meaningful matching entries in `manifest.altText`.
5. Finalize the project for review. The review card must show only the six replacement images and their alt text.
6. The owner presses **Replace Etsy images**. That action overwrites image positions 1–6 and their alt text while leaving every other live Etsy field untouched.

Never send listing copy or product files for an existing-listing image update. Never create a new listing. Never claim Etsy changed before the owner approves and the update returns success.

## Other pack rules

- Etsy: create the customer PDF, one thumbnail and five additional listing images, SEO title (maximum 140 characters), full description, price in GBP (default £14.99 unless the owner specifies otherwise), quantity (default 999), exactly 13 unique tags of at most 20 characters, and six image alt texts. Include the Etsy `taxonomyId` when known; otherwise Seller Tools securely infers the shop’s established listing category at publish time. Use roles `customer-pdf`, `thumbnail`, and `listing-image-1` through `listing-image-5`, then finalize.
- Pinterest: create the requested batch of 1–50 Pins. Each Pin needs its image, SEO title, description, alt text, exact destination link and board. Attach an image for every Pin before finalizing.

Do not mark a project ready until its required files pass `finalize_review_project`. Preserve an existing project when the owner explicitly asks to revise it. Never claim Etsy or Pinterest was published unless the corresponding connected publishing tool returns success. Ask for immediate confirmation before `clear_review_project`.
