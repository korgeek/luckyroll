# SDD ledger — plan: docs/superpowers/plans/2026-09-02-continuous-marble-track.md

## Preflight interface scan

| Tasks | Producer → consumer | Finding |
|---|---|---|
| 1 | `TrackSpec`, `TrackSample`, `TrackGeometry` types → Tasks 2–8 | Clean: downstream names match Task 1. |
| 1 → 2 | `TrackSpec` and nodes → `sampleTrack()` | Clean: sampler consumes immutable node data. |
| 2 → 3 | `readonly TrackSample[]` → U-channel sweep | Clean: frame fields required by Task 3 are produced by Task 2. |
| 1–3 → 4 | spec, samples, geometry → validator and builder | Clean: `buildValidatedTrack()` has every dependency. |
| 3 → 5 | typed mesh buffers → Rapier trimesh | Clean: collider receives identical position/index buffers. |
| 2, 4, 5 → 6 | progress projection, validated build, collider → scene | Clean: scene migration can remove legacy Z-based logic. |
| 1, 3, 5 → 7 | feature option, geometry buffers, physics harness → splitter | Clean: feature mode extends rather than replaces the baseline. |
| 6 → 8 | renderer and migrated scene → debug views/presentation | Clean: presentation happens after physics integration. |
| 8 | bounds → named camera shots | Clean: tests and planned signature agree. |

## Per-task self-consistency scan

| Task | Tests vs implementation and files | Finding |
|---|---|---|
| 1 | Three spec tests; three new files; exact A-to-12 nodes | Clean after design review. |
| 2 | Spacing, grade, tangent, projection tests; sampler implementation | Clean. |
| 3 | Profile rows, containment, connectivity, budget; sweep implementation | Clean. |
| 4 | Ten structured failure codes; validator plus canonical builder | Clean. |
| 5 | Single and ten-seed physics tests; fixed-step gravity-only harness | Clean but expected to require numeric tuning allowed by the spec. |
| 6 | Buffer identity test; render and scene migration; legacy deletion | Clean. |
| 7 | Splitter clearance/connectivity and full soak; optional feature buffers | Clean. |
| 8 | Named camera tests; debug/browser/mobile validation | Clean; final device acceptance remains the user’s step. |

Ruling: Terra commits each task only on `feature/continuous-marble-track`; Sol reviews that commit, then the controller fast-forwards `main` and pushes it — this preserves the user’s immediate Cloudflare feedback requirement while preventing unreviewed code from reaching `main` — if wrong, deployment is delayed until review rather than showing an unfinished stage.

Task 1: dispatched to Terra at base `52d6f2332bab2349c9c1e2268071a568579c67a5`.

Task 1 review: implementation/spec code approved; one Important integration finding open — commit `a8f18f9` not yet on `origin/main`.

Task 1 Ruling: the push finding is the intentional review gate recorded above, not a Terra code defect; the controller will fast-forward `main` only after Sol approves the implementation, then ask Sol to verify the ref — if wrong, the only cost is one delayed deployment stage and no code rework.

Task 1: fix round 1/5 (1 addressed, 0 open — `origin/main` verified at `a8f18f9`; commits `52d6f23..a8f18f9`).

Task 1: complete (commits `52d6f23..a8f18f9`, review clean).

Task 2: dispatched to Terra at base `a8f18f969800f527bfcc9d049a119b25165f1f98`.

Task 2 Ruling: preserve every A–12 checkpoint coordinate and order, but allow Task 2 to adjust or add non-checkpoint guide nodes so sampled position headings satisfy `< 0.16` radians; independent tangent smoothing is forbidden because it would hide actual geometry — if wrong, the top-down shape of an unlabeled bend may shift while the authoritative checkpoint route stays unchanged.

Task 2 Ruling: diagnose all remaining `>= 0.16` heading hotspots in one pass and comprehensively tune guide nodes, rather than replacing the trajectory algorithm — this keeps the approved Catmull-Rom architecture testable — if wrong, additional unlabeled bends may deviate from the reference corridors and require visual retuning later.

