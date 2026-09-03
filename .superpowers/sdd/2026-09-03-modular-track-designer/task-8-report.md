# Task 8 Report — Focused Modular Physics

## RED

Command:

```text
npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/track/trackPhysics.test.ts
```

Raw result: the existing track suite passed (9 tests), while the new modular suite failed during import because `modularTrackPhysics.ts` did not exist.

## GREEN

Implemented:

- one fixed welded Rapier TriMesh using the exact modular geometry buffers, `FIX_INTERNAL_EDGES`, friction `0.24`, and restitution `0.08`;
- start bowl collider and deterministic non-overlapping bowl launch positions via the existing bowl helper;
- fixed bumper shafts/caps using canonical descriptor dimensions and restitution `0.28`;
- kinematic pinwheel capsule arms with a deterministic `2 / 60` radians step and reset/dispose lifecycle;
- swept forward-only booster crossing with one-consumption state, 20% gain capped at 18, and no side/up braking;
- representative seam probe contract for speeds 8, 18, and 42;
- generic `validateQualificationSeeds` export while preserving `validateObstacleQualificationSeeds` as an alias.

Focused verification:

```text
npx tsc -p tsconfig.app.json --noEmit
```

Raw result: exit 0.

```text
npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/track/trackPhysics.test.ts
```

Raw result: `Test Files 2 passed (2)`; `Tests 16 passed (16)`. Rapier emitted only its existing deprecated initialization-parameter warning.

## Deferred by controller ruling

No 16/100-marble 60-second completion run, ten-seed qualification, forced completion, ranking/guide force, or recovery force was implemented or run before first deploy. Physics remains natural and focused checks cover collider identity, containment/launcher spacing, device stepping, booster transitions, reset, disposal, and representative seams.

## Fix Round 1

RED additions covered compact booster-state strides and physical gate launch timing. The stride assertion initially failed because the helper assumed a hard-coded 40-cell layout; the gate assertion initially observed the next-step post-launch velocity rather than the exact velocity at opening.

GREEN verification:

```text
npx tsc -p tsconfig.app.json --noEmit
npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts
```

Raw result: TypeScript exit 0; `Test Files 1 passed (1)` and `Tests 8 passed (8)`, including all 9 representative seam cases (3 speeds × 3 lateral offsets), real welded/control Rapier stepping, exact gate launch component, stride-aware booster consumption, pinwheel pose/reset, and disposal.

The deferred 60-second/100-marble run remains unimplemented and unrun.

Fix-round physical changes also add the canonical gate cuboid with disabled/open transition, local-Y pinwheel rotation, full descriptor-sized bumper colliders/render instances, and cleared previous-position/booster state on reset.
