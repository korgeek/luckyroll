# Bobsled Race Feel Design

## Goal

Make every editor-built race feel like a miniature bobsled course: a visible start pusher launches the whole field, every route segment descends in its own forward direction, curves bank inward, boosters always produce a noticeable forward acceleration, and Bird View presents the race from start at the top to finish at the bottom.

## Builder compatibility

The 5×8 editor, module catalog, route validation, `TrackDesign` schema, local-storage version, share tokens, default track, and saved tracks remain unchanged. Grade, banking, start geometry, pusher motion, and booster tuning are derived runtime properties and are never serialized. Existing tracks therefore need no migration and automatically receive the new bobsled treatment.

## Root causes

- The current board is globally tilted 20 degrees toward increasing row numbers. East/west straights receive almost no forward gravity and instead receive a lateral component, so marbles collect against one wall and lose speed.
- The start enclosure is narrower than the standard channel and its independent flat floor overlaps the first module instead of forming one continuous channel surface.
- The current start launch assigns every marble a forward speed once; no physical or visible device moves the field.
- A booster multiplies forward speed by only 1.20. A slow marble therefore remains slow, and a marble with no positive forward speed receives nothing.
- Bird View looks nearly straight down while retaining the track-surface up vector, so screen orientation is not explicitly tied to start-to-finish travel.

## Considered approaches

1. **Steepen the existing global board.** This is the smallest change, but it increases the same sideways gravity on east/west straights and makes the one-wall bias worse.
2. **Route-relative bobsled geometry — selected.** Height falls with traveled centerline distance, curves bank inward, and visible devices add energy. This keeps gravity physical and makes every legal builder route behave consistently.
3. **Continuously force a target speed.** This is predictable but hides track problems and makes collisions and module choices feel cosmetic.

## Route-relative grade and banking

Keep the editor path in its existing board-local X/Z coordinates. During sampling, accumulate horizontal centerline distance and derive world height from that distance:

```text
height = -distance × tan(7°)
```

The constant 7-degree grade replaces the global 20-degree planar tilt. Every forward tangent therefore has a downhill component regardless of whether a cell travels east, west, or down the editor board. Straight modules have no lateral grade.

Curves smoothly bank toward their inside up to 24 degrees through the curved interior. Banking remains zero throughout the canonical 0.10S landing at each port; both bank angle and its longitudinal rate are exactly zero where that landing meets the banked interior and at the module boundary. Reciprocal ports therefore use the same position, forward tangent, side/up frame, floor/wall/lip profile vertices, and surface normal. The curve exit and the next channel share one indexed boundary row rather than two touching meshes, so banking can never introduce a twist, ridge, step, gap, or overlapping collider at a seam. Straight, funnel, wave, pinwheel, booster, and bumper modules remain unbanked unless their centerline itself curves.

Rendering, the welded Rapier trimesh, device frames, projection samples, finish volume, and cameras all consume the same graded and banked samples. No render-only rotation is allowed.

## Continuous start channel and pusher

Extend the first route sample upstream by the start length using the exact canonical `profileAt(CHANNEL_WIDTH)` cross-section: floor shape, floor curvature, side walls, and upper lips must all match the normal channel. The extension and first module are one indexed render mesh and one Rapier trimesh, sharing the same boundary vertices and triangles rather than meeting as separate surfaces. There is therefore no visual or physical join inside the drivable channel: no gap, step, duplicate face, overlapping floor, normal discontinuity, or profile transition. Add only taller containment outside that shared channel profile and the moving rear pusher.

Replace the unused agitator descriptor with a channel-spanning pusher plate of width `W - D`, leaving `D/2` clearance at each side wall. The pusher is both a visible Three.js mesh and a Rapier kinematic collider and also serves as the rear closure:

- it remains behind the randomized 10×10 field during the 700 ms settle period;
- the gate lifts at 700 ms;
- the pusher then sweeps from the rear to just behind the gate in about 650 ms, approximately 13 world units per second;
- contact, rather than per-marble velocity assignment, launches the field;
- a remaining-marble restart begins with the gate open and repeats the pusher sweep;
- reset restores the pusher, gate, and all device state deterministically.

The pusher stops before the gate and never enters the canonical first-module landing. Its initial face does not intersect the first marble row.

## Booster rule

A marble consumes each booster at most once per race. Detect a forward swept entry into or across the full-width activation band, including a frame that crosses the entire band. On the first forward activation:

```text
boostedForwardSpeed = min(42, max(18, 1.25 × currentForwardSpeed))
```

Apply only the positive delta along the resolved route tangent. Preserve lateral, normal, and angular velocity and never slow a naturally faster marble. Backward travel does not activate the booster. Restart clears consumption.

This makes every legitimate pass visibly accelerate even when the incoming marble is moving slowly, without adding continuous hidden assistance elsewhere on the track.

## Bird View orientation

Bird View remains a fixed whole-course shot. Project the vector from finish to start onto the horizontal plane and use it as the camera's screen-up direction, so start is always at the top and finish at the bottom. Fall back to a stable world direction only when the projected endpoints coincide. Auto Camera remains unchanged.

## Verification

- Prove every sample has a non-positive height delta and every straight has positive downhill gravity along its forward tangent with negligible lateral gravity.
- Prove curve bank angle and longitudinal bank rate are zero at both landings, point inward in the interior, and keep exact reciprocal side/up frames plus existing seam position/tangent/cross-section/normal tolerances.
- Prove the start extension and first module share the exact canonical floor/wall/lip cross-section and one welded boundary row, with no gap, step, duplicate face, overlapping collider, or surface-normal discontinuity anywhere inside the channel.
- Red/green-test pusher timing, physical pose, reset, rear/side clearance, and visible-render synchronization.
- Run 100 marbles with the existing deterministic test seed and require every marble to clear the gate within a bounded time with zero start escape, stall, or non-finite state.
- Test booster minimum speed, multiplier, cap, swept crossing, backward rejection, once-only behavior, and restart reset.
- Test Bird View orientation with start above finish in screen coordinates.
- Run the full unit suite, lint, production build, and Cloudflare deploy dry-run. Do not consume any additional official multi-seed qualification budget without separate approval.
- Inspect Default Track and one saved editor track at the mobile Bird View size used in the reported screenshot.

## Non-goals

No editor schema change, per-track slope control, new module type, continuous speed assist, random launch force, teleport/recovery force, texture/model dependency, or automatic track rewrite. Per-module grade controls can be added later only if one fixed route-relative grade proves insufficient in playtesting.