Task 2: complete (commits `a8f18f9..8567c39`, Sol review clean; `origin/main` pushed).

Task 3: dispatched to Terra at base `8567c39497d0c2c29333b558bae989a851bf6de4`.

Task 3 Ruling: correct Task 2’s cross-product order so every local `up` has positive world Y, with a new failing sampler test, rather than negating the frame inside geometry — the design spec explicitly requires an upward normal and raised U-channel edges, so this resolves a plan formula defect at its source — if wrong, bank orientation may invert and will be caught by profile and visual validation.

Task 3: complete (commits `8567c39..0e604cc`, Sol review clean; 12,256 triangles; `origin/main` pushed).

Task 4: dispatched to Terra at base `0e604cc26aadbba6c258e936a35a3b62c0e62c4d`.

Task 4 Ruling: define crossing candidates as sample pairs whose along-track distance is at least `3 * max(sampleA.width, sampleB.width)` before applying the existing one-width X/Z proximity and 5-unit vertical-clearance tests — this excludes ordinary neighboring bends without weakening actual crossing clearance — if wrong, a very short self-crossing could evade static validation and must be caught by visual/physics validation.

Task 4 Ruling: samples 161/254 are a real crossing at 4.910 units, so lower only non-checkpoint 4-to-5 descent guide elevation enough to reach at least 5.1 units rather than adding an exemption — this preserves the binding 5-unit clearance and all checkpoint coordinates — if wrong, the upper-to-middle connector becomes slightly steeper and may affect race speed.

Task 4 Ruling: diagnose all remaining real clearance failures together and tune only non-checkpoint middle/lower guide-node elevations until each has at least 5.1 units; no exemptions, checkpoint changes, or threshold reductions are allowed — this prevents serial whack-a-mole and preserves the approved topology — if wrong, later-tier slopes may become faster and require physics retuning.

Task 4 Ruling: supersede the prior checkpoint-Y restriction because the reference is authoritative for top-down X/Z and order, while the design only binds checkpoints to three height bands; checkpoint Y and downstream guide Y may be minimally retuned within their assigned tiers to make strict downhill and >=5.1 clearance simultaneously solvable — if wrong, the visible tier spacing may differ from the intended model and require visual review adjustment.

Task 4 review fix round 1/5: Sol findings addressed with `geometry-structure` and `non-finite` structured failures; final-approach-only finish gating; exact U-channel buffer/in-range index validation; and strengthened checkpoint-level-band regression. RED regressions observed before production changes; GREEN evidence: Task 1–4 35/35, full suite 50/50, build and diff-check pass. Pending Terra commit for review.

Task 4 review fix round 2/5: defined `node.level` now fails closed when non-finite and returns `invalid-level` when not an integer tier in 1–3. RED mutations for `NaN` and 4 verified before the fix; GREEN evidence: Task 1–4 37/37, full suite 52/52, build and diff-check pass. Pending Terra commit for review.

Task 4: complete (commits `0e604cc..e21ab96`, Sol review clean; full suite 52/52; `origin/main` pushed).

Task 5: dispatched to Terra at base `e21ab969de6d1aa55bab0bd957a8477f3e6cfc11`.

Task 5 Ruling: the generated centerline is approximately 766 world units despite the approved 350–450-unit design target; preserve A-to-12 order, topology, three height tiers, strict downhill behavior, and static thresholds, but allow a uniform X/Z rescale plus minimal guide-node retuning to bring authoritative course length to at most 450 units — this retains the requested 60-second gravity-only race instead of relaxing timing or adding hidden recovery forces — if wrong, the top-down silhouette will be more compact and must be caught during scene/browser review.

Task 5 Ruling: after the approved X/Z rescale, allow `sampleSpacing` to decrease from 1.0 to 0.5 so the same continuous curve remains below the existing per-sample heading limit; retain the `<0.16` threshold and triangle budget rather than weakening validation — if wrong, denser geometry may increase mobile cost and must be caught by the existing triangle budget plus later device profiling.

