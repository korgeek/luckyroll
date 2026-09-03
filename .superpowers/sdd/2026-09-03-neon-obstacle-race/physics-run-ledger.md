# Lucky Roll Obstacle Physics Qualification Ledger

Prepared before any 100-marble obstacle physics world steps.

- Resume source commit: `23d6548b31fb471d182e5674b62ffcbcca593cb1`
- Budget: `10/10` consumed. The resumed command printed eight completed rows; seed 101 produced no row before the process exited and is conservatively treated as consumed.
- Command: `RUN_OBSTACLE_QUALIFICATION=1 npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts`
- Rule: the resume command may run exactly once. It refuses seed 11, duplicates, unknown seeds, gaps, and an all-recorded ledger; assertions run only after all nine pending seeds report a row.

| Seed | State | Result |
| ---: | --- | --- |
| 11 | recorded | FAIL — 0 finishers; 40 escapes; 59 stalls; elapsed `—`; unique finisher IDs true |
| 23 | recorded | FAIL — 0 finishers; 22 escapes; 78 stalls; elapsed `—`; unique finisher IDs true |
| 37 | recorded | FAIL — 0 finishers; 26 escapes; 73 stalls; elapsed `—`; unique finisher IDs true |
| 41 | recorded | FAIL — 0 finishers; 25 escapes; 74 stalls; elapsed `—`; unique finisher IDs true |
| 53 | recorded | FAIL — 1 finisher; 21 escapes; 75 stalls; last elapsed `53183.33333333132`; unique finisher IDs true |
| 67 | recorded | FAIL — 1 finisher; 21 escapes; 76 stalls; last elapsed `51983.333333331495`; unique finisher IDs true |
| 71 | recorded | FAIL — 2 finishers; 26 escapes; 71 stalls; last elapsed `51883.33333333151`; unique finisher IDs true |
| 83 | recorded | FAIL — 1 finisher; 31 escapes; 65 stalls; last elapsed `52933.33333333136`; unique finisher IDs true |
| 97 | recorded | FAIL — 0 finishers; 24 escapes; 73 stalls; elapsed `—`; unique finisher IDs true |
| 101 | recorded | NO ROW — process exited after seed 97; treated as consumed to prevent an unauthorized 11th attempt. |
