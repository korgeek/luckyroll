# Lucky Roll Obstacle Physics Qualification Ledger

Prepared before any 100-marble obstacle physics world steps.

- Resume source commit: `23d6548b31fb471d182e5674b62ffcbcca593cb1`
- Budget: `1/10` consumed; Sol authorized exactly the nine pending seeds below.
- Command: `RUN_OBSTACLE_QUALIFICATION=1 npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts`
- Rule: the resume command may run exactly once. It refuses seed 11, duplicates, unknown seeds, gaps, and an all-recorded ledger; assertions run only after all nine pending seeds report a row.

| Seed | State | Result |
| ---: | --- | --- |
| 11 | recorded | FAIL — 0 finishers; 40 escapes; 59 stalls; elapsed `—`; unique finisher IDs true |
| 23 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 37 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 41 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 53 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 67 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 71 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 83 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 97 | pending | Not stepped: command aborted after seed 11 assertion failure. |
| 101 | pending | Not stepped: command aborted after seed 11 assertion failure. |
