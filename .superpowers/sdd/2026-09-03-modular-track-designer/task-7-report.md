# Task 7 report — canonical devices and procedural rendering

## RED

Command:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
```

Result: expected failure. The existing bowl tests passed (14 tests); the two new suites failed because `./moduleDevices` and `./modularTrackRender` did not exist.

## GREEN

Commands:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
npx tsc -p tsconfig.app.json --noEmit
```

Result: focused tests passed: 3 files, 19 tests. App TypeScript check passed with exit code 0.

## Files

- `src/react-app/game/modular/moduleDevices.ts` — canonical start, booster, bumper, pinwheel, and preview descriptors.
- `src/react-app/game/modular/moduleDevices.test.ts` — focused descriptor tests.
- `src/react-app/game/modular/modularTrackRender.ts` — shared-buffer board, shell, rims, start bowl/devices, pose updates, and idempotent disposal.
- `src/react-app/game/modular/modularTrackRender.test.ts` — buffer identity, render-only booster chevrons, pose, and disposal tests.
- `src/react-app/game/track/obstacleGeometry.ts` — public `buildWalledBowl` export; existing callers unchanged.

## Concerns

The full suite, browser QA, and modular physics qualification were intentionally not run per Task 7 scope and the current user rulings. Device descriptors use world-space sampled frames, so the later physics task can consume the same `axis`, `forward`, and center transforms as rendering.

## Fix round 1

RED command:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
```

Raw result: 2 suites failed as expected. The new assertions exposed nearest-sample booster placement (`expected 30 to be close to 28`), non-flat chevrons, and missing instanced pinwheel arms.

GREEN commands:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
npx tsc -p tsconfig.app.json --noEmit
```

Raw result: `Test Files 3 passed (3)`, `Tests 19 passed (19)`; TypeScript exited 0. The fix interpolates exact device frames, derives booster `[+8,+12]` from the first sampled row, uses descriptor-sized bumper instances/caps, rounded instanced pinwheel arms, descriptor-oriented start devices, flat in-band chevrons, and preserved rim lengths.

## Fix round 2

RED command:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
```

Raw result: the new render assertions failed on the prior plane chevron type and zero-device fixture; the implementation changes were then exercised by the corrected focused fixture.

GREEN commands:

```text
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/track/obstacleGeometry.test.ts
npx tsc -p tsconfig.app.json --noEmit
```

Raw result: `Test Files 3 passed (3)`, `Tests 20 passed (20)`; TypeScript exited 0. Bumper capsules now use total descriptor length, start gate/agitator descriptors carry oriented bases and dimensions, chevrons are shared flat triangle geometry at 25/50/75% of the trigger band, and zero-device paths allocate no detached device geometry.
