# Task 5 report: Gravity-only Rapier proof

## Status

IMPLEMENTED AND REVIEW-FIXED. The validated U-channel passes gravity-only Rapier validation with a fixed `1/60` timestep, gravity `{ x: 0, y: -16, z: 0 }`, radius `0.34` marbles, and one fixed trimesh generated directly from the canonical geometry buffers. The harness applies no force, impulse, teleport, respawn, guide rail body, scripted velocity, or recovery behavior.

## TDD evidence

1. Created the single-marble and ten-seed soak tests before `trackPhysics.ts`.
2. RED: `npm test -- --run src/react-app/game/track/trackPhysics.test.ts` failed because `./trackPhysics` did not exist.
3. GREEN (harness): dynamic initialization of the installed Rapier compatibility ESM build, one fixed trimesh collider, and fixed-step body simulation made the new tests execute against real Rapier.
4. RED (initial physical course): the original approximately `765.408`-unit course had not completed a single marble by 60 seconds (progress `0.698`); an early 100-body run also recorded seed 11 marble 95 escaping at `4,166.667 ms` near sample 957.
5. Authorized X/Z and ordinary-width proportional rescaling produced a `382.704`-unit horizontal centerline and approximately `393.586` units of actual XYZ centerline length. The 3D 350–450 regression is now authoritative; it also locks `sampleSpacing: 0.5`, non-launch proportional widths, and physical launch-slot non-overlap.
6. RED (throughput): with the initial bounded grade, seed 11 completed 45/100 by 60 seconds, although it had zero escapes and stalls. The physical-launch regression exposed an implementation defect: row placement was only `0.48` units apart. Corrected placement advances each row one world unit along the launch centerline and keeps every initial pair at least one marble diameter apart.
7. RED (Sol review): analytic U-profile launch lifts placed every sphere only `0.219519` units from the actual faceted mesh; a selected-face-normal prototype was not conservative at creases and reached `0.165931`. Seed rotation changed IDs only, not physical coordinates; `sampleSpacing` was unauthorized at `0.4`; and the public two-argument body factory accepted raw logical slots.
8. GREEN (Sol review): physical starts are built from the exact generated 8-segment mesh facet at their real launch row, offset with a conservative clearance and regression-checked at `>= 0.345` for every sphere across all ten fixed seeds. The exported two-argument `createMarbleBodies(world, physicalPositions)` only consumes branded physical positions; deterministic lateral launch jitter gives repeatable same-seed positions and distinct coordinate sets for different seeds. The pure node builder uses a separately named initial-A height and raw nodes with no ignored Y fields. A bounded continuous `0.245` downhill guide grade preserves every static threshold, makes the single marble finish in the required time, and passes all 20 independent seed runs below.

## Final physics metrics

Single marble: seed 1 completed `1/1` at `49,416.667 ms`; escapes `0`; stalls `0`.

Each listed 100-marble run independently required 100 unique finishers, zero escapes, zero stalls, and all finishers by 60 seconds.

| Run | Seed | Completed | Last finish (ms) | Escapes | Stalls |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 11 | 100 | 57,633.333 | 0 | 0 |
| 1 | 23 | 100 | 57,050.000 | 0 | 0 |
| 1 | 37 | 100 | 57,333.333 | 0 | 0 |
| 1 | 41 | 100 | 56,933.333 | 0 | 0 |
| 1 | 53 | 100 | 57,033.333 | 0 | 0 |
| 1 | 67 | 100 | 56,850.000 | 0 | 0 |
| 1 | 71 | 100 | 57,500.000 | 0 | 0 |
| 1 | 83 | 100 | 57,366.667 | 0 | 0 |
| 1 | 97 | 100 | 57,316.667 | 0 | 0 |
| 1 | 101 | 100 | 56,783.333 | 0 | 0 |
| 2 | 11 | 100 | 57,483.333 | 0 | 0 |
| 2 | 23 | 100 | 57,050.000 | 0 | 0 |
| 2 | 37 | 100 | 57,116.667 | 0 | 0 |
| 2 | 41 | 100 | 57,100.000 | 0 | 0 |
| 2 | 53 | 100 | 57,683.333 | 0 | 0 |
| 2 | 67 | 100 | 57,466.667 | 0 | 0 |
| 2 | 71 | 100 | 57,516.667 | 0 | 0 |
| 2 | 83 | 100 | 57,650.000 | 0 | 0 |
| 2 | 97 | 100 | 57,050.000 | 0 | 0 |
| 2 | 101 | 100 | 58,466.667 | 0 | 0 |

The two independent runs intentionally do not require identical rank order or matching finish times. The controller ruled that contact-heavy Rapier solver order may vary even after restoring an identical pre-step snapshot. The test therefore proves the safety/completion contract twice for every fixed seed without changing solver settings, collision behavior, or gameplay recovery.

## Test layout

The 20 scenarios are split across six sequential test files so each file stays below Vitest's worker-RPC reporting limit while ordinary `npm test -- --run` still exits normally:

- `trackPhysics.test.ts`: launch placement, single marble, and seeds 11/23 twice.
- `trackPhysics.secondSeeds.test.ts`: seeds 37/41 twice.
- `trackPhysics.middleSeeds.test.ts`: seeds 53/67 twice.
- `trackPhysics.thirdSeeds.test.ts`: seed 71 twice.
- `trackPhysics.finalSeeds.test.ts`: seeds 83/97 twice.
- `trackPhysics.fourthSeeds.test.ts`: seed 101 twice.

`fileParallelism: false` prevents resource-induced overlap between these contact-heavy validations. It does not alter the test timeout or physics engine configuration.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- --run src/react-app/game/track/trackPhysics.test.ts` (twice) | PASS — 6 tests both times; launch regressions, 49.417s single marble, seeds 11/23 twice. |
| `npm test -- --run src/react-app/game/track` | PASS — all track tests, including 20 independent seed simulations. |
| `npm test -- --run` | PASS — 18 files, 77 tests, including the all-ten-seed launch invariant matrix. |
| `npm run build` | PASS — TypeScript and production Vite build. |
| `git diff --check` | PASS — no whitespace errors. |

## Implementation notes

- Rapier is initialized once from its compatibility ESM entry. The package-root export cannot be loaded by Vitest because its wrapper evaluates `exports` in an ESM context; the typed ESM declaration in `vite-env.d.ts` keeps this workaround scoped and build-safe.
- Escape detection is nearest-centerline-sample XYZ distance greater than `15` world units. The radius exceeds the deepest valid channel-rim offset while still reporting bodies that leave the channel; every final run had zero escapes.
- The production build emits only its pre-existing large-chunk advisory. No temporary diagnostics remain in source.
