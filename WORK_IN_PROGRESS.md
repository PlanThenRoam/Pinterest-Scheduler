# Seller Tools Release 28

API 3.4.0 adds native ChatGPT file upload, six-image Review Box import, explicit OAuth tool metadata, public metadata discovery and per-file save results. Master saves preserve identities and history, use immutable objects and idempotency keys, and cannot trigger Etsy publishing or scheduling. Customer Etsy downloads are PDF-only.

The deployed release 27 source already registered the four master tools, while the current ChatGPT catalogue retained seven materially older Review Box schemas. This establishes a server/client metadata mismatch, not the underlying reason ChatGPT retained its snapshot. The old dev connection ID was reported not installed; the display-name lookup found an installed connection. Its actual registered URL and current metadata still require authenticated inspection.

The 108 approved images are in 18 existing private Review Box projects. The newer NC500 refined project replaces the earlier NC500 image-update project in this set. Before transfer, 18 existing master records are revision 0 with no files. No acceptance-test image transfer has been claimed.

Validation and deployment results will be updated as completed. The browser is signed out of both ChatGPT and Seller Tools, and the current callable ChatGPT catalogue still lacks the new actions.
