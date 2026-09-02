# Lucky Roll Continuous Marble Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current platform-like race course with a tested, continuous A-to-12 three-level U-channel that safely carries 100 marbles in 45–60 seconds.

**Architecture:** An immutable `TrackSpec` defines the route once. A sampler turns it into arc-length-spaced local frames, a sweep generator creates one U-channel triangle mesh, and the identical vertex/index buffers feed Three.js and Rapier. Static validation and a headless deterministic Rapier harness must pass before the scene enables presentation, mixing features, or emergency recovery.

**Tech Stack:** TypeScript 5.9, Three.js 0.170, Rapier 3D 0.17, React 19, Vite 7, Vitest 3

**Spec:** `docs/superpowers/specs/2026-09-02-continuous-marble-track-design.md`

## Global Constraints

- The numbered A-to-12 image is authoritative for top-down route and checkpoint order.
- The track is one connected U-channel passing through three height bands; platforms and gap jumps are forbidden.
- Normal completion target is 45–60 seconds with a hard timeout at 60 seconds.
- Baseline validation runs with guide force, respawn, anti-stuck impulse, splitter, and powered obstacles disabled.
- Ten deterministic runs of 100 marbles must finish within 60 simulated seconds with zero escape and zero three-second stall.
- Render geometry and Rapier collision geometry must use the same position and index buffers.
- Mobile target is at least 30 fps with 100 marbles and fewer than 150,000 static track triangles.
- All visible UI copy remains English.
- Each independently passing stage is committed and pushed to `origin/main` for Cloudflare mobile review.

## File Structure

- Create `src/react-app/game/track/trackTypes.ts` — shared immutable track, sample, geometry, and validation types.
- Create `src/react-app/game/track/trackSpec.ts` — approved A-to-12 control nodes and launch grid settings.
- Create `src/react-app/game/track/trackSpec.test.ts` — checkpoint, level, and launch-bay contracts.
- Create `src/react-app/game/track/trackSampler.ts` — arc-length centerline sampling and local frames.
- Create `src/react-app/game/track/trackSampler.test.ts` — continuity, grade, spacing, and curvature tests.
- Create `src/react-app/game/track/trackGeometry.ts` — U-profile sweep and triangle buffers.
- Create `src/react-app/game/track/trackGeometry.test.ts` — cross-section, index, and continuity tests.
- Create `src/react-app/game/track/trackValidation.ts` — structured static validation.
- Create `src/react-app/game/track/trackValidation.test.ts` — one failure case per validation rule.
- Create `src/react-app/game/track/trackBuild.ts` — canonical spec → samples → geometry → validation assembly.
- Create `src/react-app/game/track/trackPhysics.ts` — Rapier collider, start positions, finish/progress projection.
- Create `src/react-app/game/track/trackPhysics.test.ts` — single-marble and 100-marble deterministic validation.
- Create `src/react-app/game/track/trackRender.ts` — Three.js track mesh, supports, markings, and debug overlays.
- Create `src/react-app/game/track/trackRender.test.ts` — render geometry identity and object-count tests.
- Modify `src/react-app/game/MarbleRaceScene.ts` — consume generated track; remove flat deck, box rails, and normal guide force.
- Modify `src/react-app/game/cameraPlan.ts` — overview, leader, trailer, and finish shots for the new bounds.
- Modify `src/react-app/game/cameraPlan.test.ts` — assert all shots frame the new course.
- Modify `src/react-app/App.css` — bright arcade presentation after geometry acceptance.
- Modify `README.md` — validation commands and track-debug URL.
- Delete `src/react-app/game/trackLayout.ts` and `src/react-app/game/trackLayout.test.ts` only after scene migration passes.

---

### Task 1: Lock the A-to-12 Track Specification

**Files:**
- Create: `src/react-app/game/track/trackTypes.ts`
- Create: `src/react-app/game/track/trackSpec.ts`
- Create: `src/react-app/game/track/trackSpec.test.ts`

**Interfaces:**
- Produces: `Vec3`, `LaunchSlot`, `TrackZone`, `TrackNode`, `TrackSpec`, `TrackSample`, `TrackGeometry`, `TrackValidationFailure`, `createLuckyRollTrackSpec(options?: { features?: boolean })`, `createLaunchSlots()`.
- Consumes: no new project interfaces.

