# Task 7 — Safe Mixing Hall and Rounded Splitter

## Final geometry and contracts

Feature mode keeps the original single connected outer U-channel and adds exactly one closed, rounded capsule divider from its exact feature typed arrays. The checkpoint-10 hall widens continuously to 18.0 world units; each splitter sample is validated at no less than 16.0. The divider is centered (`offset: 0`), has a 0.45-unit radius, 2.0-unit length, and 2.1-unit height. Its minimum required outer-rim clearance is `2 * 0.68 = 1.36` units and its minimum required height above its local channel floor is `4 * 0.34 = 1.36` units.

The feature-only grade is 0.280; baseline `features: false` stays at 0.245. Containment is geometry-only: the right outer U-profile edge is lifted by 50% over samples 575–610 with 8-sample smooth tapers. The center floor and left edge do not change. The canonical maximum adjacent local rail-height step across both outer rims and shoulders is 0.7082443; validation permits at most 1.00, leaving a 0.2917557-unit margin while rejecting a discontinuous +8 mutation at sample 590.

The outer and feature buffers are generated per build, validated before use, and the exact same arrays flow to rendering and to the two trimesh colliders on the same fixed body. There is no cross-build cache or mutation. Feature-disabled builds have no splitter expectation and valid empty feature buffers.

Review round three validates the actual faceted outer mesh rather than only centerline/profile metadata. Each divider footprint is associated only with the closest continuous 3D splitter-zone centerline strip; its interpolated local frame and longitudinal segment fraction select one of the two actual indexed outer triangles for barycentric surface interpolation. This avoids the earlier cross-level X/Z alias at sample 741. The faceted surface is the single source of truth for floor intersection: a canonical divider lowered 0.01 remains within the 0.100 tolerance, while a 0.03 lowering is rejected. The offset-5 regression's deepest actual-triangle penetration is 1.211378 at splitter strip sample 571 / vertex 13, and a +5 raised offset-5 divider is accepted. Divider-to-rim clearance uses point-to-triangle distance against the real left/right outer wall facets. Every feature vertex must be indexed, and every normal must be finite, 0.95–1.05 unit length, and aligned with its accumulated incident face normal.

## TDD, tuning, and physics evidence

RED first demonstrated missing divider validation/integration and the later review mutations: all-empty expected feature buffers, a too-narrow hall, an oversized/out-of-channel divider, a too-short divider, longitudinally misplaced geometry, too-close rim geometry, and a sample-590 right-rim discontinuity were accepted before the validator work. GREEN adds structured `feature-geometry` failures for the feature expectation and the actual semantic envelope, plus `rail-seam` for both outer rims and shoulders.

The bounded geometry/grade matrix settled on the compact 18-wide hall, radius 0.45, length 2.0, centered capsule and right-only rim lift. Earlier wide-hall, long-divider, local-drop, symmetric-rim, and lower-grade candidates either reduced throughput or left timing margin. The final 0.280 grade passed the margin gates: feature single-marble time 47.650s; seed 37 completed six fresh 100/100 runs with zero escape/stall and worst last finish 57.833s; seed 97 completed six fresh 100/100 runs with zero escape/stall and worst last finish 57.200s.

The final fixed-seed soak ran seeds 11, 23, 37, 41, 53, 67, 71, 83, 97, and 101 twice from scratch: 20/20 runs, 100 unique finishers in every run, zero escapes, zero stalls, and all finishes no later than 60 seconds.

## Review-fix verification

Sol's round-two verification reported focused 57/57, full 19 files / 111 tests with exit 0 in 121.58s, and build exit 0, while identifying crossing-mapping, floor-source, and empty-sample gaps in commit `2e2fc51`. Round-three RED reproduced all five behaviors. GREEN integration verification is 46 validation, 9 geometry, 6 specification, 4 renderer, and 10 scene tests (75/75). The final repository suite passed 19 files / 115 tests with exit 0 in 114.12s; the production build also exited 0. Tracked-diff inspection and legacy-symbol search were rerun before the round-three local commit.

Current review-fix status: round-three local commit pending on `feature/continuous-marble-track`; review approval remains pending. No main merge or push is performed by this task. The prior round-two commit is `2e2fc515c637fc818ce7990a29c2b2d792079557`.
