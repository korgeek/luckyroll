# Lucky Roll Obstacle Physics Qualification Ledger

Prepared before any 100-marble obstacle physics world steps.

- Validated source commit: `2b72419e38d0a6aecf4c1d35abd0aef237d3f132`
- Budget: `1/10` consumed; qualification stopped on the first failed row and must not be rerun without user authorization.
- Command: `RUN_OBSTACLE_QUALIFICATION=1 npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts`
- Rule: this command may run exactly once. A recorded row prevents another run.

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
