# Lucky Roll

An instant, offline-friendly neon pinball marble party game. The last marble to cross the finish line takes first place.

## Race

Choose 100 (default), 200, or 300 marbles above START RACE, split as evenly as possible across 2–10 players. Each layer holds up to 100 marbles; the complete slot pool is shuffled across players before gravity collapses the stack at launch. Higher counts need a faster device; use 100 for smoother play. The final Top 10 is ranked in reverse finish order, so last wins.

Race sessions use the selected track, which can be changed directly from the Main Menu without opening the track manager. The Default Track's high-walled rectangular start pen opens a physical gate and uses a physical start pusher to guide every row into the first module. Its demo route includes rounded moguls, a wheel, waves, boosters, and a final six-post pinball section. Wheel and pinball broadcasts start overhead, ease closer after 0.5 seconds, then hold the close shot for 1.5 seconds before returning overhead once 50% pass. The camera travels inside the channel, with route-aligned portrait framing and horizontal landscape framing. The wheel releases after more than 80% pass (81/161/241), allowing the occupied close shot to finish first; an emptied section does not delay release. Pinball holds until all live marbles clear. Bird View shows the whole course from above.

Results feature the last finisher, with a brief celebration only when every marble completes the race. Replay runs the same participants, marble count, prize, and course with a fresh seed; Back to Menu keeps the entered names, count, and selected track.

Starting or replaying shows PREPARING RACE… until the scene is ready, then a three-second 3 → 2 → 1 → GO! countdown. Marbles and race time remain held until GO; opening the navigation menu also freezes the countdown.

During a race, the compact reverse leaderboard shows the trailing (winning) five marbles on portrait phones and ten elsewhere, with gaps in track units. BOOST raises each active marble's forward speed to 1.5×, capped at 42 track units per second; it starts with a five-second charge, recharges after use, and freezes while paused.

With 1–10 marbles still racing, RUSH activates once: remaining spheres and colliders grow to 1.5× and simulation runs at 2× using unchanged 1/60-second collision steps. A persistent pulsing RUSH! banner, accelerator bar, and speed lines mark the finale; reduced-motion uses a static treatment. Pause and new races suspend or reset the effect, and BOOST retains its normal recharge rate.

## Track Designer

The 5×8 modular editor starts from the valid Default Track. Select a different module and tap an occupied cell to replace it; tap without a new selection to rotate, or hold for replace/clear actions. The Main Menu opens a separate Manage Tracks screen with one card per saved track. Share opens a popup with Copy code; another player can use Import code in Manage Tracks to create an editable draft, then Save to keep it locally. If a selected saved track disappears, the game falls back to Default Track.

The builder, browser-storage, and Base64URL share formats are unchanged; old shared links remain decodable for compatibility. At race time, every low-friction bobsled route descends 7 degrees relative to its direction; curve interiors bank automatically to 24 degrees and return to flat, seamless landings. Boosters guarantee a minimum forward exit speed of 18 track units per second. A booster immediately before pinball also redirects returning marbles forward after a 750ms per-marble recharge; round posts use 0.65 restitution. Rounded moguls reach one track unit high without changing module ports.

The race engine and physics are loaded before the setup screen is ready. After that Ready point, editing, saving, raw-token importing, and racing use no application API or database. A cold offline reload is not supported; installable PWA caching can be added if that becomes necessary.

The 120-second dialog remains a player-facing control for rerunning only the remaining marbles, restarting, or showing results. The legacy built-in obstacle course's 15-attempt physics qualification budget (12 consumed; three held pending direction) is documented in `.superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md`.

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

The bundled 90s-style start, finish, and timeout effects use [MIT-licensed SoundKit assets](src/react-app/assets/audio/CREDITS.md), with Web Audio synthesis as a fallback. The license notice is included in the built app at [`/licenses/SOUNDKIT-LICENSE.txt`](public/licenses/SOUNDKIT-LICENSE.txt).

## Deployment

This repository retains its Cloudflare Workers configuration. Pushes to the connected branch are handled by the existing Cloudflare Git integration.

Wrangler explicitly enables Observability, Workers Logs, and invocation logs. These record Worker invocations; they do not add browser gameplay logging or force static asset requests through the Worker. See [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
