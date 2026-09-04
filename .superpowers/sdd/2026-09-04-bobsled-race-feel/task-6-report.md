# Task 6 Report

## Status

The initial documentation and controller-independent verification completed without a failure. Subsequent controller-owned mobile acceptance exposed a race-speed defect; the diagnosis and fix are appended below.

## Focused integrated physics

- Command: `npm test -- --run src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackBuild.test.ts src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/game/raceCourse.test.ts`
- Result: exit 0; 9 test files passed; 84 tests passed; 0 failed; 0 skipped.
- Warnings: 2 Rapier deprecated-initialization stderr notices, one in `modularTrackPhysics.test.ts` and one in `raceCourse.test.ts`.
- Environment note: the first sandboxed launch exited 1 before test discovery because esbuild could not read linked-worktree metadata. The identical command passed after scoped sandbox approval; this was not a product or test failure.

## README

- Updated `README.md` only.
- Documented the unchanged builder/browser-storage/Base64URL share formats, route-relative 7-degree descent, automatic 24-degree interior curve bank with flat seamless landings, physical start pusher, minimum 18-track-unit/second forward booster exit speed, and Bird View orientation with start at top and finish at bottom.
- Added no section, dependency, implementation code, or unrelated documentation.

## Full verification

- `npm test -- --run`: exit 0; 42 test files passed; 356 tests passed; 2 intentionally skipped qualification tests; 358 total tests; 0 failed.
- Qualification skips: exactly 1 in `obstaclePhysics.validation.test.ts` and 1 in `modularTrackPhysics.validation.test.ts`. Neither environment-gated official multi-seed qualification suite was enabled or run.
- Full-test warnings: 10 Rapier deprecated-initialization stderr notices; no test failures.
- `npm run lint`: exit 0; 0 errors; 0 warnings.
- `npm run check`: exit 0. TypeScript passed. Vite built the Lucky Roll worker (21 modules, 179 ms) and client (75 modules, 3.14 s). Wrangler 4.88.0 read 7 asset files, reported 19.08 KiB upload / 4.67 KiB gzip, found no bindings, and completed `--dry-run` successfully.
- Build warnings: exactly 1 Vite chunk-size warning for chunks over 500 kB and 1 Wrangler proxy-environment warning. Vite also printed 1 proxy-environment informational line before building.
- `git diff --check`: exit 0; 0 whitespace errors. Git printed 1 LF-to-CRLF working-copy warning for `README.md`.

## Skipped controller-owned work

- Mobile in-app browser acceptance at approximately 326×710 was not performed.
- Final whole-branch review, main integration, worktree cleanup, and push were not performed.

## Files changed

- `README.md` — required bobsled behavior documentation.
- `.superpowers/sdd/2026-09-04-bobsled-race-feel/task-6-report.md` — this ignored execution report; not part of the documentation commit.

## Concerns

- Controller-owned mobile acceptance and final review remain required before delivery.
- The accepted Vite chunk-size warning, Rapier deprecation notices, proxy notice, and local line-ending warning remain non-blocking.

## Browser acceptance fix round 1

### Browser failure context

At the 326×710 production viewport, Default Track launched all 100 marbles and Bird View orientation passed. A saved clone named `Mobile Test Track` was used by both Test Play and normal START RACE and remained selected after reload. At 60.0 seconds the HUD still showed DONE 0/100 and the timeout dialog reported all 100 marbles remaining.

### Seed-23 reproduction and diagnosis

The existing `runModularValidationRace` was run only with `createValidTrackDesign()`, seed 23, 100 marbles, and 60 seconds. Neither environment-gated official multi-seed qualification suite was enabled.

- Baseline: 0 finishers, 0 stalls, 0 escapes, 0 non-finite results, and 0 booster-cap violations.
- The 697.4948818856033-unit route had progress min/median/max 0.13847/0.83399/0.96459 at 60 seconds and forward speed min/median/max 0/10.098/13.709.
- Remaining-marble cell/module distribution at 60 seconds: cell 9 curve 1; cell 25 curve 26; cell 26 straight 20; cell 27 funnel 28; cell 28 straight 7; cell 30 straight 14; cell 35 curve 4.
- The baseline validator recorded no stalls, so earliest/latest stall time and stall sample/cell/module distributions were all empty. One body remained route-stationary near cell 9 while small contact jitter kept resetting the validator's strict three-second linear-speed stall timer.
- Maximum observed funnel occupancy was cell 2: 70, cell 7: 73, cell 12: 50, cell 17: 47, cell 22: 36, cell 27: 28.
- Average speed/forward speed by module observation was straight 10.932/10.728, curve 8.815/7.715, and funnel 11.316/11.158 track units per second.
- All 204 sampled curve interiors with bank magnitude above 0.4 radians had gravity's lateral component aligned with signed curvature, proving the physical bank points inward.
- A marble center placed on the final sample projected to progress 1 and passed `insideFinishVolume`. The same seed extended diagnostically produced the first natural finish at 69.067 seconds and 7 finishers by 70 seconds, so finish detection was reachable but too late.

