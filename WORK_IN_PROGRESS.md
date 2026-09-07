# Seller Tools Release 27

Master Files is implemented with private uploads, current downloads, version history, conflict protection, restore and Etsy review staging. Backend app version 27 / API 3.3.0.

Validation: 30 regression tests pass. Rolled-back database checks cover atomic version commits, idempotent retry, stale-save rejection, restores and owner-only access.

The catalogue contains 18 planner records linked to current Etsy listings. Planner binaries have not been imported: numbered copies must be reconciled with the approved source before designating the masters. No live Etsy listings were changed during implementation.

New connector tools and workflow instructions are included. ChatGPT’s existing thread may retain its older action catalogue; a fresh chat with the updated connection is required to check tool discovery. No local personal marketplace exists in this environment, so local plugin reinstall is not applicable.

Etsy replacement still requires a free file slot. Word files are wrapped in ZIP for Etsy delivery. Saving or restoring a master does not publish it.
