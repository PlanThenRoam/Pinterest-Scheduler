# Release 32

Rome image six upload was confirmed, but Etsy retained its old alt text. Verified live image ID 8536971629 visually has the approved no-page-count design; images 1–5 retain their IDs and alt text.

Replacement flow now saves alt text separately against the returned image ID and verifies identity and text. Failed readback is retained. Image-only recovery checks unchanged fields, files and other images, holds the publish lock, and only writes approved alt text. Rome awaits the owner clicking Finish image update; no Etsy write was made during this repair.

Authenticated listing discovery now returns image IDs, ranks, alt text and URLs for read-only checking.
