# Changes after release 837bea5

## Approved scope

- Main Menu: 100 / 200 / 300 selector immediately above START RACE, default100. Allocate evenly across participants; preserve selection on return and replay. Quick play remains100.
- Start:100 marbles per layer, maximum3 layers. Deterministic non-overlapping placement in the same start footprint, local-up stacking, real gravity collapse after GO. Shuffle marble assignment across the complete layered slot pool so participant order does not determine layer. Gate and pusher must contain the top layer. No saved-track schema or channel-port change.
- Wheel and pinball broadcast: establish from top, ease inward to a closer elevated oblique shot, return to top after50% unique passage. Wheel releases to auto after more than80%; pinball after all non-DNF traffic clears. Manual/Bird/reduced-motion/debug overrides remain.
- RUSH: activate once per run when1–10 unfinished, non-DNF marbles remain, and keep the visual active until race end. Show slowly pulsing RUSH!, accelerator-style bar and thin speed lines; reduced-motion uses a static treatment. Enlarge remaining rendered spheres and actual colliders to1.5x (latest request replaces1.2x), and run simulation at2x with unchanged1/60-second physics steps. This accelerates motion without an instantaneous doubled velocity impulse. BOOST remains a five-active-second recharge and HUD race time remains real active time.
- Keep six round pinball posts in3/2/1 formation; adjust spacing only as needed to pass enlarged-marble physical probes without jamming.
- Preparation/countdown/pause/replay/remaining-restart must reset or suspend these features consistently.

## Implementation boundaries

- Sol: modular layered launcher, capacities, containment and physical checks.
- Terra: camera director/shot, then Scene/App count and RUSH integration.
- Astra: requirements, interface review, regression and browser QA.
- Reuse existing instancing, sounds, camera easing and fixed-step loop; no new dependencies.

## Required evidence

-100/200/300 allocations and replay selection; unsupported counts rejected at launch boundaries.
- Layer occupancy, all-pair initial separation, gate containment and physical exit for300.
- Booster consumption/return recharge works above index99 and resets.
- Camera top/inward/top sequence, unique passage boundaries for100/200/300, reset and manual overrides, portrait/desktop clipping.
- RUSH11→10 and skipped threshold, no trigger at0, exactly-once sizing, paused behavior, reset/replay, five-second BOOST, real collision-size parity and finite/no-loss enlarged-marble course probes.
- Frozen full suite, build, lint, and actual browser checks before release claims. Physical Android/Mac gesture and hardware performance remain separate acceptance checks.

## Status

Implementation and final verification are complete; this snapshot is ready for the requested Git-triggered release. The subsequent request for a more aggressive feature camera is explicitly deferred until after this deployment and is not included here.

## Verification evidence

- Launcher: 100/200/300 deterministic, pairwise-separated slots; at most 100 per layer; legacy 100 seed order preserved; shuffled assignment spans all layers. All three fields physically clear the gate within 2.5 simulated seconds after opening, with no early crossing or loss.
- Native Rapier: ten actual radius-0.51 marbles clear the pinball packet probe within 20 simulated seconds; enlarged overlapping remaining-restart and enlarged funnel probes pass. Existing pinball spacing was retained. These bounded probes do not prove every random/custom course is jam-free.
- Opt-in full mixed-device 300-marble validation, seed 23: 300 finish within 120 simulated seconds; zero escapes, stalls, non-finite states, or booster-cap violations. Test wall time 170.5 seconds. Reproduce with `RUN_MODULAR_300_VALIDATION=1` and the named 300-marble test in `modularTrackPhysics.test.ts`. This validator checks normal-size course throughput; enlarged RUSH uses separate native probes and Scene integration checks.
- Scene/App regression: 11 remaining does not trigger RUSH; 11→10 triggers once; all-DNF zero does not trigger; restart restores normal size. Selection survives menu return and replay starts 300. Actual collider growth and five-second BOOST step accounting are covered.
- Browser desktop 1280×720, first 300-marble run: 272 finished, 28 remained at the existing 120-second wall-clock limit, OUT 0. Observed roughly 17–19 FPS while the full field was active, rising to 39 FPS after most finished. The existing 33ms frame-delta cap slows simulation under low FPS, so native simulated-time completion does not imply wall-clock completion on every device. A conditional 200/300 performance note recommends 100 for smoother play; no universal 300-marble FPS claim.
- Browser 360×800: 100/200/300 controls remain above START, selection is retained after menu return, and no horizontal overflow. Preparation countdown holds the field; portrait leaderboard is TOP 5. Wheel broadcast and auto-follow return are visible.
- Browser 100-marble portrait race: observed 60 FPS, pinball closer shot followed by overhead return, RUSH! with enlarged marbles, segmented accelerator and side speed lines at DONE 98/100, then full completion around 73 active seconds with OUT 0 and full-screen confetti. Finished marbles remained in the leaderboard as FIN. The QA tab was closed and viewport override reset; the user's original tab was not changed.
- Fresh browser log: no errors; existing Rapier initialization deprecation warning only.
- Frozen full suite: `npm test -- --run` — 46 files passed, 472 tests passed, 3 optional tests skipped, 408.75 seconds, exit 0. The opt-in 300-marble validation was separately executed and passed as recorded above.
- `npm run build`, `npm run lint`, and `git diff --check` pass. Build retains the existing large-chunk warning. The initial sandboxed build could not read Vite's configuration due to filesystem access restrictions; the approved expanded-permission build completed successfully.
- Independent Astra read-only review found no actionable correctness regression or release blocker. No dependencies, saved-track schema, or channel-port formats changed.