Task 5 Ruling: scale ordinary channel widths proportionally with the 0.5 X/Z course rescale so the static crossing-candidate geometry retains its original proportions; keep a launch-only width large enough for ten non-overlapping 0.68-diameter marbles and taper continuously into the course — this addresses the 2,054 artificial proximity pairs without reducing the 5.1 clearance threshold — if wrong, the narrower race channel may over-congest 100 marbles and will fail the deterministic soak.

Task 5 Ruling: Rapier produces different 100-body contact-solver finish orders even when a world is restored from identical pre-step snapshot bytes, while both runs retain 100/100 completion and zero failures; remove the unproductive snapshot cache and replace exact order/time equality with two complete executions that independently require 100 unique finishers, zero escapes, zero stalls, and all finishes by 60 seconds — this preserves repeatable safety evidence while accepting the product-desired race-order variability — if wrong, a nondeterministic intermittent physics defect could pass and must be caught by the ten fixed scenario seeds on both runs.

Task 5 review fix round 1/5: Sol found the 100 launch spheres penetrate the exact faceted collider by approximately 0.045–0.115, seed variation only rotates IDs over an identical physical set, implementation used unauthorized `sampleSpacing` 0.4 instead of 0.5, and the public two-argument marble-body factory is unsafe for raw logical slots. Terra must add exact mesh-clearance and meaningful seeded-position regressions, restore 0.5 spacing, make the public body factory consume physical mapped positions, purify node-height construction, and repeat all physics evidence before re-review.

Task 5: complete (commits `e21ab96..8fe1c3f`, Sol review clean; 18 files/77 tests; `origin/main` pushed).

Task 6: dispatched to Terra at base `8fe1c3ffaf7b5447bdb62611f0fa9f863144a064`.

Task 6 review fix round 1/5: Sol found browser Rapier initialization is disconnected from the shared physics module and therefore fresh browser `begin()` throws; pre-init reset/stop/rejection lifecycle is unsafe; projector work is duplicated per marble. Terra must unify browser/headless initialization with real coverage, cancel pending starts and handle rejection, reuse one projection, then repeat integration verification.

Task 6: complete (commits `8fe1c3f..534d8af`, Sol review clean; 19 files/83 tests; `origin/main` pushed).

Task 7: dispatched to Terra at base `534d8af48e3e8e3a4a6231a5d239c4d387b5ac4d`.

Task 7 Ruling: three splitter attempts at the minimum 16-unit hall width produced 85/100 throughput, a post-splitter escape, or an in-splitter stall; before declaring a constraint conflict, run a bounded geometry matrix over hall widths 18/20/22/24 and short rounded dividers (radius approximately 0.7/0.9/1.1, length 3.5–5) with static validation first and seed 11 second, then permit a small feature-zone-only downhill-grade increase if necessary while keeping the feature single-marble time 45–60 and all no-recovery rules — this explores the untested throughput dimension rather than weakening acceptance — if wrong, a wider hall may increase lateral wandering or cross-course overlap and will fail static/physics tests.

Task 7 Ruling: width and local-drop matrices showed wider halls and a local dip reduce throughput; before adding another funnel obstacle, test a compact capsule (radius 0.45–0.65, length 2–3.5) at width 16/18 with a small lateral offset that creates one wide fast path and one narrower variable path, then allow feature-mode-only global grade up to 0.26 while a permanent single-marble feature test enforces 45–60 seconds — this keeps one simple obstacle and gravity-only flow — if wrong, the compact divider may not create meaningful mixing or the global grade may destabilize later curves, which the ten-seed soak must reject.

Task 7 Ruling: the locked width-18/radius-0.45/length-2/grade-0.250 candidate passed seed 11 once but a fresh repeat escaped at post-splitter sample 592; preserve floor/centerline and add a smoothly tapered feature-zone U-profile edge lift (not a separate box rail) around the hall and exit, testing bounded lift factors and requiring seed 11 to pass five fresh runs before the full two-suite soak — this directly contains collision ejections without hidden forces or deepening the travel floor — if wrong, taller rims may create snagging seams or excessive geometry and will fail static/stall/budget checks.

