# Task 4 Report — Leader-to-Trailer Chase Camera

## Scope

- Added an identity-based focus director that follows the leader before 50% progress, walks backward by progress percentile from 50% to 75%, then latches the slowest live marble.
- Applied the directed pose from the selected marble's projected track sample: `7.5` tangent units ahead, `2.8` local-up units above, looking `0.45` local-up units above the marble.
- Preserved debug pause views and applied existing drag/zoom controls after the directed pose. Reset clears the selection hold and final-trailer latch.
- Reused scene and camera scratch objects; no race physics, geometry, device timing, finish/ranking, timeout, or result semantics changed.

## TDD evidence

The initial focused RED run failed as expected because `selectFocusRank`, `createRaceFocusDirector`, `writeTrackFollowShot`, and `writeControlledTrackFollowShot` did not yet exist: 6 failures in `cameraPlan.test.ts`; `MarbleRaceScene.test.ts` already passed 14 tests.

An additional focused RED regression test for numeric marble id `0` failed as expected: the final latch reselected id `5` instead of preserving id `0`. The lookup now distinguishes `undefined` from numeric zero.

Focused GREEN:

```text
npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.test.ts
Test Files  2 passed (2)
Tests       29 passed (29)
```

Non-race camera/scene/static subset passed. The explicitly named files totaled 145 passing tests across 12 files (camera plan/controls, scene, timing, track spec/sampler/geometry/validation/render, and obstacle layout/geometry/render). No physics-race, soak, or 100-marble end-to-end test was run.

```text
npm run build
tsc -b && vite build
✓ built

git diff --check
exit 0
```

## Budget and concerns

- Dynamic 100-marble/end-to-end validation budget: **0/10**; this task ran none.
- The existing Vite build continues to warn that `MarbleRaceScene` exceeds the configured 500 kB chunk advisory. It is pre-existing performance guidance, not a build failure.
- The existing Rapier initialization warning appears in `MarbleRaceScene.test.ts`; tests still pass.

## Review follow-up

- Final-trailer identity is now consulted before phase logic, so it survives leader regression below 75%, leader swaps, and live-count changes until that marble finishes. A finished latched marble immediately selects and latches the new slowest live marble.
- Entering the final phase respects an existing 1800ms target hold; the final trailer is latched only after that hold expires or the target finishes.
- The director accepts positional arguments, removing the per-frame selection request object. Scene code keeps a stable live-marble array for tick and timeout events and separately refreshes a reusable sorted camera-rank array.
- The director receives pause-excluded race elapsed time, including while a debug camera view is held.

Focused follow-up verification:

```text
npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.test.ts
Test Files  2 passed (2)
Tests       34 passed (34)
```

Final non-race verification:

```text
npm test -- --run [12 explicit camera/scene/timing/static-track files]
Test Files  12 passed (12)
Tests       150 passed (150)

npm run build
✓ built

git diff --check
exit 0
```