- [ ] **Step 1: Define the failing specification tests**

```ts
import { describe, expect, it } from "vitest";
import { createLaunchSlots, createLuckyRollTrackSpec } from "./trackSpec";

describe("Lucky Roll track specification", () => {
  it("orders the authoritative checkpoints from A through 12", () => {
    const checkpoints = createLuckyRollTrackSpec().nodes
      .flatMap((node) => node.checkpoint ? [node.checkpoint] : []);
    expect(checkpoints).toEqual(["A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });

  it("uses three descending height bands connected by descent nodes", () => {
    const spec = createLuckyRollTrackSpec();
    expect(new Set(spec.nodes.flatMap((node) => node.level ? [node.level] : []))).toEqual(new Set([1, 2, 3]));
    expect(spec.nodes.filter((node) => node.zone === "descent")).toHaveLength(2);
    expect(spec.nodes.every((node, index) => index === 0 || node.position.y < spec.nodes[index - 1].position.y)).toBe(true);
  });

  it("fits 100 simultaneous starts inside the launch U-channel", () => {
    const slots = createLaunchSlots(100);
    expect(slots).toHaveLength(100);
    expect(new Set(slots.map((slot) => `${slot.x}:${slot.z}`)).size).toBe(100);
    expect(slots.every((slot) => Math.abs(slot.crossOffset) <= 8.1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the specification test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackSpec.test.ts`

Expected: FAIL because `trackSpec.ts` does not exist.

- [ ] **Step 3: Add shared types and the approved node data**

```ts
// trackTypes.ts
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type LaunchSlot = Vec3 & Readonly<{ crossOffset: number; row: number; column: number }>;
export type TrackZone = "launch" | "run" | "descent" | "mixing-hall" | "splitter" | "finish";
export type TrackNode = Readonly<{
  id: string;
  checkpoint?: "A" | `${number}`;
  level?: 1 | 2 | 3;
  position: Vec3;
  width: number;
  channelDepth: number;
  bankRadians: number;
  zone: TrackZone;
}>;
export type TrackSpec = Readonly<{ nodes: readonly TrackNode[]; sampleSpacing: number; profileSegments: number }>;
export type TrackSample = Readonly<{
  index: number; distance: number; position: Vec3; tangent: Vec3; side: Vec3; up: Vec3;
  width: number; channelDepth: number; bankRadians: number; zone: TrackZone;
}>;
export type TrackGeometry = Readonly<{
  positions: Float32Array; normals: Float32Array; indices: Uint32Array;
  samples: readonly TrackSample[]; profileSegments: number; triangleCount: number;
}>;
export type TrackValidationFailure = Readonly<{
  code: "checkpoint-order" | "sample-gap" | "uphill" | "tight-turn" | "degenerate-triangle" | "winding" | "disconnected" | "clearance" | "rail-gap" | "finish-entry";
  sampleIndex?: number; message: string;
}>;
```

```ts
// trackSpec.ts — guide nodes round hairpins without adding checkpoints.
const nodes: readonly TrackNode[] = [
  node("A", "A", 3, 0, 28.0, 72, 18, 2.8, "launch"),
  node("1", "1", 3, -30, 27.2, 72, 16, 2.6, "launch"),
  node("2", "2", 3, -34, 25.9, 34, 12, 2.3, "run"),
  node("3", "3", 3, 30, 24.5, 26, 12, 2.3, "run"),
  node("4", "4", 3, 31, 22.8, -34, 12, 2.4, "run"),
  node("4-bend", undefined, undefined, 43, 21.0, -28, 12, 2.5, "run"),
  node("4-drop", undefined, undefined, 40, 18.1, 5, 13, 2.6, "descent"),
  node("5", "5", 2, 27, 16.8, 7, 13, 2.5, "run"),
  node("6", "6", 2, -7, 15.5, 5, 16, 2.7, "mixing-hall"),
  node("7", "7", 2, -25, 14.2, 15, 13, 2.5, "run"),
  node("8", "8", 2, -24, 12.6, 48, 12, 2.4, "run"),
  node("8-drop", undefined, undefined, -14, 10.8, 51, 12, 2.5, "descent"),
  node("9", "9", 1, -6, 9.4, 35, 12, 2.4, "run"),
  node("10", "10", 1, 14, 7.8, 21, 16, 2.7, "mixing-hall"),
  node("10-bend", undefined, undefined, 28, 6.7, 12, 13, 2.5, "run"),
  node("10-return", undefined, undefined, 17, 5.8, 1, 12, 2.4, "run"),
  node("11", "11", 1, 5, 4.6, 48, 12, 2.4, "run"),
  node("12", "12", 1, -4, 3.0, 64, 14, 2.6, "finish"),
];
```

