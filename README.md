# Born Into V7.1.2 — Return Home Hotfix

A mobile-first autonomous life simulation. V7.1 focuses on keeping every system consistent when people age, die, move away, visit family, replace furniture, and begin adult life.

## V7.1 highlights

- One residence model shared by movement, schedules, phone messages, jobs, family panels, and rendering.
- Death cleanup: deceased people stop moving, working, earning, parenting, and replying to messages. Their contact is memorialized and their family-tree history remains.
- Context-aware messaging: relatives in the same home no longer send long-distance “I miss you” dialogue.
- Chronological family generation with parents aged 24–46 when the player is born and older siblings constrained by that timeline.
- Biological family planning requires a living female adult aged 18–45; unusual older-parent households can still be represented through prior history, adoption, or guardianship stories later.
- Adult move-out creates a playable student apartment, shared apartment, or boarding residence. The family home remains preserved and visitable.
- Official residence and current location are separate, so an adult can visit family without moving back permanently.
- Assigned beds and bedroom cleanup. Duplicate, replaced, and outgrown beds are transferred to household storage rather than accumulating in rooms.
- Furniture ownership follows characters when portable belongings are moved.
- The uploaded living-room artwork is loaded as one sprite atlas, with source rectangles for sofas, armchairs, television consoles, rugs, lamps, plants, and decor.
- The browser uses a PNG alpha-compatible copy of the uploaded sheet so furniture renders without white boxes on GitHub Pages.
- Sprite-backed beds, cribs, bunk beds, wardrobes, desks, sofas, chairs, coffee tables, rugs, lamps, plants, bookshelves, televisions, and wall art.
- Household style profiles choose coherent furniture variants by wealth, palette, layout, and home style.

## Project structure

```text
index.html
styles.css
.nojekyll
package.json
assets/
  furniture/
src/
  art.js
  config.js
  data.js
  furniture.js
  main.js
  render.js
  simulation.js
  state.js
  ui.js
  utils.js
  v7.js
  world.js
```

## Run locally

```bash
npm run dev
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the complete project while preserving the `assets/furniture` and `src` directories. The repository root should contain `index.html` and `.nojekyll`.

V7.1 uses a new save key. Begin a new life after replacing V7 so residence records, furniture ownership, realistic family ages, and continuity data are generated correctly.

## Checks

```bash
npm run check
```

The included implementation was also tested with deterministic state tests covering family timelines, assigned beds, same-home messaging, death cleanup, adult move-outs, residence switching, save rehydration, asset paths, and a multi-day simulation smoke test.
