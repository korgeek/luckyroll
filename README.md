# Lucky Roll

An instant, offline-friendly neon pinball marble party game. The last marble to cross the finish line takes first place.

## Modes

- **Race** — 100 marbles are split as evenly as possible across 2–10 players. The final Top 10 is ranked in reverse finish order, so last wins.
- **Team Split** — one marble per player rolls through the track before a balanced, random 2- or 3-team draw is revealed.

Race sessions have safety rails, bumpers, escape respawns, stalled-marble nudges, and a 20-second timeout with options to rerun only the remaining marbles, restart, or show the current results. An optional prize pool awards 50% / 20% / 10% / 5% (ranks 4–7); winnings are summed per player.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Checks

```bash
npm test -- --run
npm run build
```

## Sound

The bundled 90s-style start, finish, and timeout effects are synthesized with the Web Audio API so the game remains entirely offline and does not need an audio download. The selected future sample-library option is [Pixabay's “Arcade” by SoundReality](https://pixabay.com/sound-effects/film-special-effects-arcade-280345/), available under the [Pixabay Content License](https://pixabay.com/service/license-summary/). It is not bundled in this repository.

## Deployment

This repository retains its Cloudflare Workers configuration. Pushes to the connected branch are handled by the existing Cloudflare Git integration.
- [Hono Documentation](https://hono.dev/)
