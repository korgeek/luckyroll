# 2026-09-08 release requirements and QA

## Release boundary

- Previously deployed: `d21ab18` (Cloudflare `Workers Builds: luckyroll` success, verified through GitHub check-runs). Track-management delivery was `698af0c`.
- Current baseline: local `d83d08d`, not yet pushed. Prior full validation: 46 files, 423 passing tests, 2 skipped; normal exit 0. Production build and ESLint passed.
- Final release QA: completed on frozen source. Push to the existing private `korgeek/luckyroll` main branch triggers the user's Cloudflare Git deployment; do not deploy separately first.
- User attachments under `.codex-remote-attachments/` are excluded.

## Requirement reconciliation

| User requirement | Baseline code / coverage | Release QA status |
| --- | --- | --- |
| Separate track management, no duplicated five slots | TrackLibraryPanel renders stored records; trackLibrary repeat-save tests | Browser PASS: one Save creates exactly one card |
| Share popup and raw code import | ShareTrackDialog, TrackLibraryPanel import, App import/save/update tests | Browser PASS: Copy code, real keyboard paste exact match, import and Save gives two distinct records |
| Choose track before start | SetupScreen selected track, picker and named Start | Implemented |
| Results exit, consistent Main Menu naming, no teams | ResultsScreen/SetupScreen tests; removed team fields | Implemented |
| Browser Back asks, main can quit/cancel, all English | App History API/native dialog tests, including loading-to-main replacement | Browser Back and quit/cancel PASS; actual Mac/Android device gestures not available here |
| TOP5 portrait phone, TOP10 landscape/desktop; trailing wins, gaps, animated reorder | RaceHud reverse standings, FIN retention, translated keyed rows and tests | Browser desktop TOP10 / portrait TOP5 PASS |
| Finished marbles remain in standings | RaceHud merge/filter/reverse finish history tests | Implemented |
| Circular bottom-right BOOST; 1.5x forward speed; five-second fill | 76px safe-area button, fixed-step cooldown, cap42 and pause guards | Portrait placement and non-overlap PASS; speed/cooldown unit coverage |
| Small upper-left FPS | Raw RAF 500ms counter test, independent of physics delta clamp | Implemented |
| Walls 1.5x without port changes | Rail12, inner4.5, start6; welded mesh/seam/clearance tests | Implemented |
| Gentler inner curves, central forward guide | Inner inset compensation, contact assist and chevrons | Preserved; curve speed probes exist |
| Slightly narrower wave/funnel | Wave10.8, funnel8.8, unchanged12 ports | Implemented |
| Round staggered moguls; later request for higher moguls | Four smooth hills now height1.0/radius1.8; same ports/footprint | PASS: exact mesh0.9948233, strict chord unchanged, all3 lanes fully exit at8/18/42 within8s |
| Six small circular pinball posts1→2→3 | R0.51/H0.952, same-row gap1.38 (~2 marble diameters); native cylinder parity tests | Implemented |
| Default demo, earlier wheel, last pinball | Cells2=funnel,7=wheel,12=wave,17/36/37=booster,38=pinball,39=finish | Route and default tests PASS |
| Finish dressing and strong fullscreen confetti | Collider-free arch/checker; Astra300-piece center burst, reduced motion and complete-only gating | Portrait fullscreen burst visually verified PASS |
| Git-hosted MIT audio instead of Kenney | Three SoundKit M4A files; attribution/public license; mute/preload/fallback tests | Assets and tests PASS; actual audible playback not verified |
| GA4 G-P9JP6JXRQ9, no white initial flash | index inline dark background and Google tag | Previously deployed; analytics ingestion cannot be inferred from code |
| Pinball restitution0.65 and preceding reverse-return booster | Added .65 native restitution, cell36 boost, route-derived return assist18/45steps | PASS: focused physics, consumed-forward/reverse/cooldown/reset/lateral; mixed100 allfinish/no-loss120s |
| Bumper camera until all live marbles clear | Added actual-route feature director | Unit and review PASS, including far-plane transition; desktop actual full-module framing at DONE92 |
| Wheel camera until81 unique marbles pass | Added unique crossing count and small-race fallback | Unit80/81/recross/DNF/reset PASS; portrait screenshots show full wheel held at9.3s/13.6s, auto follow restored17.9s |
| Camera jitter diagnosis/fix | Actual-distance interpolation replaces discrete sample anchor | Continuity regression PASS; time-based camera easing PASS |
| PREPARING RACE then ready3→2→1→GO | Explicit prepared event after bodies/transforms; double-RAF paint; held scene and clock | App/lifecycle34 + Scene30 tests PASS; portrait3/2/1/GO and Back freeze/resume visually verified |
| Latest addition: START RACE higher on Main Menu, inviting glow | Existing button below tagline, track label retained, CSS shimmer disabled for reduced motion | Focused Setup/App23 tests and scoped review PASS; portrait360x800 and desktop1024x768 visually PASS |
|1000-marble risk analysis; keep100 now | Renderer already instanced, launch/validator/booster storage limited100 | Analysis only; no1000 support promised |