Implement `node()` as a typed constructor, return a fresh immutable spec from `createLuckyRollTrackSpec(options)`, and return a centered 10-by-10 launch grid from `createLaunchSlots(count)`. The initial `features` option defaults to `false`; Task 7 makes it switch checkpoint-10 guide nodes to the `splitter` zone without changing checkpoint order.

- [ ] **Step 4: Run the specification tests**

Run: `npm test -- --run src/react-app/game/track/trackSpec.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push the immutable track specification**

```bash
git add src/react-app/game/track/trackTypes.ts src/react-app/game/track/trackSpec.ts src/react-app/game/track/trackSpec.test.ts
git commit -m "feat: define A-to-12 track specification"
git push origin main
```

---

### Task 2: Sample a Smooth, Monotonic Centerline

**Files:**
- Create: `src/react-app/game/track/trackSampler.ts`
- Create: `src/react-app/game/track/trackSampler.test.ts`

**Interfaces:**
- Consumes: `TrackSpec`, `TrackSample`, and `Vec3` from `trackTypes.ts`.
- Produces: `sampleTrack(spec: TrackSpec): readonly TrackSample[]` and `projectToTrack(position: Vec3, samples: readonly TrackSample[]): { sampleIndex: number; progress: number; distanceSquared: number }`.

- [ ] **Step 1: Write failing centerline tests**

```ts
describe("track centerline sampler", () => {
  const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const maxHeadingDelta = (items: readonly TrackSample[]) => Math.max(...items.slice(1).map((sample, index) => {
    const previous = items[index];
    const a = Math.atan2(previous.tangent.z, previous.tangent.x);
    const b = Math.atan2(sample.tangent.z, sample.tangent.x);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  }));
  const samples = sampleTrack(createLuckyRollTrackSpec());

  it("samples the route at stable arc-length intervals", () => {
    const gaps = samples.slice(1).map((sample, index) => distance(sample.position, samples[index].position));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1.1);
    expect(Math.min(...gaps.slice(0, -1))).toBeGreaterThanOrEqual(0.75);
  });

  it("never creates an uphill sample", () => {
    expect(samples.every((sample, index) => index === 0 || sample.position.y < samples[index - 1].position.y)).toBe(true);
  });

  it("keeps adjacent tangents below the maximum heading change", () => {
    expect(maxHeadingDelta(samples)).toBeLessThan(0.16);
  });

  it("projects A and 12 to opposite progress endpoints", () => {
    expect(projectToTrack(samples[0].position, samples).progress).toBe(0);
    expect(projectToTrack(samples[samples.length - 1].position, samples).progress).toBe(1);
  });
});
```

- [ ] **Step 2: Run the sampler test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackSampler.test.ts`

Expected: FAIL because `sampleTrack` is missing.

- [ ] **Step 3: Implement horizontal spline sampling and monotonic height interpolation**

Use `THREE.CatmullRomCurve3` with `curveType = "centripetal"` for X/Z only. Generate an oversampled curve with 64 samples per node interval, measure cumulative horizontal length, and interpolate positions at `spec.sampleSpacing` intervals. Compute Y from a strictly decreasing piecewise-linear interpolation between node heights using the same normalized cumulative node distance. Interpolate width, depth, bank, and zone from the enclosing node interval.

For each sample:

```ts
const tangent = normalize(subtract(next.position, previous.position));
const horizontalSide = normalize({ x: -tangent.z, y: 0, z: tangent.x });
const bankedSide = rotateAroundAxis(horizontalSide, tangent, bankRadians);
const up = normalize(cross(tangent, bankedSide));
```

`projectToTrack()` scans samples for the lowest squared distance and returns `sampleIndex / (samples.length - 1)` as progress. This replaces all Z-based ranking and finish assumptions.

- [ ] **Step 4: Run sampler and existing tests**