Task 7 Ruling: a right-side-only +50% tapered exit rim over samples 575–610 passed seed 11 and 23 six times each but seed 37 produced 97/100 with zero failures; retain this containment and test the smallest feature-grade increments 0.252–0.255, guarding feature single time >=45 and requiring seed 37 five fresh 100/100 runs before the full soak — this buys only the missing throughput while keeping the proven wall — if wrong, added speed may move escapes to another curve and the full seed suite must reject it.

Task 7 Ruling: grade 0.2535 qualified seed 37 but later missed one seed-23 finisher, and 0.255 still produced a 99/100 throughput-only miss with no failures; extend the bounded feature-grade search to 0.26/0.265 while retaining the right exit rim and hard single-marble >=45 guard, stopping at the first stable candidate or before the single lower bound — this targets the measured ~0.35-second deficit — if wrong, extra speed will create a new escape or violate the single timing/static envelope and be rejected.

Task 7 Ruling: grade 0.265 passed eight fixed seeds twice but seed 97 yielded 99/100 with no failure; extend only to 0.2675/0.270 under the same right-rim geometry and single >=45 guard, qualifying seed 97 five times before re-running the complete suite — this addresses one late finisher after broad safety success — if wrong, the marginal speed will cause an escape or timing violation and be rejected without further increase.

Task 7 Ruling: grade 0.2675 repeatedly qualified individual seeds but the restarted suite still produced a seed-37 99/100, showing pass/fail-only qualification lacks margin; evaluate 0.270/0.275/0.280 with unchanged geometry, single >=45, and repeated seed 37/97 runs requiring zero failures plus worst last finisher <=58 seconds before promotion — this establishes deterministic timing headroom instead of chasing one late marble — if wrong, higher grade will violate single timing/static/containment and be rejected.

Task 7 review fix round 1/5: Sol verified the default feature and full 19-file/99-test suite but found fail-open gaps: expected feature buffers may all be empty; hall width, divider clearance/height/placement, and total safety envelope are fixture-only; a +8 right-rim seam mutation is accepted; the required Task 7 report is missing. Terra must add structured feature expectation/semantic/longitudinal-seam validation and mutation tests plus the report before re-review.

Task 7 review fix round 2/5: Sol verified the first fixes and full 19-file/107-test suite, then found dividerOffset 5 penetrates the actual faceted U surface by 1.105026 despite center-floor validation and an appended unreferenced feature vertex is accepted. Terra must validate divider footprint against interpolated actual profile surface, require every feature vertex referenced and normals valid, and refresh report status before re-review.

Task 7 review fix round 3/5: Sol verified vertex/normal checks and full 19-file/111-test suite, then found faceted lookup searches X/Z across all levels and incorrectly maps offset geometry to crossing sample 741; the older center-floor check contradicts the 0.100 faceted tolerance; empty samples throw. Terra must restrict mapping to the splitter zone with correct 3D/longitudinal association, use faceted tolerance as the single floor source, guard malformed prerequisites, and refresh the report.

Task 7 review fix round 4/5: Sol verified continuous splitter projection and full 19-file/115-test suite, then found nonconsecutive splitter samples produce no strip and throw, and faceted interpolation reconstructs a hard-coded quad diagonal instead of reading actual geometry indices. Terra must require a consecutive splitter strip, query exact indexed outer triangles, add topology-sensitive mutations, and refresh the report.

Task 7 review fix round 3/5: RED reproduced the sample-741 X/Z alias/unmappable raised offset, the false center-floor rejection at a 0.01 lowering, beyond-tolerance rejection ambiguity, and empty-sample TypeError. GREEN maps only to the closest continuous 3D splitter-zone centerline strip, interpolates its frame and segment fraction, and evaluates the selected indexed outer triangle barycentrically; no global X/Z lookup remains. Surface penetration is the sole floor-intersection source: -0.01 accepts, -0.03 rejects, +5 offset accepts, and canonical-height offset5 rejects at splitter sample 571/vertex13 with 1.211378 penetration (>0.100). Empty samples return `geometry-structure` plus structured `feature-geometry` prerequisites. Focused round-three 5/5; static/render/scene 75/75; final repository suite 19 files/115 tests exit 0 in 114.12s; build exit 0; diff/search clean. Sol prior evidence: focused 57/57, full 19 files/111 tests exit 0 in 121.58s, build exit 0 for `2e2fc51`; approval remains pending. Local commit `c133cfacaca23116541a2c9860e4a075edbb69f4` exists.

