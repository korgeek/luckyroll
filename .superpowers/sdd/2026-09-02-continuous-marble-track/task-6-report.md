# Task 6 report: render and collide one continuous U-channel

## Status

COMPLETE. The `feat: render and collide one continuous U-channel` commit is local on `feature/continuous-marble-track`; no merge or push was performed. The browser scene now constructs one validated `BuiltTrack`, renders its U-channel from the original typed buffers, and creates the Rapier trimesh from that same canonical geometry.

## TDD evidence

1. `trackRender.test.ts` was added before `trackRender.ts`.
   - RED: `npm test -- --run src/react-app/game/track/trackRender.test.ts` failed because `./trackRender` did not exist.
   - GREEN: the renderer test suite passed with three tests: exact position/index buffer identity, one instanced support mesh, and debug helpers disabled by default.
2. `MarbleRaceScene.test.ts` was added before the migration seams.
   - RED: the test failed because `createSceneTrackResources` did not exist.
   - GREEN: the scene suite proves canonical render-buffer identity, projector-only body progress, and the combined projected-progress plus shared finish-volume gate.
3. The collider identity seam was added test-first.
   - RED: the new test failed because `attachSceneTrackCollider` did not exist.
   - GREEN: it proves the exact `BuiltTrack.geometry` consumed by the render mesh is forwarded to the scene collider creator.

## Implementation

- `createTrackRenderGroup()` creates one `continuous-u-channel` mesh whose position and index attributes reference the exact validated `Float32Array` and `Uint32Array`; it adds dark rim lines and one decorative, visual-only `THREE.InstancedMesh` of supports at 15-sample intervals.
- `createSceneTrackResources()` calls `buildValidatedTrack()` once at scene creation. The scene uses `createTrackCollider()`, `launchPositionsFor()`, and `createMarbleBodies()` from Task 5, preserving physical launch clearance and non-overlap guarantees.
- Per-frame progress comes exclusively from `projectToTrack()`. Finish requires projected progress of at least `0.995` and `insideFinishVolume()`.
- The legacy guide force, stall impulse, respawn, flat deck, segment colliders, and box rails were removed. Touch/mouse camera controls and renderer quality caps remain unchanged.
- Track, support, rim, debug, and marble geometries/materials are disposed before groups are cleared or the scene is destroyed. The validated typed arrays are never mutated or detached.

## Legacy deletion evidence

After the migration, `rg -n "trackLayout|addContinuousDeck|addTrackSegment|renderContinuousCourse|createRailOffsets|createSafetyRail|getDownhillGuide" src` returned no matches. `trackLayout.ts` and `trackLayout.test.ts` were then deleted.

## Sol review fixes

The browser previously initialized a local Rapier binding while the Task 5 collider/body helpers read a separate private binding in `trackPhysics.ts`. A fresh browser start could therefore reach `getRapier()` before that private state was set.

- `initializeTrackPhysics()` and `createTrackPhysicsWorld()` are now exported by `trackPhysics.ts`; the headless harness and browser scene both use them. The browser no longer imports or initializes a separate Rapier module.
- The scene’s real-physics regression calls `initializeScenePhysics()`, then creates a shared world, trimesh collider, and physical marble body. It passes without relying on the headless harness having run first.
- `createSceneStartLifecycle()` owns queued starts. Reset and dispose clear a queued request; initialization failure is caught, reported through `console.error`, and leaves no pending request.
- `evaluateRaceBody()` computes the projection once and reuses it for progress and finish detection. Its regression injects a counting projector and observes exactly one call.

The review regressions were written first. RED observed missing scene initializer/lifecycle exports (four failures), followed by GREEN with all real-initialization and lifecycle tests passing. The one-projection regression then failed at zero injected projector calls before its GREEN implementation.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- --run src/react-app/game/MarbleRaceScene.test.ts src/react-app/game/track/trackRender.test.ts` | PASS — 2 files, 12 tests. |
| `npm test -- --run src/react-app/game/track --reporter=dot` | PASS — 12 files, 65 tests in 106.92 s. |
| `npm test -- --run --reporter=dot` | PASS — 19 files, 83 tests in 116.14 s. |
| `npm run build` | PASS — TypeScript and production Vite build. Vite retained its pre-existing large-chunk advisory. |

The physics tests continue to emit Rapier's pre-existing deprecated-initialization stderr, with no test failures.
