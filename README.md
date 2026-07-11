# Born Into

A playable browser-based generational life-simulation prototype built with HTML5 Canvas and JavaScript.

## Start the game

The quickest option is to open `index.html` directly. On Windows, double-click `START_GAME.bat`.

For a development server:

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Controls

- **WASD / Arrow keys:** Move after the baby stage
- **E:** Interact
- **C:** Cry during the baby stage
- **Space:** Pause
- Touch controls appear on narrower screens

## Included systems

- Seeded town generation with home, grocery, school, hospital, workplace, park, and social services
- Autonomous caregiver utility AI with needs, traits, work, shopping, child care, stress, and arguments
- Baby care, crying, neglect timer, social-worker dispatch, support, and foster placement
- Toddler movement, curiosity, household interactions, and hazards
- Child school attendance, grades, recurring friendship, and conflict events
- Simplified teen, adult, relationship, career, parenthood, elder, death, and generational handoff systems
- Persistent family tree data and children
- Browser `localStorage` save/continue
- Responsive touch controls
- Built-in test controls for quickly checking stages and generational continuation

## Notes

This is a vertical slice intended to be expanded. The simulation uses accelerated aging so all life stages can be tested without hours of play. The test controls in the right panel can add one year, trigger an event, add a child, or force death.
