# Lucky Roll

An instant, offline-friendly neon pinball marble party game. The last marble to cross the finish line takes first place.

## Modes

- **Race** — 100 marbles are split as evenly as possible across 2–10 players. The final Top 10 is ranked in reverse finish order, so last wins.
- **Team Split** — one marble per player rolls through the track before a balanced, random 2- or 3-team draw is revealed.

Race sessions use the editor-built Default Track. Its high-walled rectangular start pen randomizes 100 marbles, opens a physical gate, and uses a physical start pusher to guide every row into the first module. The directed camera follows the race automatically, while Bird View shows the whole course from above with the start at the top and finish at the bottom.

## Track Designer

The 5×8 modular editor starts from the valid Default Track. Select a different module and tap an occupied cell to replace it; tap without a new selection to rotate, or hold for replace/clear actions. Valid tracks can be saved in this browser, selected for the next visit, deleted, tested with the same 100-marble race, or shared as a Base64URL token or link. If a selected saved track disappears, the game falls back to Default Track.

The builder, browser-storage, and Base64URL share formats are unchanged. At race time, every low-friction bobsled route descends 7 degrees relative to its direction; curve interiors bank automatically to 24 degrees and return to flat, seamless landings. Boosters guarantee a minimum forward exit speed of 18 track units per second.

The race engine and physics are loaded before the setup screen is ready. After that Ready point, editing, saving, raw-token importing, and racing use no application API or database. A cold offline reload is not supported; installable PWA caching can be added if that becomes necessary.

The 60-second dialog remains a player-facing control for rerunning only the remaining marbles, restarting, or showing results. The legacy built-in obstacle course's 15-attempt physics qualification budget (12 consumed; three held pending direction) is documented in `.superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Checks

```bash
npm test -- --run src/react-app/game/track
npm test -- --run
npm run build
```

## Track debug views

Run the development server, then open the deterministic local debug controls:

```text
http://127.0.0.1:5173/?trackDebug=1
```

The **Top**, **Side**, and **Profile** buttons pause the race and hold their named camera view. **Resume** restores the production camera and physics. The debug-only overlay reports FPS, draw calls, triangles, active/finished marbles, and the current shot for mobile-viewport capture.

## Mobile acceptance

The scene uses instanced marbles and pegs, shared device materials, bounded point lights, and no bloom/effect-composer pass. Verify the 360 × 800 viewport manually: readable English HUD, touch orbit, wheel/trackpad zoom, no clipped controls, and a smooth active 100-marble race.

## Sound

The bundled 90s-style start, finish, and timeout effects are synthesized with the Web Audio API, so the game needs no audio download.

## Deployment

This repository retains its Cloudflare Workers configuration. Pushes to the connected branch are handled by the existing Cloudflare Git integration.
