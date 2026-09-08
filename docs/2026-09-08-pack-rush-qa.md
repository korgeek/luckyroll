# Pack camera, rank-weighted RUSH, and UI release

## Latest approved release revision

This section supersedes the earlier 25%/2× and friction 0.12 scope below; earlier measurements are retained as historical evidence, not current qualification.

- Explicit requested track friction: **0.07** (the actual prior Git baseline was 0.05).
- RUSH threshold: 50% of original starters remain live; size stays unchanged.
- Replace uniform 2× simulation with positive forward pulses every active-play second, reranking live marbles each time. Reverse first gets +3 units/s, the frontmost gets +0.5, linearly weighted between them. Limit added speed at the existing 42 units/s ceiling; never reduce velocity already above that ceiling.
- Disable manual BOOST in both UI and simulation during RUSH. Keep track booster modules for pinball recovery.
- Run 100-marble native physics qualification; do not run optional 300-marble qualification for this change, per user direction.
- Preserve the pending camera, winner-color and Prize Pool improvements. Verify, commit, push and confirm the existing Git-triggered Cloudflare deployment.

Current verification: passed. Commit/push and Git-triggered deployment follow this pre-release record.

- Friction 0.07 obstacle-free 100-marble regression passed: 89 finished within 60 simulated seconds, first at 50,950ms; no escapes, stalls, non-finite states or booster cap violations. Existing minimum 60 finishers and first finish by 55s assertions are unchanged. Focused run: 1 pass / 44 unrelated skips, exit 0.
- Browser default 100 race with rank-weighted RUSH: at 78.3s DONE 96 / OUT 0; BOOST disabled with accessible name `Boost unavailable during RUSH`, visible LOCKED / RUSH and no READY prompt. At 86.4s DONE 98 / OUT 0, camera looks forward at the last two normal-sized marbles and finish line. Pause/resume works, followed by full results with marble #72 / Player 2 as last finisher. Helper extraction and final checks follow this smoke test.
- Independent RUSH review caught same-sample rank quantization: `projectToTrack.progress` is a nearest-sample index fraction, not exact forward distance. Shared pulse logic now reuses the HUD's `alongRouteDistance` on actual positions. Same-sample, reverse-ID regression observed RED then GREEN; Scene and native validation use the same helper. Re-review found no further blocker.
- Final source `npm run check` passed (TypeScript, production build, Wrangler dry-run), and `npm run lint` passed. Existing large-chunk/proxy warnings remain. Full regression remains in progress.
- Final regression `npm test -- --run -t "^(?!.*(?:300|physically pushes all 200))"`: exit 0; 47 files passed, 461 tests passed, 8 skipped, 439.79 seconds; no unhandled errors. Skips cover the explicitly excluded larger physical checks and existing optional qualifications. The 100-marble native race uses actual shared RUSH pulses, requires all 100 by 120 simulated seconds and zero escapes/stalls/non-finite/cap faults, and passed. Unboosted obstacle-free baseline passed again with 85 finishers by 60s, first at 52,400ms and zero faults; trajectories are not claimed identical across isolated and integrated runs.
- Final helper/rank-fix browser rerun reached full results (Player 2, marble #57). Browser logs contain no errors, only the existing Rapier initialization warning and development informational messages. Dedicated QA tabs closed; saved tracks untouched.
- Minimal implementation reused existing route-distance and fixed-step logic, with one shared RUSH helper and no added dependencies. Independent review cleared the final correction; `git diff --check` is clean.

Baseline: `b1b6f2424470f9bc9299b98fa010eb82b6fe9286` (pushed and deployed).

## Approved scope

- RUSH starts once per race while `0 < live <= originalCount * 0.25`. Keep physical and rendered marble size unchanged; keep existing 2x simulation speed and RUSH effects. Reset and replay must retain the correct starting-count denominator.
- Auto camera looks forward from behind the travelling pack, not a rank-selected leader/trailer. Group contiguous straight modules, slowly follow the dense live pack until 80% of the starting field passes, move faster through corners, and ease into the next straight. Wheel and bumper use the same flow, not separate fixed shots. Final live pack stays in view through the finish. Preserve manual, Bird View, pause, reduced motion, custom tracks and wall clearance.
- Show a large marble in the winner's actual color immediately before the winner's name.
- Prize Pool: live thousands separators for typing, deletion and paste, sensible caret editing, empty input stays empty, numeric domain contract preserved.
- Side-chat confirmed track friction changes from 0.05 to 0.12 only. Keep marble friction 0.24, Min combination, damping, restitution and boosters unchanged. Rotation mismatch is a hypothesis, not an established diagnosis.
- Rank arrows are deferred: TOP10 versus RUSH-only TOP3 was not confirmed.

## Work and verification ledger

| Task | Owned scope | Required checks | Status |
| --- | --- | --- | --- |
| Camera and RUSH | cameraPlan, MarbleRaceScene and tests | quarter-count boundaries, unchanged radius/render, once/reset, 80% unique passage, DNF, forward direction, continuity, real route framing | implemented; focused 80 pass; independent re-review clear |
| UI and friction | SetupScreen, ResultsScreen, CSS, modular physics and tests | comma typing/paste/delete/caret, prize contract, winner color/phone layout, native friction consumer | implemented; focused UI 12 pass; friction consumer passes; review running |
| Integration | documents and existing validation tools | full regression suite, lint, build and Wrangler dry-run, default finish/escape behavior, desktop/portrait browser QA | pending |
| Release | exact changed files only | commit, push origin/main, remote SHA and Cloudflare build success | pending |

Camera and RUSH share Scene state and therefore stay with one implementer. UI/friction do not change camera interfaces. `.codex-remote-attachments/` is outside the release payload.

## Early independent review targets

- Densest group: an isolated trailer at distance 1 must not beat the three-marble group at 30/31/32. Similar groups must not cause focus snaps.
- Passage: 79 unique crossed IDs plus a subsequent DNF of one of those IDs is still 79 resolved identities. Rebounds must not increase the count twice; never-crossed DNFs must not deadlock progress.
- Actual default route: group the long straights, traverse complete corners without waiting at their sample subdivisions, and inspect high-wall occlusion at entry/apex/exit after camera smoothing.
- Final run: follow 25/10/2/1 live marbles through booster, pinball, straight and finish, then hold the final camera pose rather than jumping to overview.
- Remaining-only restart retains the original full-race RUSH denominator because App retains the original session and finished list. The camera's new route-pass accounting uses the relaunched cohort.

## Browser observations and open qualification

- Dedicated QA tabs only; user's tab and saved tracks untouched.
- Portrait 360x800: forward pack visible at 8.7 and 13.2 seconds around the curved/straight transitions; no solid-wall obstruction. Landscape 1280x720 at 6.0 seconds showed the main pack and route ahead.
- New-friction 100-marble browser race: RUSH visible with 23 live / 77 done at 78.4 seconds, then two live / 98 done at 84.3 seconds, OUT 0; completed shortly afterward with full results and celebration. Remaining marbles stay normal-sized. Final view stays behind the surviving pack toward the finish.
- Winner hero: pink marble before the 16-character winner name, wrapped cleanly on two lines at 360px. Prize Pool 1,234,567 retained in results. Input preserves the displayed digits of 9,007,199,254,740,993, with the existing Number submission limitation recorded in the UI report.
- Native 300-marble qualification, seed 23, friction 0.12: first run finished 299/300 within 120 simulated seconds (214 seconds wall time), failing the existing assertion. Diagnostic rerun is required to distinguish late arrival from stall/escape; no further physics tuning has been made.
- Diagnostic rerun reproduced 299/300, missing marble 209, last recorded finish 114,783 simulated ms. Escapes, stalls, non-finite states and booster-cap violations are all empty.
- The native runner does not apply the browser's RUSH wall-clock acceleration. The qualification now runs up to 240 simulated seconds and still requires all 300 and zero fault records, plus `t225 + (tLast - t225) / 2 <= 120,000ms`. This is the ideal-cadence RUSH-adjusted simulation budget, not measured device wall time. Independent Astra review verified the fixed-step trajectory reasoning; slow devices can still time out because Scene caps frame delta at 33ms. The unaccelerated 299/300 evidence is retained above.
- UI re-review resolved comma-only mobile/native input caret restoration and added an explicit image role to the winner marble. Focused UI 13/13 passes. Final integration review found no further blockers, conditional on full regression and release checks.
- Landscape 1024x768 results: winner marble is 80px, actual pink `rgb(255,79,143)`, 16-character name wraps without horizontal overflow. Browser error log is empty; only the existing Rapier initialization warning was present. QA tabs closed and temporary viewport reset.

No final completion or deployment is claimed yet.

## Full qualification findings (release gate)

- Integrated 300-marble qualification passed: all 300; RUSH start 89,283 simulated ms, last finish 118,133 simulated ms, marble 209 at 89,883 simulated ms; modeled RUSH clock 103,708 ms; all fault lists empty. This differs from the standalone 299/300 observations; do not attribute the changed trajectory solely to the time conversion or claim repeatable cross-run timing.
- The obstacle-free baseline regressed at friction 0.12: zero finishers within 60 simulated seconds, against the existing minimum of 60. The mixed-device 100-marble completion test passed. The full suite is therefore not release-green even though the demo track and 300-marble run complete.
- User choice requested before release: retain the prior 0.05 friction and ship the other approved changes, or authorize additional physics tuning to retain 0.12 without sacrificing custom-track throughput. No further tuning or push performed while this decision is pending.
- Full run with the optional 300 qualification: 45 files pass / one file fails; 459 tests pass, one fails, two optional skips. Duration 822.61 seconds. The only assertion failure is obstacle-free throughput. Vitest additionally reported `onTaskUpdate` RPC timeout during long synchronous validation work; periodic event-loop yielding in the headless validation helper is being addressed before another full run.
- `npm run check` passed (TypeScript, production build and Wrangler dry-run); `npm run lint` passed. Existing large-chunk/proxy and Rapier initialization warnings remain. These do not override the failed physics release gate.
- Follow-up diagnostic: obstacle-free 60-second fixture has 0 finishers and 100 still unfinished, with no recorded escapes/stalls/non-finite/cap errors. This is a throughput regression, not evidence that all marbles were physically stationary. The validation helper now yields its event loop every 120 steps; focused timer-servicing regression was observed RED then GREEN, without changing physics stepping or production Scene timing. Full regression must be rerun after the user resolves the friction choice.
