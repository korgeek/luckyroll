# Task 5 report: Gravity-only Rapier proof

## Status

COMPLETE. The validated U-channel now passes gravity-only Rapier validation with a fixed `1/60` timestep, gravity `{ x: 0, y: -16, z: 0 }`, radius `0.34` marbles, and one fixed trimesh generated directly from the canonical geometry buffers. The harness applies no force, impulse, teleport, respawn, guide rail body, scripted velocity, or recovery behavior.

## TDD evidence

1. Created the single-marble and ten-seed soak tests before `trackPhysics.ts`.
2. RED: `npm test -- --run src/react-app/game/track/trackPhysics.test.ts` failed because `./trackPhysics` did not exist.
3. GREEN (harness): dynamic initialization of the installed Rapier compatibility ESM build, one fixed trimesh collider, and fixed-step body simulation made the new tests execute against real Rapier.
4. RED (initial physical course): the original approximately `765.408`-unit course had not completed a single marble by 60 seconds (progress `0.698`); an early 100-body run also recorded seed 11 marble 95 escaping at `4,166.667 ms` near sample 957.
5. Authorized X/Z and ordinary-width proportional rescaling produced a `382.704`-unit canonical centerline. New regressions lock the 350–450 length interval, non-launch proportional widths, and physical launch-slot non-overlap.
6. RED (throughput): with the initial bounded grade, seed 11 completed 45/100 by 60 seconds, although it had zero escapes and stalls. The physical-launch regression exposed an implementation defect: row placement was only `0.48` units apart. Corrected placement advances each row `1.2` world units along the launch centerline and now keeps every initial pair at least one marble diameter apart.
7. GREEN: a bounded continuous `0.245` downhill guide grade preserves every static threshold, makes the single marble finish in the required time, and passes all 20 independent seed runs below.

## Final physics metrics

Single marble: seed 1 completed `1/1` at `55,283.333 ms`; escapes `0`; stalls `0`.

Each listed 100-marble run independently required 100 unique finishers, zero escapes, zero stalls, and all finishers by 60 seconds.

| Run | Seed | Completed | Last finish (ms) | Escapes | Stalls |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 11 | 100 | 57,950.000 | 0 | 0 |
| 1 | 23 | 100 | 59,600.000 | 0 | 0 |
| 1 | 37 | 100 | 59,133.333 | 0 | 0 |
| 1 | 41 | 100 | 58,733.333 | 0 | 0 |
| 1 | 53 | 100 | 58,733.333 | 0 | 0 |
| 1 | 67 | 100 | 59,300.000 | 0 | 0 |
| 1 | 71 | 100 | 58,466.667 | 0 | 0 |
| 1 | 83 | 100 | 59,483.333 | 0 | 0 |
| 1 | 97 | 100 | 59,083.333 | 0 | 0 |
| 1 | 101 | 100 | 58,250.000 | 0 | 0 |
| 2 | 11 | 100 | 58,650.000 | 0 | 0 |
| 2 | 23 | 100 | 59,600.000 | 0 | 0 |
| 2 | 37 | 100 | 59,133.333 | 0 | 0 |
| 2 | 41 | 100 | 58,733.333 | 0 | 0 |
| 2 | 53 | 100 | 58,733.333 | 0 | 0 |
| 2 | 67 | 100 | 59,300.000 | 0 | 0 |
| 2 | 71 | 100 | 58,466.667 | 0 | 0 |
| 2 | 83 | 100 | 59,483.333 | 0 | 0 |
| 2 | 97 | 100 | 59,083.333 | 0 | 0 |
| 2 | 101 | 100 | 58,250.000 | 0 | 0 |

The two independent runs intentionally do not require identical rank order or matching finish times. The controller ruled that contact-heavy Rapier solver order may vary even after restoring an identical pre-step snapshot. The test therefore proves the safety/completion contract twice for every fixed seed without changing solver settings, collision behavior, or gameplay recovery.

## Test layout

The 20 scenarios are split across three sequential test files so each file stays below Vitest's worker-RPC reporting limit while ordinary `npm test -- --run` still exits normally:

- `trackPhysics.test.ts`: launch placement, single marble, and seeds 11/23/37/41 twice.
- `trackPhysics.middleSeeds.test.ts`: seeds 53/67/71 twice.
- `trackPhysics.finalSeeds.test.ts`: seeds 83/97/101 twice.

`fileParallelism: false` prevents resource-induced overlap between these contact-heavy validations. It does not alter the test timeout or physics engine configuration.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- --run src/react-app/game/track/trackPhysics.test.ts src/react-app/game/track/trackPhysics.middleSeeds.test.ts src/react-app/game/track/trackPhysics.finalSeeds.test.ts` | PASS — 3 files, 5 tests, 20 independent seed simulations. |
| `npm test -- --run src/react-app/game/track` | PASS — 8 files, 51 tests. |
| `npm test -- --run` | PASS — 14 files, 60 tests. |
| `npm run build` | PASS — TypeScript and production Vite build. |
| `git diff --check` | Pending final commit check. |

## Implementation notes

- Rapier is initialized once from its compatibility ESM entry. The package-root export cannot be loaded by Vitest because its wrapper evaluates `exports` in an ESM context; the typed ESM declaration in `vite-env.d.ts` keeps this workaround scoped and build-safe.
- Escape detection is nearest-centerline-sample XYZ distance greater than `15` world units. The radius exceeds the deepest valid channel-rim offset while still reporting bodies that leave the channel; every final run had zero escapes.
- The production build emits only its pre-existing large-chunk advisory. No temporary diagnostics remain in source.