Run: `npm test -- --run src/react-app/game/track/trackSampler.test.ts src/react-app/game/trackLayout.test.ts`

Expected: new sampler tests PASS; legacy layout tests still PASS until migration.

- [ ] **Step 5: Commit and push the centerline sampler**

```bash
git add src/react-app/game/track/trackSampler.ts src/react-app/game/track/trackSampler.test.ts
git commit -m "feat: sample continuous downhill track centerline"
git push origin main
```

---

### Task 3: Sweep the Half-Tunnel U-Channel

**Files:**
- Create: `src/react-app/game/track/trackGeometry.ts`
- Create: `src/react-app/game/track/trackGeometry.test.ts`

**Interfaces:**
- Consumes: `readonly TrackSample[]` and `TrackSpec.profileSegments`.
- Produces: `generateTrackGeometry(samples: readonly TrackSample[], profileSegments: number): TrackGeometry`.

- [ ] **Step 1: Write failing U-channel geometry tests**

```ts
describe("U-channel geometry", () => {
  const spec = createLuckyRollTrackSpec();
  const samples = sampleTrack(spec);
  const geometry = generateTrackGeometry(samples, spec.profileSegments);
  const rowSize = spec.profileSegments + 1;

  it("generates one complete profile row per centerline sample", () => {
    expect(geometry.positions.length / 3).toBe(samples.length * rowSize);
    expect(geometry.indices.length).toBe((samples.length - 1) * spec.profileSegments * 6);
  });

  it("places the center below both containment edges", () => {
    const firstRow = readProfileRow(geometry, 0);
    const center = firstRow[Math.floor(firstRow.length / 2)];
    expect(firstRow[0].y - center.y).toBeGreaterThanOrEqual(2.5 * 0.68);
    expect(firstRow[firstRow.length - 1].y - center.y).toBeGreaterThanOrEqual(2.5 * 0.68);
  });

  it("shares every profile row between adjacent strips", () => {
    expect(countConnectedComponents(geometry)).toBe(1);
  });

  it("stays below the mobile triangle budget", () => {
    expect(geometry.triangleCount).toBeLessThan(150_000);
  });
});
```

Define `readProfileRow()` inside the test by reading `(sampleIndex * rowSize + column) * 3` from `positions`. Define `countConnectedComponents()` inside the test by building an undirected adjacency map from every triangle index and running a stack-based traversal from the first referenced vertex.

