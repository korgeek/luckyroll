# Lucky Roll

An instant, offline-friendly neon pinball marble party game. The last marble to cross the finish line takes first place.

## Modes

- **Race** — 100 marbles are split as evenly as possible across 2–10 players. The final Top 10 is ranked in reverse finish order, so last wins.
- **Team Split** — one marble per player rolls through the track before a balanced, random 2- or 3-team draw is revealed.

Race sessions use a continuous three-level downhill track with a shuffled neon start bowl, staggered pegs, alternating pushers, a two-path merge, and a vortex catch channel. The directed camera follows the early leader, then moves toward the trailing marble. Drag or touch-drag to orbit and use the wheel to zoom.

The 60-second dialog remains a player-facing control for rerunning only the remaining marbles, restarting, or showing results. Physics safety qualification uses zero escapes, zero genuine stalls, and unique finisher identities; marbles still moving after 60 seconds are observed rather than rejected. The tracked ten-seed budget is documented in `.superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md`.

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

The bundled 90s-style start, finish, and timeout effects are synthesized with the Web Audio API so the game remains entirely offline and does not need an audio download. The selected future sample-library option is [Pixabay's “Arcade” by SoundReality](https://pixabay.com/sound-effects/film-special-effects-arcade-280345/), available under the [Pixabay Content License](https://pixabay.com/service/license-summary/). It is not bundled in this repository.

## Deployment

This repository retains its Cloudflare Workers configuration. Pushes to the connected branch are handled by the existing Cloudflare Git integration.
- [Hono Documentation](https://hono.dev/)
