# V7.1 test notes

## Automated checks completed

- JavaScript syntax check for every source module.
- 80 deterministic new-life seeds checked for:
  - parent ages at the player’s birth;
  - valid older-sibling timelines;
  - family-home residence initialization;
  - assigned bed capacity;
  - removal of unassigned duplicate beds;
  - furniture sprite resolution.
- Same-home family messages checked to ensure neither side uses “I miss you” dialogue.
- Death transition checked for job removal, schedule cancellation, archived contact, removed map presence, and family-tree update.
- Adult work-path move-out checked for:
  - creation of a playable apartment;
  - player transfer and assigned bed;
  - preserved family home;
  - visiting family and returning home;
  - correct save rehydration.
- Multi-day simulation smoke test completed without runtime state errors.
- Biological family planning tested with both parents aged 72; no pregnancy is created.
- All 30 furniture PNGs checked for RGBA transparency and valid file paths.

## New save required

V7.1 uses `born-into-save-v71`. Begin a new life after deployment.
