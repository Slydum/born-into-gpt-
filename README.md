# Born Into V7 — Generations & Relationships

A mobile-friendly top-down generational life simulation. A new life begins inside a generated family with its own parents, siblings, wealth, childcare plan, home, relationships, and history.

## V7 highlights

### Homes that belong to people

- Household members receive assigned bedrooms, beds, and dining seats.
- Sleeping characters are positioned inside their assigned mattress, crib, or sofa slot.
- Partners occupy separate sides of a double bed unless conflict makes one sleep elsewhere.
- Hobby equipment is purchased only after repeated practice and is placed in the owner’s bedroom or an unlocked hobby room.
- Teen-bedroom extensions and second-floor projects persist until completion.
- Completed second floors include two bedrooms, a bathroom, a hobby room, stairs, and floor switching.

### Household routines

- Breakfast, lunch, and dinner move through planning, cooking, serving, eating, leftovers, clearing, and dishes.
- Food is visible only while a meal is served.
- Laundry, dishes, trash, floors, and bathrooms create recurring chores.
- Nannies, stay-at-home parents, and available off-duty parents are prioritized for childcare; workers cannot simultaneously care for a baby from another location.

### Persistent social life

- School-age characters receive a stable class roster.
- Recess, lunch, school encounters, clubs, parks, and invitations create repeated contact.
- Relationships progress through familiar face, acquaintance, friend, and close friend states.
- The phone supports contacts, message threads, delayed replies, family check-ins, and invitations.
- Accepted invitations create a scheduled physical meeting at the park.

### Generations and adulthood

- The player can be born with younger, teenage, or adult older siblings.
- Adult siblings may already live in a dormitory, boarding house, or shared apartment when the player is born.
- At age 18, the player chooses college, full-time work, or trade training and receives a new residence record.
- NPC siblings make their own move-out decisions and remain reachable through the family and phone systems.

### Mood, health, romance, and major events

- Current mood and its causes are shown separately from long-term traits.
- Configurable event chains include flu, serious illness, accidents, temporary or permanent disability, pregnancy, teen pregnancy, unexpected death, and grief.
- Teen romance supports age-appropriate crushes, dating, and first-kiss memories.
- Adult intimacy is optional and represented only with fade-to-black text.
- Exclusive partners and married parents can be unfaithful; discovery damages trust and can change sleeping arrangements.
- Substance-related events focus on refusal, experimentation, consequences, and risk rather than instructions.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## GitHub Pages

Upload the project exactly as extracted. Keep the `src` folder beside `index.html`. Delete any obsolete root-level `main.js` from older builds.

V7 uses a new save key. Start a new life after replacing V6 so the family history, room assignments, social roster, phone, event settings, and adulthood data are generated correctly.

## Current scope note

V7 creates adult move-out choices, residence records, expenses, continuing relatives, and phone contact. Dormitories and separate apartments are not yet rendered as fully navigable interior maps; the detailed playable map remains the family home and town locations.
