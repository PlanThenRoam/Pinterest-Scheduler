# Seller Tools Release 30

QA repair: persistent Cancel Editing and Save controls, cancellation of new drafts into the archive, resume existing drafts, stale-editor revision protection, guarded in-flight saves, PDF-only listing upload controls, and unsaved Master Files form protection. Asset previews stack above editors and keyboard focus stays inside dialogs.

Automated regression tests cover cancel/keep editing, saved draft preservation, new-draft cancellation, draft reuse, concurrent revision changes, in-flight save cancellation, file-input dirty state, Pin editing and Master Files discard guards.

Release 30 deployed. All 46 automated tests passed. A live 390 × 844 browser check confirmed persistent Cancel and Save controls and exposed horizontal form overflow; the follow-up CSS constrains fieldset minimum width and file inputs. The browser connection then timed out while exercising the discard dialog, so its behaviour is verified by automated tests rather than a completed browser confirmation test. No live listing or master changes were made for QA.
