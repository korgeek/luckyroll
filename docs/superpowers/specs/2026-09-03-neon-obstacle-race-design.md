# Lucky Roll Neon Obstacle Race Design

## Goal

Upgrade the existing continuous A-to-12 race into a close-following neon marble show without rebuilding the validated base route. Remove the decorative structural supports, add physical shuffle features that reverse order without trapping marbles, and direct the camera from the early leader toward the final trailing marble.

## Product Principles

- Lucky Roll remains a short, unserious party game rather than a simulation tool.
- The existing continuous three-level U-channel and high containment walls remain authoritative.
- New devices use Rapier collision and deterministic animation; they do not teleport marbles or apply hidden ranking forces.
- A run is safe when marbles remain contained and do not become stuck. Exceeding a target play time is not a validation failure when marbles continue moving.
- The existing 60-second in-game timeout dialog remains available as a user-facing safety control. Automated obstacle qualification does not require every marble to finish before that timeout.
- Visual effects must remain practical on mobile without a post-processing bloom pipeline.

## Visual Direction

The course should resemble a thick arcade track rather than a thin cyan ribbon.

- Background: near-black navy gradient with a restrained blue haze.
- Track surface: dark charcoal metal with enough roughness to retain readable highlights.
- Track shell: a visible 0.6 to 0.8 world-unit dark outer thickness beneath the U-channel.
- Rims: thick rounded black-metal safety edges with alternating neon yellow and cyan accent segments.
- Marbles: saturated participant colors, bright specular highlights, and a thin emissive-style accent that remains readable under dark lighting.
- Devices: magenta pushers, alternating cyan/orange shuffle pegs, and a dark branch divider with neon edges.
- Lighting: inexpensive hemisphere, directional, and bounded point lights. No full-screen bloom on mobile.
- The existing brown structural support columns are removed completely. Obstacle cylinders remain because they are gameplay elements and use clearly different neon materials.

## Course Sequence

The A-to-12 order and continuous downhill route remain unchanged. New modules are placed on broad sections of the course in this order:

1. tilted circular start bowl and release gate;
2. staggered cylindrical peg shuffler;
3. alternating side pushers;
4. two-path branch and merge;
5. vortex bowl and enclosed lower catch channel;
6. existing finish run.

Each module exposes geometry, render objects, and collider descriptors from one canonical layout so visual and physical representations cannot drift.

## Start Bowl

The launch platform becomes a shallow circular bowl approximately 8.5 world units in radius. It is banked toward a wide outlet connected to the existing launch channel through an overlapping, rounded throat.

- Up to 100 marbles are distributed across concentric launch rings without initial overlap.
- A low three-arm kinematic agitator rotates for about 1.5 seconds while the countdown plays.
- A wide kinematic gate retracts fully after the shuffle interval so the field can leave together rather than through a one-marble chute.
- The countdown/shuffle interval is excluded from race elapsed time.
- The outer bowl wall is higher than two marble diameters and has no sharp internal corners.
- The bowl-to-track joint overlaps physically and visually; it never relies on two perfectly coincident open mesh edges.

## Cylindrical Peg Shuffler

Seven round fixed cylinders form a diagonal staggered bank across an existing wide mixing hall. They alter lateral order through genuine sphere collisions.

- Marble radius remains 0.34, so diameter is 0.68 world units.
- Clear surface-to-surface space between every pair of cylinders is at least three marble diameters: 2.04 world units.
- Clearance from every cylinder to an outer wall or divider is also at least 2.04 world units.
- Cylinders have rounded caps and no box corners.
- The diagonal alternates its offset so no straight center corridor bypasses the entire device.
- Static validation checks every pairwise and wall clearance before a track can be built.

## Alternating Pushers

Two rounded kinematic paddles enter from opposite sides in a separate broad section.

- Their motion is sinusoidal and updated at the physics fixed step.
- Phase offset is 180 degrees so only one paddle reaches its deepest point at a time.
- At every animation phase, at least one route wider than 2.04 world units remains open.
- Paddle faces and tips are rounded. Travel endpoints do not create pockets against the wall.
- Motion is capped to avoid tunneling and violent launches; Rapier kinematic position updates provide the collision response.
- Rendering reads the same transforms used by the colliders.

## Branch and Merge

The branch uses the existing continuous wide floor instead of splitting the base surface into disconnected meshes. Curved inner rails form two lanes and then taper back into one.

- The short lane is physically shorter and includes pusher exposure, making it fast but variable.
- The long lane uses a gentle S corridor without a pusher, making it slower but stable.
- Both lanes preserve downhill grade and high outside containment.
- Rail noses, tails, and merge tips are round capsules rather than wedges.
- The merge widens before converging so two groups cannot form a hard opposing plug.
- No floor seam or jump is introduced at fork or merge boundaries.

## Vortex Bowl

After the branch merge, marbles enter a broad circular vortex bowl inspired by the supplied carved-wood reference. The bowl is part of the race route, not an elimination hole.