- [ ] **Step 2: Run the geometry test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackGeometry.test.ts`

Expected: FAIL because `generateTrackGeometry` is missing.

- [ ] **Step 3: Implement the profile sweep**

For profile column `column` in `0…profileSegments`, use:

```ts
const t = column / profileSegments;
const angle = -Math.PI / 2 + Math.PI * t;
const lateral = Math.sin(angle) * sample.width / 2;
const lift = sample.channelDepth * (1 - Math.cos(angle));
const position = add(sample.position, add(scale(sample.side, lateral), scale(sample.up, lift)));
```

Write each row once. Join adjacent rows with two consistently wound triangles per profile cell. Calculate vertex normals by accumulating normalized triangle normals and normalizing once at the end. Return typed buffers and `indices.length / 3` as `triangleCount`.

- [ ] **Step 4: Run the geometry test**

Run: `npm test -- --run src/react-app/game/track/trackGeometry.test.ts`

Expected: all U-channel tests PASS.

- [ ] **Step 5: Commit and push the shared U-channel geometry**

```bash
git add src/react-app/game/track/trackGeometry.ts src/react-app/game/track/trackGeometry.test.ts
git commit -m "feat: generate continuous U-channel geometry"
git push origin main
```

---

### Task 4: Reject Broken Tracks Before Browser Testing

**Files:**
- Create: `src/react-app/game/track/trackValidation.ts`
- Create: `src/react-app/game/track/trackValidation.test.ts`
- Create: `src/react-app/game/track/trackBuild.ts`

**Interfaces:**
- Consumes: `TrackSpec`, `readonly TrackSample[]`, and `TrackGeometry`.
- Produces: `validateTrack(spec, samples, geometry): readonly TrackValidationFailure[]`, `assertValidTrack(...)`, and `buildValidatedTrack(options?: { features?: boolean }): BuiltTrack` where `BuiltTrack` contains `{ spec, samples, geometry }`.

- [ ] **Step 1: Write one failing test per failure code**

```ts
describe("static track validation", () => {
  const valid = buildTrackFixture();

  it("accepts the canonical A-to-12 U-channel", () => {
    expect(validateTrack(valid.spec, valid.samples, valid.geometry)).toEqual([]);
  });

  it.each([
    ["checkpoint-order", reverseCheckpoints],
    ["sample-gap", insertSampleGap],
    ["uphill", insertUphillSample],
    ["tight-turn", insertHairpin],
    ["degenerate-triangle", duplicateTriangleVertex],
    ["winding", flipTriangle],
    ["disconnected", detachProfileRow],
    ["clearance", overlapCrossingLevels],
    ["rail-gap", lowerOneChannelEdge],
    ["finish-entry", moveFinishBesideStart],
  ])("reports %s with a sample location", (code, mutate) => {
    const broken = mutate(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, message: expect.any(String) })]),
    );
  });
});
```

Create `buildTrackFixture()` in the test by calling the canonical spec, sampler, and geometry generator. Each mutation helper returns cloned arrays: reverse checkpoint fields for `reverseCheckpoints`; translate one sample by two sample spacings for `insertSampleGap`; raise one Y coordinate above its predecessor for `insertUphillSample`; rotate one tangent by 0.5 radians for `insertHairpin`; copy vertex zero over vertex one for `duplicateTriangleVertex`; swap the first triangle's second and third indices for `flipTriangle`; offset the middle profile row indices to unreferenced cloned vertices for `detachProfileRow`; move a non-neighbor upper sample to 2 units above a lower sample for `overlapCrossingLevels`; lower one edge vertex to the center height for `lowerOneChannelEdge`; and move the finish node to the start position and height for `moveFinishBesideStart`.

- [ ] **Step 2: Run the validation test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackValidation.test.ts`

Expected: FAIL because `validateTrack` is missing.

- [ ] **Step 3: Implement structured validation**

Implement pure checks with these exact thresholds:

- checkpoint sequence equals `A,1,…,12`;
- adjacent sample distance is `> 0` and `<= sampleSpacing * 1.1`;
- every next sample Y is lower by at least `0.0001`;
- adjacent horizontal heading delta is `< 0.16` radians;
- every triangle area is `> 0.000001`;
- all adjacent strip triangles have consistent winding;
- index adjacency traversal reaches every vertex referenced by an index;
- non-neighbor samples within one full track width in X/Z have at least 5 world units vertical clearance;
- both edge columns remain at least `2.5 * 0.68` above the profile center;
- finish is within two sample spacings of the last sample and at least 25% of total course length from the start in spatial distance or separated by 5 vertical units.

`assertValidTrack()` throws one error containing all formatted failure messages.

Add `buildValidatedTrack()` in `trackBuild.ts`; it calls `createLuckyRollTrackSpec(options)`, `sampleTrack()`, `generateTrackGeometry()`, and `assertValidTrack()` in that order, then returns the same validated objects without regenerating buffers.

- [ ] **Step 4: Run all track unit tests**

Run: `npm test -- --run src/react-app/game/track`

Expected: Track specification, sampler, geometry, and validation tests PASS.

- [ ] **Step 5: Commit and push the static validation gate**

```bash
git add src/react-app/game/track/trackValidation.ts src/react-app/game/track/trackValidation.test.ts src/react-app/game/track/trackBuild.ts
git commit -m "test: validate continuous track geometry"
git push origin main
```

---

### Task 5: Prove the Track with Headless Rapier Simulation

**Files:**
- Create: `src/react-app/game/track/trackPhysics.ts`
- Create: `src/react-app/game/track/trackPhysics.test.ts`

**Interfaces:**
- Consumes: `TrackGeometry`, `readonly TrackSample[]`, `createLaunchSlots()`, Rapier world APIs.
- Produces: `createTrackCollider(world, geometry)`, `createMarbleBodies(world, slots)`, `runValidationRace(options): Promise<ValidationRaceResult>`.

```ts
type ValidationRaceResult = Readonly<{
  seed: number;
  finishOrder: readonly number[];
  finishTimesMs: readonly number[];
  escapes: readonly MarbleFailure[];
  stalls: readonly MarbleFailure[];
}>;
```

