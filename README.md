# Born Into V5

A mobile-friendly browser-based generational life simulation. Characters live through autonomous routines in a top-down world while detailed procedural portraits introduce the family and support profiles, relationships, and life events.

## V5 highlights

- Three-step birth introduction explaining the player's family, birth order, siblings, wealth, home, and childcare arrangement
- Dynamic only-child, firstborn, middle-child, youngest-child, and twin beginnings
- Existing older and younger siblings with their own ages, appearances, needs, schedules, beds, and relationships
- Wealthy households can employ a day or live-in nanny so both parents can continue working
- Other households may assign a stay-at-home parent, who can return to paid work when the youngest child becomes a teenager
- Autonomous player exploration with Stop, Resume, Choose Place, and direct-control options
- Parents, siblings, player, and nanny move through rooms to real activity points instead of waiting at the front door
- Procedural top-down character art with walking, sleeping, and sitting poses
- Layered procedural portraits with skin, hair, clothing, age, and accessory variation
- Rebuilt room templates for parent bedroom, child room, kitchen, living room, dining room, and bathroom
- Weekly schedules, weekends, hobbies, one payment per completed shift, bills, furniture purchases, construction, and town residents
- Notification deduplication and high-speed summaries

## Run locally

Use any static server. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

- The player follows an autonomous routine by default.
- **Choose Place** sends the player somewhere automatically.
- **Stop** pauses only the player's routine while the world continues.
- **Resume** restores the autonomous schedule.
- **Take Control**, WASD, or arrow keys enables direct movement.
- **E** interacts with nearby objects.
- **C** cries during the baby stage.

## GitHub Pages

Upload the files with this exact structure and publish from the repository root:

```text
index.html
styles.css
.nojekyll
package.json
README.md
src/
  art.js
  config.js
  data.js
  main.js
  render.js
  simulation.js
  state.js
  ui.js
  utils.js
  world.js
```

V5 uses a new save schema. Start a new life after updating from an older build.
