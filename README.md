# PlanThenRoam Seller Tools

Private, phone-first review workspace for complete TikTok, Etsy and Pinterest content packs.

## Review workflow

- **TikTok:** ChatGPT first shows the complete scene-by-scene plan and waits for approval. It then sends 6–8 finished text-free images plus the approved copy and render recipe. Seller Tools creates and verifies the silent MP4. The Review Box offers preview, download and confirmed discard only.
- **Etsy:** customer PDF, thumbnail, listing gallery, title, description, 13 tags, alt text, edit and clear. Publishing remains locked until the approved Etsy API connection is enabled.
- **Pinterest:** one 10-Pin batch with images, SEO copy, exact links and boards, edit, clear, Post now sharing and scheduling. Direct publishing remains locked until Pinterest trial access is approved.

All assets use private Supabase buckets and owner-only Row Level Security. Incomplete imports remove files they uploaded. Clearing a project removes its stored assets after confirmation.

## ChatGPT connector

The authenticated MCP endpoint is:

```
https://wyoamcydkbblvujvyljs.supabase.co/functions/v1/seller-tools-inbox
```

Its tools can create projects, attach assets, finalize validated packs, read revision requests, update a project and clear one confirmed project. The packaged plugin is under `plugins/planthenroam-seller-tools`.

Before connecting ChatGPT, enable Supabase Auth OAuth 2.1 Server with dynamic client registration and set the authorization path to:

```
/oauth-consent.html
```

## Manual ZIP fallback

A ZIP must contain `manifest.json` plus the named files. Required manifest rules:

- `kind: "tiktok"` with `title`, `coverTitle`, `caption`, exactly five `hashtags`, `soundRecommendation`, the complete `render` recipe, and 6–8 `scenes`. Each scene names one image and includes its exact text, duration, movement, placement, transition and text animation. Do not include an MP4; Seller Tools renders it.
- `kind: "etsy"` with `title`, exactly 13 `tags`, `customerPdf`, `thumbnail`, and `listingImages`.
- `kind: "pinterest"` with `title` and exactly 10 `pins`; each Pin includes `imageFile`, `title`, `description`, `altText`, `link`, and `board`.

The installed PWA checks for updates on launch and hourly. Navigation and same-origin assets use network-first caching so a normal reopen receives the current version without reinstalling.
