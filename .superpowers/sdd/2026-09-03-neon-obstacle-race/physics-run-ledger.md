# Lucky Roll Obstacle Physics Qualification Ledger

Prepared before any 100-marble obstacle physics world steps.

- Resume source commit: `da5f4c1e96c14b718716077bd6ee86a77a2dde94`.
- Budget: `12/15` consumed. On 2026-09-03 the user explicitly authorized five additional 100-marble attempts after reviewing the failed first ten.
- Next command: none. Seeds 127, 131, and 149 remain held pending explicit direction after seed 109 failed.
- Rule: a numeric command may step only the ledger's next pending seed once. The guard rejects recorded, duplicate, unknown, out-of-order, or all-recorded seeds; do not start a sixth additional attempt.

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
| 107 | extra-recorded | FAIL — 0 finishers; 0 escapes; 78 end-of-observation stalls; elapsed `—`; unique finisher IDs true. |
| 109 | extra-recorded | FAIL — 1 finisher; 0 escapes; 80 end-of-observation stalls; last elapsed `54216.6666666645`; unique finisher IDs true. |
| 127 | held | Additional attempt authorized by the user; not stepped. |
| 131 | held | Additional attempt authorized by the user; not stepped. |
| 149 | held | Additional attempt authorized by the user; not stepped. |
