---
name: send-to-seller-tools
description: Prepare approved Etsy or Pinterest packs and send their assets to the private PlanThenRoam Seller Tools Review Box.
---

# Send to PlanThenRoam Seller Tools

Use the seller-tools MCP server when the owner asks to prepare, send, import, update, revise or clear a Seller Tools project.

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
- Pinterest: create exactly 10 Pins. Each Pin needs its image, SEO title, description, alt text, exact destination link and board. Attach all ten images before finalizing.

Do not mark a project ready until its required files pass `finalize_review_project`. Preserve an existing project when the owner explicitly asks to revise it. Never claim Etsy or Pinterest was published unless the corresponding connected publishing tool returns success. Ask for immediate confirmation before `clear_review_project`.
