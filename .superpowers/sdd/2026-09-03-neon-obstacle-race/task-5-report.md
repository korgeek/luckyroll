# Task 5 Report — Production Integration and Qualification

## Implemented

- Wired canonical Task 1–3 geometry, Rapier resources, and render resources into `MarbleRaceScene`.
- Fixed runtime order: device fixed pose → Rapier `world.step()` → shared Three.js render pose. Race time starts only after the gate-open world step.
- Full starts use the start-bowl launcher; remaining-marble restarts use the existing track launcher with an explicitly open gate.
- Reset/replay disposes obstacle physics before its world and frees obstacle render resources. The environment/HUD use the dark navy neon styling with bounded lights and no bloom.
- Added the guarded qualification harness, ledger, README controls/debug/budget/mobile notes, and focused scene/lifecycle tests.

## TDD evidence

- RED: `npm test -- --run src/react-app/game/MarbleRaceScene.test.ts` failed for missing production obstacle helpers, then a styling-contract test failed for the missing style hook.
- GREEN: focused scene and obstacle-physics suites passed after the implementation.
- Qualification-guard RED: `npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts` failed for absent seed-validation exports; after implementation and ledger creation, it passed with the full-race case skipped unless explicitly enabled.

## Verification

```text
npm test -- --run src/react-app/game/MarbleRaceScene.test.ts src/react-app/game/track/obstaclePhysics.test.ts src/react-app/game/track/obstaclePhysics.validation.test.ts
Test Files  3 passed (3)
Tests       45 passed | 1 skipped (46)

npm run build
tsc -b && vite build
✓ built

git diff --check
exit 0
```

The build retained Vite's chunk-size advisory for `MarbleRaceScene` and Rapier retains its initialization deprecation warning in focused tests. Neither is a build/test failure.

## Qualification ledger and blocker

The one permitted command was run once:

```text
RUN_OBSTACLE_QUALIFICATION=1 npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts
```

It stepped seed `11`, then stopped at its required containment assertion:

| Seed | Finishers | Last elapsed | Escapes | Stalls | Unique IDs |
| ---: | ---: | --- | ---: | ---: | --- |
| 11 | 0 | — | 40 | 59 | true |

The escape/stall events occur while the race elapsed clock is still zero, during the 1500 ms bowl shuffle. The likely root cause is high-energy interaction between the dense bowl field and the three-arm agitator before gate opening. The command's failure assertion prevented seeds `23, 37, 41, 53, 67, 71, 83, 97, 101` from stepping.

### Focused post-blocker fix

A one-marble pre-gate probe reproduced the issue without consuming a full-race attempt: the original three-turn agitator reached `47.02335557499136` units/s, exceeding the test's `8`-unit safety cap. The shared controller's command was reduced to a quarter-turn over the same 1500 ms interval; the one-marble regression now passes. No geometry, launch placement, base track, or lifecycle path was changed. The focused scene/obstacle/ledger suite passed `46` tests with `1` intentionally skipped qualification test, and `npm run build` completed successfully (retaining only Vite's existing chunk-size advisory).

## Approved pending-nine resume

Sol approved the remaining nine seeds after the focused agitator cap. The guarded resume command was invoked once and printed these completed rows before aggregate assertions:

| Seed | Finishers | Last elapsed | Escapes | Stalls | Unique IDs |
| ---: | ---: | --- | ---: | ---: | --- |
| 23 | 0 | — | 22 | 78 | true |
| 37 | 0 | — | 26 | 73 | true |
| 41 | 0 | — | 25 | 74 | true |
| 53 | 1 | 53183.33333333132 | 21 | 75 | true |
| 67 | 1 | 51983.333333331495 | 21 | 76 | true |
| 71 | 2 | 51883.33333333151 | 26 | 71 | true |
| 83 | 1 | 52933.33333333136 | 31 | 65 | true |
| 97 | 0 | — | 24 | 73 | true |
| 101 | no captured row | — | — | — | — |

The command exited after seed 97 without printing a seed-101 row. Because that seed may have begun stepping before termination, the ledger conservatively records it as consumed. The physics budget is **10/10**, with zero remaining attempts; no rerun is permitted. Qualification is blocked by mass escapes/stalls on every captured resumed row, and seed 101 has no result to claim.

Focused/static tests and the build may still pass, but they do not qualify the obstacle course. Any later dynamic retest requires explicit user authorization for an eleventh attempt after a broader obstacle/route safety redesign.

## Manual/mobile checks not performed

No browser acceptance or push was performed, as required. Before release, manually verify at 360 × 800: legible English HUD, touch drag, wheel/trackpad zoom, race/team result behavior, 60-second dialog/restart-remaining, and replay resource cleanup. Also visually confirm the start bowl does not launch marbles during its shuffle before authorizing another qualification attempt.