Task 7 review fix round 2/5: RED reproduced the offset-5 faceted U-surface penetration, an in-hall duplicate unreferenced feature vertex, and a zero normal. GREEN uses exact outer profile triangles: ray/triangle local footprint mapping rejects surface penetration above 0.100, and point-to-triangle distance verifies actual left/right faceted rim clearance. The default divider remains unchanged; its maximum resting interpolation is 0.079486, leaving 0.020514 of documented tolerance, while offset 5 remains approximately 1.105026. Every feature vertex must be referenced; normals are finite, 0.95–1.05 unit length, and accumulated-face aligned. Structured failures include sample and vertex identifiers. Static suites: 57/57. The repository suite/build/diff/search completed before local commit `2e2fc515c637fc818ce7990a29c2b2d792079557`; Sol's preceding evidence was focused 53/53, full 19 files/107 tests exit 0 in 122.59s, build exit 0; approval is not yet final.

Task 5: complete pending commit. RED evidence recorded in `task-5-report.md`; GREEN evidence: 20 independent 100-marble validations across the ten fixed seeds, every run 100/100 with zero escapes/stalls and final completion no later than 59.600s; single seed 1 completes in 55.283s. Static/track/repository suites and production build are green. The soak is split into three sequential files to stay beneath Vitest's worker-RPC reporting limit without increasing that timeout or changing physics behavior.

Task 5 review fix round 1/5: RED evidence confirmed the actual faceted-mesh launch penetration (`0.219519`, and `0.165931` for a rejected selected-face prototype), seed-coordinate aliasing, unauthorized `.4` sampling, and unsafe raw-slot two-argument factory. GREEN: exact-mesh physical launch positions, deterministic physical seed jitter, branded two-argument factory, pure node builder, `sampleSpacing: 0.5`, and actual XYZ length regression. All 20 independent runs passed again with 100 unique finishers, all <=60s, zero escapes and zero stalls; single seed 1 was 49,416.667ms. The ordinary full suite passed 17 files / 67 tests and build passed; split soak layout now has six sequential files, each under the runner boundary. Pending final diff-check and commit.

Task 5 minor cleanup: removed all ordinary raw-node Y/startY inputs in favor of a separately named initial-A height; reused a precomputed exact-triangle helper and added `it.each` all-ten-seed launch invariants (mesh clearance >=0.345, pair spacing >=0.68, and actual side-wall margin >=0.34); removed temporary physics metric logging. GREEN: focused launch matrix 10/10, static track 41/41, ordinary full suite 18 files / 77 tests, build and diff-check passed. Pending local commit only.

Task 6: complete in the local `feat: render and collide one continuous U-channel` commit; no merge or push. RED: missing `trackRender`, scene-resource, and scene-collider seams were each observed before their production code. GREEN: renderer/scene focused suite 2 files / 7 tests, final full suite 19 files / 78 tests, and production build passed. The scene calls `buildValidatedTrack()` once to create canonical render resources, forwards the same `TrackGeometry` to the Task 5 trimesh collider helper, maps launch slots through Task 5 physical positions, projects runtime progress through `projectToTrack()`, and requires both progress >=0.995 and `insideFinishVolume()` to finish. All legacy guide force, recovery, flat ribbon, segment, rail, and `trackLayout` references were absent in the final source search before `trackLayout.ts` and its test were deleted. Touch/mouse controls and mobile renderer caps are retained; render resources are disposed on reset/dispose.

