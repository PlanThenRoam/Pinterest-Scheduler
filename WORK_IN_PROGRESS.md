# Release 31

Fix false live styles drift on PDF-only updates. Draft preparation and publisher preflight now share listingSnapshot, with absent optional array fields normalised to empty arrays. Real nonempty styles changes still block before any writes. Japan attempt was blocked with zero write steps; preserve its existing reviewed PDF attachment and history. No Etsy publication is performed by this repair.
