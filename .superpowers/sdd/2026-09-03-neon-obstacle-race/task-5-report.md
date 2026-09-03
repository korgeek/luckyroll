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

Budget is therefore **1/10 consumed**, not 10/10. Per the hard instruction, no additional 100-marble world was started and the validation command was not rerun. The ledger is updated with the observed row. A controller/user must authorize any future completion of the remaining seed plan after an agitator/launch safety fix is reviewed with focused/static tests.

## Manual/mobile checks not performed

No browser acceptance or push was performed, as required. Before release, manually verify at 360 × 800: legible English HUD, touch drag, wheel/trackpad zoom, race/team result behavior, 60-second dialog/restart-remaining, and replay resource cleanup. Also visually confirm the start bowl does not launch marbles during its shuffle before authorizing another qualification attempt.
