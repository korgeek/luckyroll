# Pack camera and RUSH report

## Change

- Replaced rank switching and feature cutaway state with a route-distance crowd director. It follows the densest live cluster, tracks unique run passages, and permits DNF members without double-counting them toward the 80% run handoff.
- The follow shot now uses a route anchor behind the virtual focus, looks forward along the tangent, and retains the final live-pack pose when the field empties.
- RUSH is now a once-per-run timing mode at `live > 0 && live <= original * 0.25`; it preserves the original field size across a remaining-marble restart. Collider mutation, lifting, and rendered scale growth were removed.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/game/MarbleRaceScene.test.ts` | 80 passed |
| `npx tsc --noEmit` | passed |

The scene-unit run prints the pre-existing Rapier deprecated-initialization warning; it has no test failure.

## Concern

Modular route samples carry optional `kind` metadata, so production groups all adjacent non-curve modules (including wheels, bumpers, and waves) into a straight run and treats a curve as a fast handoff. Legacy samples fall back to tangent continuity. Browser smoke should still validate the broadcast feel on the production route.
