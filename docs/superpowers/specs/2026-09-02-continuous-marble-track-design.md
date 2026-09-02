# Lucky Roll Continuous Marble Track Design

## Purpose

Replace the current platform-like course with a single, physically continuous A-to-12 marble track that follows the supplied numbered plan. The track must read as three distinct height levels while remaining one uninterrupted downhill route. Its default cross-section is a half-tunnel U-channel that keeps 100 marbles contained without relying on respawn or anti-stuck recovery.

The track is the only priority in this phase. Obstacles, pushers, presentation effects, and final UI polish are added only after the base track passes geometry, physics, performance, and visual validation.

## Reference Interpretation

- The numbered A-to-12 image is authoritative for the top-down route and checkpoint order.
- The photographed tabletop marble tracks are authoritative for continuous elevation, supported crossings, and connected construction.
- The mobile-game screenshots are authoritative for the bright toy-like arcade presentation, readable marble colors, compact HUD, and close race camera.
- “Three levels” means one route passing through three elevation bands. It does not mean three disconnected platforms.
- A branch is a temporary division inside one widened channel, created by a central splitter, and merges back into the same channel. It is never two independent floating tracks.

## Course Topology

The course is divided into five continuous regions:

1. A-to-4: upper level, including the 100-marble launch bay and initial acceleration.
2. 4-to-5: continuous descending connector from upper to middle level.
3. 5-to-8: middle level with the first safe rank-mixing zone.
4. 8-to-9: continuous descending connector from middle to lower level.
5. 9-to-12: lower level, final rank-mixing zone, tension section, and finish.

The nominal course length is 350 to 450 world units. Its elevation is non-increasing along the full centerline. The normal race should take 45 to 60 seconds, with a hard 60-second timeout retained for production safety.

## Single Source of Geometry

`TrackSpec` is the sole editable description of the track. It contains ordered path nodes with checkpoint identity, position, width, channel depth, banking, and zone type.

```ts
type TrackZone = "launch" | "run" | "descent" | "mixing-hall" | "splitter" | "finish";

type TrackNode = {
  id: "A" | `${number}` | string;
  checkpoint?: "A" | `${number}`;
  position: { x: number; y: number; z: number };
  width: number;
  channelDepth: number;
  bankRadians: number;
  zone: TrackZone;
};

type TrackSpec = {
  nodes: TrackNode[];
  sampleSpacing: number;
  profileSegments: number;
};
```

The centerline is a centripetal Catmull-Rom curve resampled by arc length. Elevation is evaluated separately with a monotonic downhill curve so horizontal smoothing can never introduce an accidental uphill section.

Each centerline sample produces a stable local frame: tangent, side vector, and upward normal. A semicircular U profile is swept through that frame. Width and depth interpolate smoothly between nodes. The same generated triangle data feeds both the Three.js render mesh and one fixed Rapier trimesh collider. The design does not use overlapping box colliders for the floor.

## U-Channel Profile

- The launch bay begins wide enough for a 10-by-10 arrangement of 100 marbles.
- The launch bay narrows gradually into the normal channel; no hard funnel edge is allowed.
- The normal channel is a semicircular trough with at least seven profile vertices across its width.
- Side containment height is at least 2.5 marble diameters.
- The rendered channel and physical collider share identical profile vertices.
- Curves may be banked, but banking changes smoothly and never reduces the inner wall below the containment minimum.
- At crossings, the minimum vertical clearance is 5 world units after accounting for the lower channel wall and marble diameter.

## Rank-Mixing Features

Rank changes come from geometry before powered obstacles are introduced.

- A mixing hall widens the U-channel gradually, reducing the importance of the entry order.
- A short splitter may divide a mixing hall into two lanes with a rounded central island. Both lanes remain inside the same outer U-channel and merge through a gradual taper.
- The baseline track contains no jumps, gaps, launch ramps, holes, or uphill recovery sections.
- Pushers and animated obstacles are a later phase and must be individually disableable for validation.

## Physics Behavior