- [ ] **Step 1: Write failing single-marble and soak tests**

```ts
describe.sequential("headless track physics", () => {
  it("rolls one marble from A through 12 using gravity only", async () => {
    const result = await runValidationRace({ seed: 1, marbleCount: 1, durationSeconds: 60 });
    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("finishes 100 marbles for ten deterministic seeds without recovery", async () => {
    for (const seed of [11, 23, 37, 41, 53, 67, 71, 83, 97, 101]) {
      const result = await runValidationRace({ seed, marbleCount: 100, durationSeconds: 60 });
      expect(result.escapes, `seed ${seed}`).toEqual([]);
      expect(result.stalls, `seed ${seed}`).toEqual([]);
      expect(new Set(result.finishOrder).size, `seed ${seed}`).toBe(100);
      expect(result.finishOrder, `seed ${seed}`).toHaveLength(100);
    }
  }, 180_000);
});
```

- [ ] **Step 2: Run the physics test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackPhysics.test.ts`

Expected: FAIL because the physics harness is missing.

- [ ] **Step 3: Implement the shared collider and fixed-step harness**

Initialize `@dimforge/rapier3d-compat` once. Create one fixed rigid body and one trimesh collider directly from `geometry.positions` and `geometry.indices`. Use gravity `{ x: 0, y: -16, z: 0 }`, timestep `1 / 60`, marble radius `0.34`, restitution `0.08`, friction `0.24`, linear damping `0.02`, and angular damping `0.04`.

At each step:

```ts
const projection = projectToTrack(body.translation(), samples);
const escaped = distanceSquaredToSample(body.translation(), samples[projection.sampleIndex]) > escapeRadiusSquared;
const stalled = speed(body.linvel()) < 0.12 && stationaryMs[marbleId] >= 3_000;
const finished = projection.progress >= 0.995 && insideFinishVolume(body.translation(), samples[samples.length - 1]);
```

Implement `speed()` as `Math.hypot(x, y, z)`, `distanceSquaredToSample()` as squared XYZ distance, and `insideFinishVolume()` as a 4-unit horizontal radius plus a Y range from the channel center to channel center plus twice its depth. Do not apply force, impulse, teleport, or respawn. Record failures with seed, marble number, elapsed time, position, nearest sample, and category. Tune only node heights, widths, channel depth, curve guide nodes, friction, and restitution until both tests pass.

- [ ] **Step 4: Run the complete physics validation twice**

Run twice: `npm test -- --run src/react-app/game/track/trackPhysics.test.ts`

Expected on both runs: 2 tests PASS with identical finish orders per seed.

- [ ] **Step 5: Commit and push the physics-proven baseline**

```bash
git add src/react-app/game/track/trackPhysics.ts src/react-app/game/track/trackPhysics.test.ts src/react-app/game/track/trackSpec.ts
git commit -m "test: prove 100-marble track completion"
git push origin main
```

---

### Task 6: Replace the Scene’s Flat Ribbon and Box Rails

**Files:**
- Create: `src/react-app/game/track/trackRender.ts`
- Create: `src/react-app/game/track/trackRender.test.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Delete: `src/react-app/game/trackLayout.ts`
- Delete: `src/react-app/game/trackLayout.test.ts`

**Interfaces:**
- Consumes: canonical spec, samples, geometry, validator, collider, launch slots, and `projectToTrack()`.
- Produces: `createTrackRenderGroup(geometry, options): THREE.Group`, `createTrackDebugGroup(...)`, and a migrated `createRaceScene()`. Consumes `buildValidatedTrack()` from Task 4 as the only scene construction entry point.

- [ ] **Step 1: Write the failing render identity test**

```ts
describe("track renderer", () => {
  it("uses the exact validated buffers for one primary track mesh", () => {
    const built = buildValidatedTrack();
    const group = createTrackRenderGroup(built.geometry, { debug: false });
    const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const trackMesh = meshes.find((mesh) => mesh.name === "continuous-u-channel")!;
    const rendered = trackMesh.geometry as THREE.BufferGeometry;
    expect(rendered.getAttribute("position").array).toBe(built.geometry.positions);
    expect(rendered.index!.array).toBe(built.geometry.indices);
  });
});
```

