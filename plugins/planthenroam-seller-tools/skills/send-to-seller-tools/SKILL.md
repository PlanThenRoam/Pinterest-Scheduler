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

## Other pack rules

- Etsy: create the customer PDF, thumbnail, listing images, SEO title, full description, exactly 13 unique tags of at most 20 characters, and alt text for every image. Attach all files before finalizing.
- Pinterest: create exactly 10 Pins. Each Pin needs its image, SEO title, description, alt text, exact destination link and board. Attach all ten images before finalizing.

Do not mark a project ready until its required files pass `finalize_review_project`. Preserve an existing project when the owner explicitly asks to revise it. Never claim TikTok was posted; it is downloaded for the owner to add sound and post. Never claim Etsy or Pinterest was published unless the corresponding connected publishing tool returns success. Ask for immediate confirmation before `clear_review_project`.
