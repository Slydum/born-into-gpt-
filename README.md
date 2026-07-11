# Born Into V6 — Household Life

A mobile-friendly top-down generational life simulation where a generated family cooks, eats together, handles childcare, completes chores, practices hobbies, forms relationships, works, studies, and changes across generations.

## V6 highlights

- Four distinct home plans selected from the world seed, with wealth-based furniture and room availability
- Persistent teen-bedroom construction that survives saves, visibly progresses, reshapes the selected layout, and records completion in family history
- Strict childcare availability: working, commuting, and school-going characters cannot care for a baby at the same time
- Active caregiver priority for nannies, stay-at-home parents, and available off-duty parents
- Planned breakfast, lunch, and dinner; cooking at the stove; visible table servings; shared meals; dirty dishes and cleanup
- Laundry, trash, floor mess, bathroom cleaning, washing machines, and dishwashers
- Household hobby purchases including exercise gear, easels, instruments, gardening, sewing, and gaming equipment
- Painting progress, completed artwork, estimated value, and household sales
- Conversations at home and public locations, speech bubbles, acquaintances, friendship growth, affection, and trust
- Visible player traits, interests, and practiced skills; traits influence hobbies, schedules, purchases, chores, social behavior, and family choices
- Always-visible weekday, day number, week number, and time on mobile
- Top-down autonomous room navigation plus direct movement and object interaction

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## GitHub Pages structure

Upload the project exactly as extracted. Keep the `src` folder beside `index.html`.

V6 uses a new save key. Begin a new life after replacing an older version so the new home, household, meal, chore, hobby, social, and construction data are generated.
