# Lucky Roll Modular Track Physics Qualification Ledger

- Source commit: `899d3bb`
- Budget: 10/10 consumed
- Command: `RUN_MODULAR_TRACK_QUALIFICATION=1 npm test -- --run src/react-app/game/modular/modularTrackPhysics.validation.test.ts`
- Rule: a seed is consumed once its 100-marble world begins stepping; never rerun without user approval.

| Seed | State | Finishers | Escapes | Stalls | Non-finite | Cap violations | Result |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 11 | recorded | 0 | 15 | 84 | 0 | 0 | FAIL |
| 23 | recorded | 0 | 17 | 82 | 0 | 0 | FAIL |
| 37 | recorded | 0 | 15 | 85 | 0 | 0 | FAIL |
| 41 | recorded | 0 | 16 | 84 | 0 | 0 | FAIL |
| 53 | recorded | 0 | 17 | 83 | 0 | 0 | FAIL |
| 67 | recorded | 0 | 14 | 86 | 0 | 0 | FAIL |
| 71 | recorded | 0 | 15 | 85 | 0 | 0 | FAIL |
| 83 | recorded | 0 | 15 | 85 | 0 | 0 | FAIL |
| 97 | recorded | 0 | 16 | 84 | 0 | 0 | FAIL |
| 101 | recorded | 0 | 15 | 84 | 0 | 0 | FAIL |
