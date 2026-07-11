# 7.1.2 — Return-home and caregiver hotfix

- Family agents keep simulating after leaving the visible residence.
- Work shifts, shopping trips, park visits, and commutes now complete off-screen.
- Agents choose a return-home goal instead of freezing outside forever.
- Assigned stay-at-home caregivers bring babies on errands when no backup adult is available.
- Babies are placed safely back at home after the caregiver returns.
- Existing V7.1 saves remain compatible.

# 7.1.1 — Living-room sprite atlas

- Uses the uploaded living-room sheet directly as a single sprite atlas.
- Adds crop metadata for sofas, armchairs, TV consoles, rugs, lamps, plants, and shelf decor.
- Reuses one decoded image for every sprite region instead of loading duplicate files.
- Adds source-rectangle rendering support to the canvas furniture renderer.
- Adds green, blue, cream, and orange coordinated living-room variants.
- Fixes the furniture metadata fallback to use `BED_FURNITURE_IDS`.
- Bumps the browser cache key to `v=711`.

# 7.1.0 — Continuity & Homes

- Added a single authoritative household and residence model.
- Added fully playable starter residences after the player moves out at 18.
- Preserved the family home as a separate visitable residence.
- Separated official residence from current visit location.
- Fixed deceased people continuing to work, move, earn money, or reply to messages.
- Added memorialized phone contacts and widowed relationship state.
- Made phone dialogue aware of same-home, nearby, away, busy, and deceased contexts.
- Limited biological family planning to living female adults aged 18–45.
- Prevented dead characters from continuing to age.
- Increased the default life-year duration from two to four game days.
- Added bed-capacity reconciliation and storage for outgrown or duplicate beds.
- Added portable furniture transfer during adult move-out.
- Added thirty transparent furniture sprite assets from the provided sheets.
- Added sprite selection by household style, wealth, palette, and furniture purpose.
- Added sprite rendering for beds, cribs, bunk beds, storage, desks, living-room furniture, rugs, plants, lamps, and wall art.

# 7.0.1 — Mobile menu hotfix

- Made the legacy-save notice dismissible.
- Prevented the warning from covering the mobile menu.

# 7.0.0 — Generations & Relationships

- Added assigned beds, multi-floor homes, persistent friendships, phones, adult transitions, older siblings, romance, health, and major life events.