- Rapier advances with a fixed timestep during validation.
- Marble restitution remains low enough to avoid collision cascades but high enough to make contact readable.
- The validation race disables respawn, anti-stuck impulses, guide forces, and pushers. A passing track must move marbles using gravity and its own continuous grade.
- Production retains respawn and anti-stuck recovery as emergency safeguards, not as normal propulsion.
- An escaped marble respawns at the most recently cleared checkpoint in production. Validation treats the same escape as a failure.
- Finish detection uses progress along the centerline and the final finish volume, never a global Z-coordinate threshold.

## Camera and Presentation

The opening shot shows the complete three-level construction and 100-marble launch bay. During the race, the camera alternates among a readable overview, the leading group, and the trailing group. Pointer drag, touch drag, wheel zoom, and pinch zoom remain available.

The visual direction is a bright mobile arcade toy rather than a dark simulation:

- pale sky or soft gradient background;
- bright wood, aqua, or similarly high-contrast track material;
- dark or striped rim accents that make the U profile readable;
- strongly differentiated marble colors and markings;
- minimal English HUD showing time, leading marble, trailing marble, and finish count.

Presentation changes are accepted only after the debug cameras prove the track geometry.

## Validation Architecture

### Static Geometry Validation

`validateTrackGeometry(spec, geometry)` returns structured failures with node or sample identifiers. It checks:

- exactly one connected track component;
- exact continuity between consecutive samples;
- no degenerate triangles;
- consistent triangle winding and inward-facing channel normals;
- no accidental uphill sample;
- no turn tighter than the configured minimum radius;
- sufficient crossing clearance;
- continuous left and right containment from A through 12;
- checkpoint order exactly A, 1, 2, …, 12;
- finish volume reachable only from the final approach.

Any geometry failure blocks browser testing and blocks a commit marked as a working track.

### Deterministic Physics Validation

The physics harness runs without WebGL so failures are reproducible. It executes ten fixed seeds with 100 marbles per seed and records each marble’s progress, speed, position, escape count, and stationary duration.

The obstacle-free baseline passes only when:

- zero marbles disappear or leave the launch bay during the first three seconds;
- zero marbles leave the U-channel;
- zero marbles remain below the moving-speed threshold for more than three continuous seconds;
- all 100 marbles finish within 60 simulated seconds for every fixed seed;
- no respawn, guide force, or anti-stuck impulse is used;
- finish order contains each marble exactly once.

A failure report includes seed, marble number, elapsed time, world position, nearest track sample, and failure category.

### Visual Validation

Debug mode renders the centerline, sample frames, surface normals, checkpoint labels, clearance volumes, and zone boundaries. Three fixed screenshots are required:

1. top overview showing the A-to-12 plan;
2. side overview showing the three continuous elevation bands and both descending connectors;
3. close profile view showing the U-channel, marble containment, and merge geometry.

The screenshots are inspected before enabling cinematic camera transitions.

### Mobile Performance Validation

With 100 active marbles on a representative mobile viewport:

- target frame rate is at least 30 fps;
- marbles remain instanced by visual style;
- the static course uses one primary render mesh and one primary Rapier trimesh;
- track geometry stays below 150,000 triangles;
- no per-frame track geometry allocation occurs;
- quality settings may reduce shadows and effects but never collision fidelity.

## Delivery Sequence

1. Introduce `TrackSpec`, sampled centerline types, and static validation tests.
2. Encode the approved A-to-12 route and its three monotonic elevation bands.
3. Generate the rendered and physical U-channel from the shared sampled geometry.
4. Add the headless single-marble and 100-marble deterministic physics harness.
5. Tune only track width, curve radius, grade, friction, and restitution until the baseline passes.
6. Add one mixing hall and one short splitter/merge, then rerun all validation.
7. Add debug screenshots and verify the complete route in the local browser.
8. Apply the bright arcade material and camera plan.
9. Commit and push each independently passing stage so mobile feedback can be given from the Cloudflare deployment.

## Non-Goals for the Base-Track Phase

- No jump ramps or intentional airborne sections.
- No powered pushers or rotating obstacles.
- No decorative particle systems that hide the track edge.
- No procedural random track generation.
- No redesign of race scoring, prize allocation, or team split behavior.

## Acceptance

The base track is complete only when the static validator passes, all ten deterministic 100-marble simulations pass without recovery systems, the three debug views visibly match the approved references, the mobile performance target is met, and the user accepts the deployed mobile build.
