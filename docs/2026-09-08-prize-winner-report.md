# Prize, winner, and friction report

## Change

- Prize Pool keeps a digit string while editing, renders commas, restores its digit-position caret after React updates, and handles Backspace/Delete adjacent to a separator.
- The winner hero now places a large, shaded, accessible marble using the ranked winner's color and symbol before the wrapping winner name.
- The modular welded track collider now uses friction `0.12`; marble friction and the Min combine rule are unchanged. The optional 300-marble qualification retains the same 1/60 physics steps, runs through 240 simulation seconds, and evaluates the 120-second race clock as 1x until the 225th finish and 2x afterward.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- src/react-app/game/modular/modularTrackPhysics.test.ts -t "creates one welded track mesh"` before calibration | RED: native track collider reported `0.05000000074505806` instead of `0.12` |
| Same focused collider command after calibration | GREEN: 1 passed, 43 skipped |
| Initial expanded UI interaction test | RED: test interaction lacked an input target, then its replacement fixture selected `,3` rather than `34`; both test-fixture defects were corrected before the product GREEN run |
| UI review regressions before fix | RED: a comma-only native edit left the caret at the end (`6`, expected `2`); the winner marble had no `img` role |
| `npm test -- src/react-app/components/SetupScreen.test.tsx src/react-app/components/ResultsScreen.test.tsx` | GREEN: 13 passed |
| `npm test -- src/react-app/game/modular/modularTrackPhysics.test.ts -t "yields to queued timers"` before the runner change | RED: queued timer was not serviced during a 3-second validation race |
| Same focused timer command after the runner change | GREEN: 1 passed, 44 skipped |
| `npm test -- src/react-app/game/modular/modularTrackPhysics.test.ts -t "keeps the obstacle-free baseline throughput"` | RED: 0/100 finished; no escape, stall, non-finite, or booster-cap failure was recorded |

The focused physics and Results tests print the existing Rapier deprecated-initialization warning without failures.

## Concern

The existing submit contract converts the digit string to `Number`, so values beyond JavaScript's safe integer range can lose precision only on submit; the input display itself preserves all typed digits. Before adding the RUSH-clock qualification, the 120-simulation-second diagnostic at friction `0.12` finished 299/300: marble 209 was still live, the last completed finish was 114,783 ms, and escapes/stalls/non-finite values/booster-cap violations were all empty. A later 240-second validation completed all 300 (RUSH start 89,283 ms; last finish 118,133 ms; effective clock 103,708 ms); this does not establish that the duration extension caused the different chaotic trajectory. The obstacle-free, booster-removed baseline currently finishes 0/100 at friction `0.12` with no recorded fault, so friction remains a product decision rather than a tuning change here.
