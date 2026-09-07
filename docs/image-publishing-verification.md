# Release 36 image publishing verification

Verified against Etsy on 7 September 2026, using an unpublished integration-test draft.

## Cause

Binary image replacement with `overwrite=true` retained the previous image's alt text. An older second request used the returned image ID with `overwrite=true`, which could remove that same image. Release 35 removed the destructive request but did not correct inherited alt text. Its mock incorrectly assumed the initial binary upload updated the alt text.

## Corrected shared workflow

1. Persist the upload attempt; upload each selected photo once.
2. Persist the returned image ID and verify the complete image identity/order set.
3. If necessary, assign matching alt text to that exact ID with `overwrite=false`.
4. Read back every photo and verify selected and untouched content, listing fields and PDFs.
5. Retry bounded readback delays and definite HTTP 429 rejections using Etsy's Retry-After. Never retry ambiguous upload failures.

New listings use the same identity and alt-text verification before activation. Paused image-only edits have an owner-authenticated completion action. Recovery requires recorded image identities and verifies all untouched state; it never repeats an unconfirmed upload. Previously removed final images can be restored once without overwriting another slot.

## Real Etsy results

- All six positions tested independently, including the thumbnail and final photo.
- Repeating each exact-ID alt assignment preserved six distinct images, their order and all untouched alt text.
- The actual shared publisher successfully replaced positions 1, 3 and 6 together while preserving positions 2, 4 and 5.
- The actual recovery function restored a deliberately removed final image after an injected interrupted alt update, returning six correctly ordered photos and matching alt text.
- Test draft was never activated. Etsy refused its deletion because the existing connection lacks `listings_d`; the unpublished test draft requires owner deletion in Etsy.

The temporary authenticated diagnostic and maintenance routes are removed from the released code. No API credentials are stored here.