- [ ] **Step 2: Run the render test and verify it fails**

Run: `npm test -- --run src/react-app/game/track/trackRender.test.ts`

Expected: FAIL because `createTrackRenderGroup` is missing.

- [ ] **Step 3: Implement rendering from the shared buffers**

Create one `THREE.BufferGeometry`, attach the existing typed arrays without copying, and render with a bright aqua/wood material plus dark rim accents. Supports are decorative instanced cylinders placed every 15 samples and do not receive collision bodies. Debug mode adds centerline, tangent, normal, checkpoint, and zone-boundary helpers.

- [ ] **Step 4: Migrate `MarbleRaceScene`**

At scene construction, call `buildValidatedTrack()` to create spec, samples, geometry, and run `assertValidTrack()`. Replace `addContinuousDeck()`, `addTrackSegment()`, `renderContinuousCourse()`, `createRailOffsets()`, `createSafetyRail()`, and `getDownhillGuide()` with the shared renderer/collider/projector.

During production updates:

```ts
const projection = projectToTrack(body.translation(), track.samples);
ball.progress = projection.progress;
```

Finish only at progress `>= 0.995` inside the final finish volume. Re-enable respawn and anti-stuck recovery only after this integration passes the headless baseline. Remove the legacy layout files after imports reach zero.

- [ ] **Step 5: Run all tests and production build**

Run: `npm test -- --run`

Run: `npm run build`

Expected: all tests PASS; TypeScript and Vite build PASS; no import references to `trackLayout` remain.

- [ ] **Step 6: Commit and push the scene migration**

```bash
git add src/react-app/game/track src/react-app/game/MarbleRaceScene.ts
git add -u src/react-app/game/trackLayout.ts src/react-app/game/trackLayout.test.ts
git commit -m "feat: render and collide one continuous U-channel"
git push origin main
```

---

### Task 7: Add a Safe Mixing Hall and Splitter

**Files:**
- Modify: `src/react-app/game/track/trackTypes.ts`
- Modify: `src/react-app/game/track/trackSpec.ts`
- Modify: `src/react-app/game/track/trackGeometry.ts`
- Modify: `src/react-app/game/track/trackGeometry.test.ts`
- Modify: `src/react-app/game/track/trackPhysics.ts`
- Modify: `src/react-app/game/track/trackPhysics.test.ts`

**Interfaces:**
- Extends: `TrackGeometry` with `featurePositions`, `featureIndices`, and `featureNormals` for one rounded divider.
- Preserves: one connected outer U-channel and all existing validation APIs.

- [ ] **Step 1: Write failing splitter geometry and physics tests**

```ts
it("keeps the splitter inside one widened outer channel", () => {
  const track = buildValidatedTrack({ features: true });
  expect(track.samples.filter((sample) => sample.zone === "splitter").every((sample) => sample.width >= 16)).toBe(true);
  expect(splitterClearance(track.geometry)).toBeGreaterThanOrEqual(2 * 0.68);
  expect(countOuterChannelComponents(track.geometry)).toBe(1);
});

it("preserves the 100-marble ten-seed completion contract", async () => {
  const results = await runValidationSuite({ features: true });
  expect(results.every((result) => result.escapes.length === 0 && result.stalls.length === 0 && result.finishOrder.length === 100)).toBe(true);
}, 180_000);
```

Define `splitterClearance()` in the test as the minimum XZ distance from each divider edge vertex to the nearest outer wall vertex in the same sample row. Define `countOuterChannelComponents()` by running the Task 3 adjacency traversal on only the outer channel indices. Add `runValidationSuite({ features })` to `trackPhysics.ts`; it calls `runValidationRace()` for the ten fixed seeds and returns the ten results.

- [ ] **Step 2: Run the feature tests and verify they fail**

Run: `npm test -- --run src/react-app/game/track/trackGeometry.test.ts src/react-app/game/track/trackPhysics.test.ts`

Expected: FAIL because splitter buffers and feature mode are missing.

- [ ] **Step 3: Implement one rounded divider inside the checkpoint-10 hall**

Widen the checkpoint-10 region to 16 units through interpolated node widths. Generate a capsule-shaped central divider whose nose begins after the channel reaches full width and whose tail ends before narrowing begins. Keep at least two marble diameters between each divider side and its closest U wall. Add the divider buffers to the same fixed Rapier body as a second trimesh collider. Do not add separate outer tracks.

