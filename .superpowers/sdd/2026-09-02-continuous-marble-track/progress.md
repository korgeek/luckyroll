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

Task 5: complete pending commit. RED evidence recorded in `task-5-report.md`; GREEN evidence: 20 independent 100-marble validations across the ten fixed seeds, every run 100/100 with zero escapes/stalls and final completion no later than 59.600s; single seed 1 completes in 55.283s. Static/track/repository suites and production build are green. The soak is split into three sequential files to stay beneath Vitest's worker-RPC reporting limit without increasing that timeout or changing physics behavior.

Task 5 review fix round 1/5: RED evidence confirmed the actual faceted-mesh launch penetration (`0.219519`, and `0.165931` for a rejected selected-face prototype), seed-coordinate aliasing, unauthorized `.4` sampling, and unsafe raw-slot two-argument factory. GREEN: exact-mesh physical launch positions, deterministic physical seed jitter, branded two-argument factory, pure node builder, `sampleSpacing: 0.5`, and actual XYZ length regression. All 20 independent runs passed again with 100 unique finishers, all <=60s, zero escapes and zero stalls; single seed 1 was 49,416.667ms. The ordinary full suite passed 17 files / 67 tests and build passed; split soak layout now has six sequential files, each under the runner boundary. Pending final diff-check and commit.

Task 5 minor cleanup: removed all ordinary raw-node Y/startY inputs in favor of a separately named initial-A height; reused a precomputed exact-triangle helper and added `it.each` all-ten-seed launch invariants (mesh clearance >=0.345, pair spacing >=0.68, and actual side-wall margin >=0.34); removed temporary physics metric logging. GREEN: focused launch matrix 10/10, static track 41/41, ordinary full suite 18 files / 77 tests, build and diff-check passed. Pending local commit only.

Task 6: complete in the local `feat: render and collide one continuous U-channel` commit; no merge or push. RED: missing `trackRender`, scene-resource, and scene-collider seams were each observed before their production code. GREEN: renderer/scene focused suite 2 files / 7 tests, final full suite 19 files / 78 tests, and production build passed. The scene calls `buildValidatedTrack()` once to create canonical render resources, forwards the same `TrackGeometry` to the Task 5 trimesh collider helper, maps launch slots through Task 5 physical positions, projects runtime progress through `projectToTrack()`, and requires both progress >=0.995 and `insideFinishVolume()` to finish. All legacy guide force, recovery, flat ribbon, segment, rail, and `trackLayout` references were absent in the final source search before `trackLayout.ts` and its test were deleted. Touch/mouse controls and mobile renderer caps are retained; render resources are disposed on reset/dispose.

Task 6 Sol review fix: complete in the local `fix: share Rapier scene initialization` commit; no merge or push. The browser's former local Rapier initialization could not populate Task 5's private helper state, so fresh browser collider/body creation would throw. Shared exported `initializeTrackPhysics()` and `createTrackPhysicsWorld()` now serve both headless and scene paths; real scene-path initialization then creates the canonical trimesh and marble body without a prior harness run. RED: missing shared-init/lifecycle exports (4 regressions) and a zero-call projection-reuse regression. GREEN: reset/dispose cancel pending starts, rejected initialization is caught and clears the queue, scene initialization uses real Rapier helpers, and each active body uses one projector result for progress plus finish. Final focused suite 2 files / 12 tests, track suite 12 files / 65 tests, repository suite 19 files / 83 tests, production build, legacy search, and diff-check pass.
