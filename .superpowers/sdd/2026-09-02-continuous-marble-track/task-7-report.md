# Task 7 — Safe Mixing Hall and Rounded Splitter

## Final geometry and contracts

Feature mode keeps the original single connected outer U-channel and adds exactly one closed, rounded capsule divider from its exact feature typed arrays. The checkpoint-10 hall widens continuously to 18.0 world units; each splitter sample is validated at no less than 16.0. The divider is centered (`offset: 0`), has a 0.45-unit radius, 2.0-unit length, and 2.1-unit height. Its minimum required outer-rim clearance is `2 * 0.68 = 1.36` units and its minimum required height above its local channel floor is `4 * 0.34 = 1.36` units.

The feature-only grade is 0.280; baseline `features: false` stays at 0.245. Containment is geometry-only: the right outer U-profile edge is lifted by 50% over samples 575–610 with 8-sample smooth tapers. The center floor and left edge do not change. The canonical maximum adjacent local rail-height step across both outer rims and shoulders is 0.7082443; validation permits at most 1.00, leaving a 0.2917557-unit margin while rejecting a discontinuous +8 mutation at sample 590.

The outer and feature buffers are generated per build, validated before use, and the exact same arrays flow to rendering and to the two trimesh colliders on the same fixed body. There is no cross-build cache or mutation. Feature-disabled builds have no splitter expectation and valid empty feature buffers.

Review round two validates the actual faceted outer mesh rather than only centerline/profile metadata. Every divider footprint bottom vertex is ray-mapped through its local profile column to the containing outer U triangles and rejected for surface penetration over 0.100 units. The canonical divider's largest low-poly resting-contact interpolation is 0.079486, so this preserves the existing geometry with 0.020514 units of documented tolerance; the offset-5 regression penetrates by approximately 1.105026 and is rejected with sample and vertex identifiers. Divider-to-rim clearance now uses point-to-triangle distance against the real left/right outer wall facets. Every feature vertex must be indexed, and every normal must be finite, 0.95–1.05 unit length, and aligned with its accumulated incident face normal.

## TDD, tuning, and physics evidence

RED first demonstrated missing divider validation/integration and the later review mutations: all-empty expected feature buffers, a too-narrow hall, an oversized/out-of-channel divider, a too-short divider, longitudinally misplaced geometry, too-close rim geometry, and a sample-590 right-rim discontinuity were accepted before the validator work. GREEN adds structured `feature-geometry` failures for the feature expectation and the actual semantic envelope, plus `rail-seam` for both outer rims and shoulders.

The bounded geometry/grade matrix settled on the compact 18-wide hall, radius 0.45, length 2.0, centered capsule and right-only rim lift. Earlier wide-hall, long-divider, local-drop, symmetric-rim, and lower-grade candidates either reduced throughput or left timing margin. The final 0.280 grade passed the margin gates: feature single-marble time 47.650s; seed 37 completed six fresh 100/100 runs with zero escape/stall and worst last finish 57.833s; seed 97 completed six fresh 100/100 runs with zero escape/stall and worst last finish 57.200s.

The final fixed-seed soak ran seeds 11, 23, 37, 41, 53, 67, 71, 83, 97, and 101 twice from scratch: 20/20 runs, 100 unique finishers in every run, zero escapes, zero stalls, and all finishes no later than 60 seconds.

## Review-fix verification

Sol's first review-fix verification reported focused 53/53, full 19 files / 107 tests with exit 0 in 122.59s, and build exit 0, while identifying the remaining faceted-surface and feature-buffer integrity gaps. Round-two RED reproduced all three gaps: offset-5 penetration, an appended in-hall unreferenced vertex, and a zero normal. GREEN static verification is 42 validation, 9 geometry, and 6 specification tests (57/57); the final repository suite, production build, tracked-diff inspection, and legacy-symbol search are rerun before the round-two local commit.

Current review-fix status: round-two local commit pending on `feature/continuous-marble-track`; review approval remains pending. No main merge or push is performed by this task. The prior Task 7 implementation commit is `081f27d502a2fca800ebc164fd610757b49ef5d9`.