- [ ] **Step 4: Tune only geometry until all static and physics validation passes**

Run: `npm test -- --run src/react-app/game/track`

Expected: all track tests PASS, including ten seeds with the splitter enabled.

- [ ] **Step 5: Commit and push the rank-mixing geometry**

```bash
git add src/react-app/game/track
git commit -m "feat: add safe U-channel mixing splitter"
git push origin main
```

---

### Task 8: Add Debug Views, Camera Framing, and Bright Arcade Presentation

**Files:**
- Modify: `src/react-app/game/track/trackRender.ts`
- Modify: `src/react-app/game/cameraPlan.ts`
- Modify: `src/react-app/game/cameraPlan.test.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/App.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: track bounds, samples, checkpoints, and `?trackDebug=1`.
- Produces: `getTrackBounds(samples): { center: Vec3; radius: number }`, fixed overview/side/profile debug cameras, and production overview/leader/trailer/finish shots.

- [ ] **Step 1: Write failing camera-bound tests**

```ts
it.each(["overview", "side", "profile", "leader", "trailer", "finish"] as const)("frames the %s shot inside the track bounds", (name) => {
  const canonicalTrackBounds = getTrackBounds(buildValidatedTrack().samples);
  const isFiniteVec3 = (value: Vec3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
  const shot = getCameraShot(name, canonicalTrackBounds);
  expect(isFiniteVec3(shot.position)).toBe(true);
  expect(isFiniteVec3(shot.lookAt)).toBe(true);
  expect(shot.near).toBeLessThan(shot.far);
  expect(shot.far).toBeGreaterThan(canonicalTrackBounds.radius * 2);
});
```

- [ ] **Step 2: Run camera tests and verify they fail**

Run: `npm test -- --run src/react-app/game/cameraPlan.test.ts`

Expected: FAIL because named track-bound shots are not implemented.

- [ ] **Step 3: Implement debug and production camera plans**

Compute overview distance from the generated bounding sphere. The debug query parameter exposes buttons for top, side, and profile views and pauses the race. Production alternates overview, leader, and trailer framing, then settles on the finish approach during the final 15% of progress. Existing drag, touch, wheel, and pinch offsets apply after the base shot.

- [ ] **Step 4: Apply the reference presentation without changing physics**

Use a pale cyan-to-cream scene background, bright aqua or light wood U-channel surface, dark striped rim accents, basic-material marble markings, and compact English HUD. Remove fog or set its far distance beyond the overview camera. Keep track-debug lines visible above materials.

- [ ] **Step 5: Document local validation**

Add these exact commands and URLs to `README.md`:

```text
npm test -- --run src/react-app/game/track
npm test -- --run
npm run build
http://127.0.0.1:5173/?trackDebug=1
```

- [ ] **Step 6: Run final automated verification**

Run: `npm test -- --run`

Run: `npm run build`

Expected: all tests PASS and production build PASS.

- [ ] **Step 7: Perform required local browser validation**

At `?trackDebug=1`, capture and inspect:

1. top view: A-to-12 order and one connected outer route;
2. side view: three height bands with visible 4-to-5 and 8-to-9 connectors;
3. profile view: U-shaped containment and splitter clearance;
4. race start: all 100 marbles visible after three seconds;
5. race finish: unique 100-marble finish order and no console error.

At a mobile viewport, record the browser performance overlay for a 100-marble run and confirm at least 30 fps. The user performs the final deployed-device acceptance after push.

- [ ] **Step 8: Commit and push the reviewable track build**

```bash
git add src/react-app/game/track src/react-app/game/MarbleRaceScene.ts src/react-app/game/cameraPlan.ts src/react-app/game/cameraPlan.test.ts src/react-app/App.css README.md
git commit -m "feat: finish validated Lucky Roll track experience"
git push origin main
```

---

## Completion Evidence

The implementation is complete only when the final handoff includes:

- the last commit hash pushed to `origin/main`;
- full Vitest pass count;
- successful production build output;
- ten-seed physics summary with finish time range, escape count, and stall count;
- top, side, and profile debug screenshots;
- mobile viewport frame-rate result;
- confirmation that `.codex-remote-attachments/` remained untracked and unmodified.