The single root-cause hypothesis was that the shared 0.24 contact friction on the welded modular channel accumulated too much loss across the long 7-degree route, especially through curves and 100-marble congestion. Isolated same-seed candidates confirmed it: setting either linear damping or angular damping alone to zero still produced 0 finishers; lowering contact friction moved the first finish into the 60-second budget.

Temporary sequential-world friction sweep:

| Friction | Finishers | First finish | Escapes | Stalls |
| ---: | ---: | ---: | ---: | ---: |
| 0.03 | 77 | 47.417 s | 22 | 0 |
| 0.035 | 97 | 48.867 s | 1 | 1 |
| 0.04 | 95 | 49.050 s | 2 | 1 |
| 0.045 | 94 | 49.833 s | 0 | 1 |
| 0.05 | 66 | 51.100 s | 0 | 0 |

The sweep was useful for coefficient selection but its fifth reused world did not predict a fresh runner's exact late-failure identities. Fresh direct 0.05 runs consistently met the speed thresholds but reported one final-sample escape and two late stalls. No diagnostic test, logging, or script remains in the working tree.

### RED, rulings, and fix

The permanent test first required at least 90 finishers, first finish by 55 seconds, and zero failures. Before production changed, RED failed as expected with `expected 0 to be greater than or equal to 90`.

The first ruling selected dedicated modular track friction 0.04. It met the speed assertions but a fresh run reported two final-sample escapes and one late stall. A nearby sweep showed no single coefficient met both the 90-finisher and zero-late-failure requirements.

The second ruling selected 0.05 with at least 60 finishers and zero failures. A fresh direct runner corrected the reused-world sweep result: it met the speed assertions but consistently reported one final-sample escape and two late stalls.

The final ruling retained 0.05 and aligned acceptance with the existing remaining-marble timeout/restart design: at least 60 finishers by 60 seconds, first finish no later than 55 seconds, zero non-finite and booster-cap violations, and at most five combined late escapes/stalls. The existing 2.5-second start-launch test remains unchanged and still requires all 100 marbles past the gate with zero start escape or non-finite state.

Production now applies `TRACK_FRICTION = 0.05` only to the welded modular trimesh and uses Rapier's minimum combine rule so shared marble friction remains 0.24. Gate, pusher, bumper, and pinwheel friction remains 0.24. Route grade, pusher timing/travel, timeout, layout, finish logic, booster behavior, storage/share formats, and the prohibition on hidden/recovery forces are unchanged. README now calls the channel low-friction.

### GREEN and verification

- Focused acceptance, fresh process run 1: exit 0; 1 passed, 19 filtered skips; 10.341 s test time.
- Focused acceptance, fresh process run 2: exit 0; 1 passed, 19 filtered skips; 10.338 s test time.
- Exact nine-file integrated command: exit 0; 9 files passed; 85 tests passed; 0 failed; 0 skipped. Two Rapier deprecated-initialization notices were emitted.
- `npm test -- --run`: exit 0; 42 files passed; 357 tests passed; 2 intentional qualification skips; 359 total; 0 failed. Ten Rapier deprecated-initialization notices were emitted, including the new acceptance run.
- `npm run lint`: exit 0; 0 errors; 0 warnings.
- `npm run check`: exit 0. TypeScript passed; Vite built the worker (21 modules, 166 ms) and client (75 modules, 2.89 s); Wrangler 4.88.0 read 7 assets, reported 19.08 KiB upload / 4.67 KiB gzip, and completed `--dry-run` successfully.
- Build warnings: exactly 1 accepted Vite chunk-size warning and 1 Wrangler proxy-environment warning; Vite also printed 1 proxy informational line.
- `git diff --check`: exit 0; 0 whitespace errors and 3 LF-to-CRLF working-copy warnings for the three changed tracked files.

### Fix files

- `README.md`
- `src/react-app/game/modular/modularTrackPhysics.ts`
- `src/react-app/game/modular/modularTrackPhysics.test.ts`

### Remaining concern

Controller-owned mobile acceptance should be repeated against the fixed production build. The final acceptance intentionally leaves the timeout/restart flow meaningful for remaining marbles and permits at most five late escape/stall results for the approved deterministic run.

Commit: `b7610fa` (`fix: speed up bobsled channel`).