## Superseded designs (do not implement)

- Alternating bars and speed-hump bumpers were replaced by six round pinball posts.
- Last wheel was replaced by last pinball; wheel moved earlier.
-120 confetti pieces became the approved stronger300-piece fullscreen effect.
- Restitution0.55 became explicitly0.65.
- BOOST next to Bird View moved to the bottom-right circle.

## Performance and validation caveats

- Camera sample snapping is a concrete reproduced cause of visible jitter, not proof of CPU/GPU saturation.
- The renderer already uses InstancedMesh. More marbles still increase physics contacts and repeated route projection work.
-1000 requires a different launcher, taller containment/gate/pusher, capacity changes and measured scaling; simply stacking100 per layer is not validated.
- The obstacle-free60-second throughput check and mixed-device100-finisher/no-loss120-second check are different courses. Do not describe them as the same performance benchmark.
- Two optional physics soak tests remain skipped; normal suite completion does not mean those ran.

## Final evidence

Browser roundtrip QA created only two new disposable records: QA Original `156d4985-8d21-4340-a1a2-4eaaba63579a`, QA Roundtrip `986be657-4d76-4e9a-b107-ee8d0b28c63e`; previous saved count was0. Editing and saving the original retained exactly two records. Default Track selection restored. Cleanup attempt hit a browser-native confirm/CDP timeout; user notified to close the dialog. Do not delete other records.

Task2 scoped review PASS after probe test was corrected to require the actual downstream exit, not merely8 units of progress. No production defect found.

Desktop browser1024x768: Default Track selected through picker; normal unboosted race reached results with all100 finishing and OUT0. Last finisher#21 matched live leader; FIN#27/#53 retained and present in final top10. Observed roughly56FPS in this local run is a sample, not a cross-device performance guarantee. Bumper shot kept all6 posts and track ahead visible. Task3 review found and resolved a bird-to-feature far-plane clipping gap.

Task3 clip fix scoped review PASS: current camera position expands far plane during transitions; all8 feature corners checked in depth. Portrait360x800: TOP5 and76px BOOST do not overlap; wheel whole-module hold and return captured; pinball shot visible; full finish produced dense fullscreen300-piece confetti screenshot. Subsequent results retained both Replay and Back to Menu. This is viewport emulation, not physical phone performance testing. Console showed no errors, only the existing Rapier initialization deprecation warning.

Final frozen verification: `npm test -- --run` exit0,46/46 files,447 passed/2 optional skipped,385.80s; `npm run build` exit0; `npx eslint src/react-app` exit0; `git diff --check` exit0. All scoped reviews PASS. Commit/push and Cloudflare deployment confirmation follow this QA checkpoint; exact remote SHA/check result are reported in the release handoff.

Countdown browser QA: portrait captures show3/2/1/GO, held marbles, timer0.0 and disabled BOOST. Browser Back at3 opened PAUSE MENU; after more than3.5 seconds it still held3 and0.0. RESUME showed3 then2. Returned to Main Menu before long full-suite checks. PREPARING paint and constructor-failure cleanup have focused regression coverage; the brief preparing screen was not captured in the live screenshot sequence.

Task4 review found deferred audio unlock could miss browser user activation. Existing preload is now called synchronously from Start/Replay/remaining-restart while audible start stays at GO. Rereview PASS. No new dependency was added; existing camera, sound and scene APIs were reused.

First full integration run identified a no-device test fixture missing the new cell36 booster, and a build+geometry-validation check taking5.6s against the default5s timeout. Fixture corrected and only that test budget set to15s; assertions unchanged. A new START-button RED test was also picked up while the latest requested UI was being implemented. All three failures have focused GREEN checks; final full run uses frozen code.

Frozen-code production build and full `src/react-app` ESLint PASS. Existing Vite large-chunk advisory remains. A development HMR dependency-array warning appeared while live code changed; a fresh page load plus full countdown/start had zero console errors. QA viewport override reset and functioning temporary QA tabs closed.

Default-map follow-up: the final route is booster → booster → bumper → finish, and bumper rows widen 1 → 2 → 3 in travel order. Device, render, design, route and physics checks: 78 passed, 1 optional 300-marble soak skipped. The 100-marble default seed-23 race completed within 120 seconds with no escapes, stalls or booster-cap violations. Lint and production build/dry-run passed.

## Adaptive rendering and CPU profiling follow-up

The in-app browser ran seed 23 with 50/100/200/300 marbles at the normal fixed physics step. Each measurement discarded the first 3 seconds and averaged the following 12 seconds. `scripts/benchmark.html` is a Vite-only manual benchmark page (not a production entry point); its Run benchmark button repeats the four counts and a 75% resolution comparison. It pauses when hidden and reports CPU timing plus delivered frame intervals.