- The outlet diameter is exactly two marble diameters: 1.36 world units.
- The vertical drop from the outer entry rim to the outlet is 1.36 world units.
- The outlet is slightly eccentric so incoming marbles naturally orbit instead of colliding head-on at the center.
- The outlet lip is smoothly rounded and contains no vertical ledge that can hold a sphere.
- A fully enclosed half-tunnel catch channel begins below the opening and curves back into the remaining track.
- The outer bowl wall is high enough to contain impacts from the full field.
- The bowl is large enough to accept a temporary queue of 100 marbles without overflow.
- Validation treats a marble as stuck only when its speed remains below the stall threshold for the configured stall window. Slow orbiting is valid movement.

## Camera Direction

Production camera work follows marbles closely instead of framing the whole structure from outside.

- Start: a close establishing view shows the bowl shuffle and opening gate.
- Leading progress 0 to 50 percent: the camera stays 6 to 9 world units ahead of the leading live marble and looks backward toward it, with enough elevation to show the immediate obstacle.
- Leading progress 50 to 75 percent: the target rank moves gradually backward through the field rather than jumping directly from first to last.
- After 75 percent: the camera targets the slowest unfinished marble.
- Final phase: the last live marble stays centered through the finish, preserving the existing finish latch.
- Rank-target changes use hysteresis and a minimum hold interval. Position, look target, and track-frame orientation use damped interpolation.
- Wide exterior shots are limited to the start introduction and very short device transitions.
- Pointer drag, touch drag, and wheel zoom remain additive offsets on the directed camera.
- Camera objects do not participate in physics and allocate no new vectors in the frame loop.

## Architecture

### Canonical feature layout

Extend the track feature configuration with immutable layouts for the start bowl, pegs, pushers, branch rails, and vortex. Layout values are used by generation, validation, rendering, headless physics tests, and the production scene.

### Static geometry and colliders

The thick visual shell is a render-only extrusion derived from the existing channel edge vertices. The authoritative drive surface remains the validated U-channel mesh. Pegs, branch rails, bowl surfaces, and catch channel use fixed colliders. Rounded obstacle primitives use Rapier cylinders or capsules where possible; complex bowl surfaces use indexed trimeshes generated from canonical buffers.

### Dynamic devices

The start agitator, release gate, and pushers are kinematic position-based bodies. One device controller owns their fixed-step phase and writes the same pose to Rapier and Three.js. Reset, restart-remaining, and dispose restore or free every device deterministically.

### Scene integration

The scene builds one track resource bundle containing the base track and obstacle modules. Race start resets device phases, waits for the start shuffle, opens the gate, then starts elapsed race timing. Remaining-marble restarts skip the 100-marble bowl layout and use a safe open-gate configuration.

## Safety and Validation

### Static checks

- no non-finite vertices or degenerate obstacle triangles;
- continuous base track validation remains green;
- bowl and catch-channel joints overlap without open collision gaps;
- peg-to-peg and peg-to-wall clearances are at least 2.04;
- every pusher phase leaves an open route at least 2.04 wide;
- branch rails have round ends, no inward pocket, and a merge opening at least 2.04 wide;
- vortex outlet diameter and rim-to-outlet drop both equal 1.36 within tolerance;
- visual and collider layouts share the same canonical measurements.

### Dynamic checks

- run 100 marbles across the existing ten fixed seeds;
- require zero escapes;
- require zero marbles stationary below the stall threshold for the stall window;
- require unique finish IDs for marbles that finish;
- record finish count and elapsed distribution for observation only;
- do not fail a run solely because one or more moving marbles exceed 60 seconds;
- verify the start gate, agitator, pushers, branch, vortex, reset, and remaining-marble restart lifecycle.

The headless harness receives the same fixed-step device controller as production. No test-only guide forces, impulses, teleportation, or recovery rails are permitted.

## Mobile Performance

- Keep one instanced marble mesh per participant color.
- Render pegs and repeated accent pieces with instancing.
- Use low-segment cylinders and capsules, shared geometries, and shared materials.
- Disable shadows on the existing mobile quality profile.
- Avoid EffectComposer and full-screen post-processing.
- Avoid per-frame allocations in camera and device updates.
- Maintain a measured target of at least 30 FPS at a 360 by 800 viewport with 100 active marbles.

## Acceptance

- Structural support columns are absent.
- The track reads as dark, thick, and neon-accented.
- Start bowl visibly shuffles and releases up to 100 marbles into the continuous route.
- Pegs, pushers, branch choice, and vortex produce observable order changes.
- Peg openings and guaranteed pusher/merge passages meet the 2.04 clearance requirement.
- Vortex outlet and vertical drop meet the 1.36 requirement.
- No fixed-seed run reports an escape or stall; moving marbles are not rejected for exceeding a target duration.
- Camera follows the leader early, walks backward through ranks after halfway, and holds the final trailing marble.
- Touch and mouse camera controls remain functional.
- Focused tests, the full suite, production build, and desktop/mobile browser acceptance pass before pushing `main`.

## Deployment

After implementation and review, fast-forward the verified work into `main` and push `origin/main`. Cloudflare performs the deployment automatically; deployment success is confirmed by the user.
