# Seller Tools Release 29

Fixes Review Box image import querying a nonexistent user_id column. Access remains protected by owner OAuth, Review Box RLS, exact listing association and owner-prefixed private file paths. Regression fixtures now match the deployed schema. Plain database errors retain their diagnostic message.

Live acceptance completed: the authenticated ChatGPT connector saved 108 images into 18 existing masters, all at revision 1 with six ordered images. All 108 private downloads matched their saved sizes and SHA-256 checksums. A repeated import returned the existing revision without duplication. Review Box and returned Etsy listing data remained unchanged; no publishing or scheduling was invoked. All 39 tests pass.