| Marbles | Before: physics/devices + adjudication CPU ms/frame | After indexed projection | FPS before/after |
| --- | ---: | ---: | --- |
| 50 | 3.92 | 1.72 | ~60 / ~60 |
| 100 | 5.18 | 2.21 | ~60 / ~60 |
| 200 | 7.92 | 4.28 | ~60 / ~60 |
| 300 | 10.79 | 5.29 | ~60 / ~60 |

These are short local-browser observations, not controlled hardware benchmarks or measurements of an entire race. Background regression tests overlapped part of the after run. Render timing measures CPU submission, not GPU execution. Vsync capped the observed FPS; this demonstrates reduced CPU work, not a higher FPS guarantee on every device. Bumper/blade sound detection cost about 0.014 ms/frame in the 300-marble baseline; the initial crowded segment does not represent maximum simultaneous obstacle contacts later in the race.

The repeated nearest-track scan was reduced with immutable 32-sample bounding boxes. A box is skipped only when its nearest possible distance exceeds the best actual sample distance. Exhaustive arithmetic and first-index tie-breaking remain identical; 1,200 positions around the actual default track plus duplicate-point/empty-input cases compare directly with the original exhaustive projector. Physics timestep, velocities, collision handling, finish checks and ranking rules are unchanged.

Automatic rendering fallback now uses relative pixel ratios 1.0 → 0.8 → 0.65 (64% and 42.25% of the original pixel count). After a 1-second warmup, 500 ms measurement windows require <45 FPS for at least 2 seconds before reducing one step, or >=57 FPS for at least 10 seconds before recovering one step. Every transition starts a fresh window. Pauses, visibility changes, non-finite intervals and >250 ms loading gaps clear pressure. A new race restores the initial tier. This is a rendering fallback for slower devices; it does not claim to solve a physics bottleneck by lowering resolution.

No shadow tier was added: the existing scene has no shadow-casting marbles/lights. Experimental surface-map removal and 100 ms camera-target refresh showed no FPS gain at 300 marbles; camera CPU time changed only from about 0.14 to 0.06 ms/frame. Those experimental branches were removed. Camera motion and target calculations remain per-frame; ranking-display cadence remains 100 ms. Controller hysteresis, exclusions and actual scene pixel-ratio changes have automated checks.

Final verification: 49 test files passed (487 tests passed, 3 optional tests skipped), including the 100-marble default completion check; final TypeScript/Vite/Worker dry-run and ESLint passed. No production deployment verification was performed in this follow-up.

## Corner rendering, surface tuning, and results audio follow-up

- Removed corner-triggered zoom/lowering. The reported rounded black opening was
  reproduced even at near=0.1 and with double-sided rendering. Inner-rim infill
  closes that empty space without changing the collider mesh; browser comparison
  confirmed it closed. Three floor arrows now face forward and follow the curve.
- Final tuning: funnel throat 7.8 (was 8.8), mogul height 1.2 (was 1.0), track
  friction 0.06 (was 0.07; final explicit user setting), with unchanged 12-unit ports. A 6.8 throat and 1.5
  height caused stalls/large jumps, so those trial settings were rejected.
- Focused physics validation: all 100 finish by 120 simulated seconds with no
  escapes, stalls, non-finite states, or booster cap violations. All three probe
  lanes clear moguls at speeds 8/18/42, including 1.5x radius at speed 42.
- Results loop the unmodified AAA Level finish fanfare by Johan Brodd (CC BY-SA
  3.0), with visible attribution/license links and inherited mute state. Physical
  booster channels use the supplied Kenney maximize_005.ogg; manual BOOST retains
  Power up. Audio routing and muted/unmuted result transitions are covered by tests.

- Later follow-up: the pusher is a shallow triangular prism (depth 1.2), shared
  between render and convex collider. Its forward tip retains the previous start
  and end positions, so spawn and gate clearance stay unchanged. Follow-camera
  clearance is lowered uniformly by one unit, with no corner-triggered zoom.

- Bumper camera starts on first entry and approaches along the preceding channel
  to a low, close view (height 6, three units before entry). Position and gaze
  gently follow one marble, retaining it until it leaves and smoothing target
  handoffs. Bounded movement keeps all six posts and bounce height visible in
  portrait/landscape projection checks. It holds through gaps until every live
  marble passes, yielding first to last-place follow at ten or fewer marbles.
  Pinwheel framing keeps its existing behavior.

- Final friction 0.06 exposed a pre-existing finish-volume bug: a fixed radius-4
  circle missed edge-lane crossings on the width-12 channel. The shared detector
  now uses the finish tangent/side/up frame and full width. Edge/outside/below-floor
  checks, scene finish checks, legacy finish seeds, and the 100-marble mixed race
  all pass; the final mixed race has no losses by 120 simulated seconds.
- Production build and ESLint pass. Git-triggered Cloudflare deployment is used.
