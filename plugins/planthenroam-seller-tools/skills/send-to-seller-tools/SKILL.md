---
name: send-to-seller-tools
description: Plan complete TikTok, Etsy or Pinterest packs with the owner, then send approved assets to the private PlanThenRoam Seller Tools Review Box.
---

# Send to PlanThenRoam Seller Tools

Use the seller-tools MCP server when the owner asks to prepare, send, import, update, revise or clear a Seller Tools project.

## Approval gate

For a new TikTok project, do not create the Seller Tools project or generate its six to eight images immediately.

First show the owner the complete proposed plan in chat. For every numbered scene, state:

- exact on-screen wording: eyebrow, headline, supporting line and call to action where used;
- exact finished-image subject and composition;
- scene duration;
- text position and protection;
- photographic movement;
- transition into the scene;
- text animation;
- crop focus or framing when relevant.

Also show the global render recipe: style, precise typography/font treatment, photo treatment, text colour, transition speed, motion intensity and curve, overlays, atmosphere, framing, effect intensity and total duration. Show the cover title, caption, exactly five focused hashtags and a licensed-sound recommendation.

Ask the owner to approve or request changes. Wait for explicit approval. Apply requested changes and show the revised plan again when needed.

## Approved TikTok handoff

Only after approval:

1. Generate one finished, vertical, text-free image for each approved scene. Images must not contain embedded captions, lettering, logos or watermarks because Seller Tools adds the approved text.
2. Create one TikTok manifest containing the exact approved content and settings. Use 6–8 scenes. Each scene must name its `imageFile`, `heading` or `text`, numeric `duration`, `motion`, `position`, `transition` or `transitionOverride`, and `textAnimation` or `textAnimationOverride`. Include any eyebrow, body, CTA, focal position, framing, overlay, atmosphere, speed curve, text colour and text-protection overrides that were approved.
3. Put the complete global recipe in `manifest.render`, including `style`, `typography`, `photoTreatment`, `textColour`, `textProtection`, `transition`, `transitionSpeed`, `motionIntensity`, `speedCurve`, `overlay`, `atmosphere`, `framing`, `effectIntensity`, `textAnimation` and output `quality`.
4. Create the private project, attach each finished image using roles `scene-1` through `scene-N`, and finalize the project.
5. Do not create, attach or claim to have rendered an MP4. Finalization hands the image-and-recipe pack to Seller Tools. Seller Tools creates and privately stores the silent MP4 when the owner opens the TikTok Review Box.

The TikTok Review Box is deliberately read-only. The owner previews the finished video and chooses only Download MP4 or Discard. Changes must be discussed and approved in ChatGPT before a replacement pack is sent.

## Existing Etsy listing updates

When the owner names an existing product or asks to replace its thumbnail or listing images:

1. Call `list_etsy_shop_listings` with the product or destination name. Do not ask the owner for a listing ID.
2. Call `prepare_etsy_listing_update` with the specific product name. Seller Tools securely copies the listing's current title, description, price, quantity, category, tags, materials, section, renewal/tax/handmade answers, personalisation data, images and alt text.
3. Create only the replacement assets the owner requested. For a thumbnail replacement, attach the approved image using role `thumbnail`. For another image position, use `listing-image-1` through `listing-image-5`.
4. Supply meaningful alt text for every replacement image in the matching `manifest.altText` position. Never remove or blank the other existing alt text.
5. Finalize the update project. This sends it to Seller Tools for review; it does not change Etsy.
6. The owner reviews the exact update and presses **Update Etsy listing**. Never claim the live listing changed before that action returns success.

Preserve all current Etsy fields the owner did not explicitly ask to change. Never create a new listing when the request is to update an existing named product.

## Other pack rules

- Etsy: create the customer PDF, one thumbnail and five additional listing images, SEO title (maximum 140 characters), full description, price in GBP (default £14.99 unless the owner specifies otherwise), quantity (default 999), exactly 13 unique tags of at most 20 characters, and six image alt texts. Include the Etsy `taxonomyId` when known; otherwise Seller Tools securely infers the shop’s established listing category at publish time. Use roles `customer-pdf`, `thumbnail`, and `listing-image-1` through `listing-image-5`, then finalize.
- Pinterest: create exactly 10 Pins. Each Pin needs its image, SEO title, description, alt text, exact destination link and board. Attach all ten images before finalizing.

Do not mark a project ready until its required files pass `finalize_review_project`. Preserve an existing project when the owner explicitly asks to revise it. Never claim TikTok was posted; it is downloaded for the owner to add sound and post. Never claim Etsy or Pinterest was published unless the corresponding connected publishing tool returns success. Ask for immediate confirmation before `clear_review_project`.