Task 6 Sol review fix: complete in the local `fix: share Rapier scene initialization` commit; no merge or push. The browser's former local Rapier initialization could not populate Task 5's private helper state, so fresh browser collider/body creation would throw. Shared exported `initializeTrackPhysics()` and `createTrackPhysicsWorld()` now serve both headless and scene paths; real scene-path initialization then creates the canonical trimesh and marble body without a prior harness run. RED: missing shared-init/lifecycle exports (4 regressions) and a zero-call projection-reuse regression. GREEN: reset/dispose cancel pending starts, rejected initialization is caught and clears the queue, scene initialization uses real Rapier helpers, and each active body uses one projector result for progress plus finish. Final focused suite 2 files / 12 tests, track suite 12 files / 65 tests, repository suite 19 files / 83 tests, production build, legacy search, and diff-check pass.

Task 7: RED observed absent feature buffers/validation/collider/render/scene seams, malformed feature-buffer validation gaps, and a compact splitter without containment. GREEN adds one closed 56-triangle rounded capsule divider to the exact feature typed arrays, a continuously widened checkpoint-10 hall (18 units), a 2.0-unit capsule length, 0.45-unit radius, 2.1-unit height, and at least 1.36-unit divider-to-wall clearance. The original outer U-channel remains a separately generated connected mesh; within every build its exact outer and feature buffers flow through validation, rendering, and the two Rapier colliders on one fixed body. No cross-build cache or mutation is used.

Task 7 containment ruling result: a feature-only right-edge U-profile lift is smoothly tapered over samples 575–610 (8-sample tapers); its center floor and left edge remain unchanged. Final feature-only grade is 0.280 (baseline feature=false grade remains 0.245). RED tuning matrices found full/short symmetric lifts retained marbles, while the right-edge lift eliminated the local sample-589–592 ejections; grade 0.270 and 0.275 missed the required 58-second timing margin. GREEN margin evidence for 0.280: feature single 47.650s; seed 37 six fresh 100/100 runs, zero failures, worst last finish 57.833s; seed 97 six fresh 100/100 runs, zero failures, worst last finish 57.200s. The final fixed suite then completed all ten seeds (11, 23, 37, 41, 53, 67, 71, 83, 97, 101) twice: 20/20 runs, all 100 unique finishers, zero escapes, zero stalls.

Task 7 review fix round 1/5: RED confirmed all-empty expected feature buffers plus semantic hall/clearance/height/longitudinal/rim and sample-590 seam mutations were accepted. GREEN adds fail-closed canonical splitter expectation (`feature-geometry`), including canonical splitter-node metadata if sample labels are damaged, semantic feature checks against actual samples and mesh positions (width >=16, channel and splitter-zone bounds, 1.36 rim clearance, 1.36 floor-relative height, no floor intersection, and combined triangle budget), and `rail-seam` checks on both edges/shoulders for feature and baseline builds. Canonical maximum adjacent local rail-height step is 0.7082443; the documented 1.00 threshold leaves 0.2917557 margin and rejects the +8 mutation. Focused track suites: 53/53; renderer/scene integration: 67/67. Final full-suite/build/diff/search completed before local review-fix commit `52bf3584d0f47d428cf4eec0c37d279e5cf17f4e`.

Task 7 review fix round 4/5: RED reproduced a `TypeError` when valid-width splitter labels existed only at nonconsecutive samples 554 and 556, and showed that changing every diagonal in the relevant single splitter strip left semantic penetration unchanged. GREEN requires at least one consecutive indexed splitter strip before any projection/dereference, returning a structured `feature-geometry` prerequisite at sample 554. The faceted query now enumerates only actual `geometry.indices` triangles spanning the two profile rows of the projected splitter strip, interpolates those exact vertex positions, and uses no reconstructed default diagonal. At t within 0.0001 of an endpoint, or after a frame-interpolation ray miss, it considers only adjoining strips in the same continuous splitter run and selects the closest valid signed intersection. Canonical endpoint mapping passes. The localized strip-571 diagonal mutation changes offset-5 penetration from 1.200649 to 1.241484 at sample 571/vertex 13. Focused static validation 49/49; renderer/scene/track group 78/78; full repository suite 19 files/118 tests exit 0 in 116.78s; build exit 0. Diff/search were clean before round-four commit `9fe6a6009f00aaf77e3faac2305c1916a4b015fd`; Sol's implementation review has no Critical or Important findings. Documentation final approval remains pending until recheck.
