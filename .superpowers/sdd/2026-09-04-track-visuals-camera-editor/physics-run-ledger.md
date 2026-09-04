# Lucky Roll Modular Track Physics Qualification Ledger

- Source commit: `65e56c72ff40dbc4a0681dc724ab17cea2dbe736`
- Budget: 10/10 consumed
- Command: `RUN_MODULAR_TRACK_QUALIFICATION=1 npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts`
- Rule: a seed is consumed once its 100-marble world begins stepping; never rerun without user approval.

| Seed | State | Finishers | Escapes | Stalls | Non-finite | Cap violations | Result |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 11 | recorded | 0 | 10 | 88 | 0 | 0 | FAIL |
| 23 | recorded | 0 | 4 | 95 | 0 | 0 | FAIL |
| 37 | recorded | 0 | 3 | 97 | 0 | 0 | FAIL |
| 41 | recorded | 0 | 3 | 96 | 0 | 0 | FAIL |
| 53 | recorded | 0 | 4 | 95 | 0 | 0 | FAIL |
| 67 | recorded | 0 | 4 | 94 | 0 | 0 | FAIL |
| 71 | recorded | 0 | 4 | 95 | 0 | 0 | FAIL |
| 83 | recorded | 0 | 3 | 96 | 0 | 0 | FAIL |
| 97 | recorded | 0 | 4 | 95 | 0 | 0 | FAIL |
| 101 | recorded | 0 | 4 | 96 | 0 | 0 | FAIL |
