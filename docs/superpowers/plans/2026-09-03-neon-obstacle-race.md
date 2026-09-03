# Neon Obstacle Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark, thick neon presentation, a shuffled bowl start, peg shuffler, alternating pushers, safe fast/slow branch, vortex bowl, and leader-to-trailer chase camera to the validated Lucky Roll track.

**Architecture:** Preserve the existing A-to-12 U-channel buffers and build obstacle modules from one immutable canonical layout. Static feature geometry and fixed/kinematic Rapier bodies share placement data with Three.js render objects; a fixed-step controller owns all moving-device poses. The production camera consumes sorted live-marble progress and a track frame to follow the leader early and walk back to the final trailer.

**Tech Stack:** TypeScript, Three.js 0.170, Rapier 3D compat 0.17, React 19, Vitest 3, Vite 7.

**Spec:** `docs/superpowers/specs/2026-09-03-neon-obstacle-race-design.md`

## Global Constraints

- Preserve the canonical continuous A-to-12 base track and its existing indexed collider buffers.
- Remove structural support columns; gameplay cylinders remain.
- Marble radius is `0.34`; diameter is `0.68`.
- Peg-to-peg and peg-to-wall clear surface distance is at least `2.04`.
- Vortex outlet diameter is `1.36`; rim-to-outlet vertical drop is `1.36`.
- Obstacles use fixed or kinematic Rapier collision. No hidden ranking forces, teleportation, guide forces, or recovery rails.
- A moving marble may exceed 60 seconds without failing automated obstacle qualification. The existing 60-second production timeout dialog remains.
- At most ten 100-marble end-to-end physics races may run: seeds `11, 23, 37, 41, 53, 67, 71, 83, 97, 101`, each at most once. Static/unit tests and builds do not consume this budget. Before an eleventh full race, stop and ask the user for validation or authorization.
- Use instancing/shared resources and no full-screen post-processing; mobile target is at least 30 FPS at `360x800` with 100 active marbles.
- All visible UI remains English.
- Do not add or commit `.codex-remote-attachments/`.

## File Structure

- `src/react-app/game/track/obstacleLayout.ts`: immutable measurements, anchors, and layout validation.
- `src/react-app/game/track/obstacleLayout.test.ts`: exact dimensional and clearance contracts.
- `src/react-app/game/track/obstacleGeometry.ts`: thick shell, start bowl, branch rails, vortex, and catch-channel indexed buffers.
- `src/react-app/game/track/obstacleGeometry.test.ts`: finite/indexed/manifold seam and dimension tests.
- `src/react-app/game/track/obstacleRender.ts`: neon render group, instanced pegs, dynamic device meshes, and disposal.
- `src/react-app/game/track/obstacleRender.test.ts`: object identity, material, support removal, and disposal tests.
- `src/react-app/game/track/obstaclePhysics.ts`: fixed colliders, kinematic devices, bowl launch positions, and fixed-step pose controller.
- `src/react-app/game/track/obstaclePhysics.test.ts`: primitive/collider identity, clearance, pose, lifecycle, and non-overlap tests.
- `src/react-app/game/track/obstaclePhysics.validation.test.ts`: the only ten budgeted 100-marble end-to-end qualification races.
- `src/react-app/game/track/trackBuild.ts`: include canonical obstacle resources in a validated build.
- `src/react-app/game/track/trackRender.ts`: remove supports and adopt dark thick base styling.
- `src/react-app/game/track/trackPhysics.ts`: attach obstacle colliders and run the shared device controller in validation.
- `src/react-app/game/cameraPlan.ts`: rank-walk director and track-relative follow pose.
- `src/react-app/game/cameraPlan.test.ts`: phase, hysteresis, final latch, and finite-pose tests.
- `src/react-app/game/MarbleRaceScene.ts`: integrate devices, delayed timer start, tracking camera, neon lighting, reset, and disposal.
- `src/react-app/game/MarbleRaceScene.test.ts`: production seam, lifecycle, and camera wiring tests.
- `src/react-app/App.css`: dark neon race-stage background and legible HUD.
- `README.md`: updated feature and verification notes.
- `.superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md`: immutable count of full 100-marble attempts.

---

### Task 1: Canonical Obstacle Layout and Static Safety Contracts

**Files:**
- Create: `src/react-app/game/track/obstacleLayout.ts`
- Create: `src/react-app/game/track/obstacleLayout.test.ts`
- Modify: `src/react-app/game/track/trackTypes.ts`
- Modify: `src/react-app/game/track/trackBuild.ts`

**Interfaces:**
- Consumes: `TrackSample`, `Vec3`, `BuiltTrack.samples`.
- Produces: `NEON_OBSTACLE_LAYOUT`, `resolveObstacleLayout(samples, layout)`, `validateObstacleLayout(resolved)`.

- [ ] **Step 1: Define tests for exact measurements and safe local placement**

```ts
it("keeps every peg opening at least three marble diameters wide", () => {
  const resolved = resolveObstacleLayout(samples, NEON_OBSTACLE_LAYOUT);
  expect(minimumPegSurfaceGap(resolved.pegs)).toBeGreaterThanOrEqual(2.04);
  expect(minimumPegWallGap(resolved.pegs, resolved.pegHall)).toBeGreaterThanOrEqual(2.04);
});

it("uses the approved vortex dimensions", () => {
  expect(NEON_OBSTACLE_LAYOUT.vortex.outletDiameter).toBe(1.36);
  expect(NEON_OBSTACLE_LAYOUT.vortex.verticalDrop).toBe(1.36);
});

it("leaves a 2.04-wide route at every sampled pusher phase", () => {
  for (let phase = 0; phase <= 1; phase += 0.025) {
    expect(openPusherPassage(resolvePusherPose(NEON_OBSTACLE_LAYOUT.pushers, phase))).toBeGreaterThanOrEqual(2.04);
  }
});
```

- [ ] **Step 2: Run the layout test and verify RED**

Run: `npm test -- --run src/react-app/game/track/obstacleLayout.test.ts`

Expected: FAIL because `obstacleLayout.ts` and its exported contracts do not exist. This is a static/unit run and does not consume the ten-race budget.

- [ ] **Step 3: Implement the immutable layout and projection helpers**

```ts
export const MARBLE_RADIUS = 0.34;
export const MARBLE_DIAMETER = MARBLE_RADIUS * 2;
export const MIN_DEVICE_CLEARANCE = MARBLE_DIAMETER * 3;

export const NEON_OBSTACLE_LAYOUT = Object.freeze({
  start: { progress: 0, radius: 8.5, shuffleMs: 1500, wallHeight: 1.5 },
  pegHall: {
    progress: 0.31, hallWidth: 18, pegRadius: 0.42,
    pegs: [
      { along: -3, lateral: -5.8 }, { along: -2, lateral: -2.9 },
      { along: -1, lateral: 0 }, { along: 0, lateral: 2.9 },
      { along: 1, lateral: 5.8 }, { along: 2, lateral: -2.9 },
      { along: 3, lateral: 2.9 },
    ],
  },
  pushers: { progress: 0.43, hallWidth: 18, radius: 0.55, reach: 5.8, travel: 2.2, phaseOffset: Math.PI },
  branch: { startProgress: 0.56, endProgress: 0.67, mergeProgress: 0.7 },
  vortex: { progress: 0.79, radius: 7.8, outletDiameter: 1.36, verticalDrop: 1.36 },
} as const);
```

Resolve progress anchors against `samples`, express offsets in each sample's `side/up/tangent` frame, freeze the result, and return named validation failures rather than partial geometry.

- [ ] **Step 4: Run the layout test and verify GREEN**

Run: `npm test -- --run src/react-app/game/track/obstacleLayout.test.ts`

Expected: all layout tests pass; no full-race budget consumed.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/react-app/game/track/obstacleLayout.ts src/react-app/game/track/obstacleLayout.test.ts src/react-app/game/track/trackTypes.ts src/react-app/game/track/trackBuild.ts
git commit -m "feat: define safe neon obstacle layout"
```

---

### Task 2: Thick Track, Static Devices, and Neon Rendering

**Files:**
- Create: `src/react-app/game/track/obstacleGeometry.ts`
- Create: `src/react-app/game/track/obstacleGeometry.test.ts`
- Create: `src/react-app/game/track/obstacleRender.ts`
- Create: `src/react-app/game/track/obstacleRender.test.ts`
- Modify: `src/react-app/game/track/trackRender.ts`
- Modify: `src/react-app/game/track/trackRender.test.ts`

**Interfaces:**
- Consumes: resolved obstacle layout, canonical `TrackGeometry`, and `TrackSample[]`.
- Produces: `buildObstacleGeometry(track, resolved)`, `createObstacleRenderGroup(resources)`, `setDeviceRenderPose(group, pose)`, `disposeObstacleRenderGroup(group)`.

- [ ] **Step 1: Write failing geometry/render tests**

```ts
it("renders a thick dark shell without structural supports", () => {
  const group = createTrackRenderGroup(track.geometry);
  expect(group.getObjectByName("u-channel-supports")).toBeUndefined();
  expect(group.getObjectByName("continuous-track-shell")).toBeDefined();
  expect(group.getObjectByName("continuous-u-channel")!.userData.surfaceColor).toBe("#171b25");
});

it("builds an indexed vortex with the approved outlet and drop", () => {
  const geometry = buildObstacleGeometry(track, resolved);
  expect(measureOutletDiameter(geometry.vortex)).toBeCloseTo(1.36, 2);
  expect(measureRimDrop(geometry.vortex)).toBeCloseTo(1.36, 2);
  expect(openBoundaryLoops(geometry.vortex)).toEqual(["entry", "outlet"]);
});
```

- [ ] **Step 2: Run geometry/render tests and verify RED**

Run: `npm test -- --run src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/track/obstacleRender.test.ts src/react-app/game/track/trackRender.test.ts`

Expected: FAIL because shell/obstacle generators and the no-support contract are missing.

- [ ] **Step 3: Generate indexed static geometry**

Build the following from shared local frames:

```ts
export type ObstacleGeometryResources = Readonly<{
  shell: IndexedGeometry;
  startBowl: IndexedGeometry;
  branchRails: IndexedGeometry;
  vortex: IndexedGeometry;
  catchChannel: IndexedGeometry;
}>;
```

Use rounded radial profiles for both bowls, an eccentric outlet, an overlapping catch-channel collar, and capsule-ended branch rails. Keep the base U-channel `positions` and `indices` unchanged. The shell is render-only and extrudes edge vertices downward by `0.7`.

- [ ] **Step 4: Implement low-cost neon render resources**

Use shared `MeshStandardMaterial` objects: charcoal surface, near-black shell/rails, magenta pushers, cyan/orange peg instances, and emissive yellow/cyan rim segments. Replace `createSupports()` with the shell. Name device roots and dynamic meshes for lifecycle tests.

- [ ] **Step 5: Run geometry/render tests and verify GREEN**

Run: `npm test -- --run src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/track/obstacleRender.test.ts src/react-app/game/track/trackRender.test.ts`

Expected: all focused tests pass, base track buffers retain object/value identity, and disposal frees each unique geometry/material once.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/react-app/game/track/obstacleGeometry.ts src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/track/obstacleRender.ts src/react-app/game/track/obstacleRender.test.ts src/react-app/game/track/trackRender.ts src/react-app/game/track/trackRender.test.ts
git commit -m "feat: render thick neon obstacle course"
```

---

### Task 3: Rapier Devices, Bowl Launch, and Lifecycle

**Files:**
- Create: `src/react-app/game/track/obstaclePhysics.ts`
- Create: `src/react-app/game/track/obstaclePhysics.test.ts`
- Modify: `src/react-app/game/track/trackPhysics.ts`
- Modify: `src/react-app/game/track/trackPhysics.launchInvariants.test.ts`

**Interfaces:**
- Consumes: `RapierWorld`, `ObstacleGeometryResources`, resolved layout, and marble count/seed.
- Produces: `createObstaclePhysics(world, resources)`, `createBowlLaunchPositions(count, layout, seed)`, `createDeviceController(layout)`, `DevicePose`, and `ObstaclePhysicsResources.dispose()`.

- [ ] **Step 1: Write failing device and launch tests**

```ts
it("places 100 bowl marbles without overlap", () => {
  const positions = createBowlLaunchPositions(100, resolved.start, 11);
  expect(positions).toHaveLength(100);
  expect(minimumPairDistance(positions)).toBeGreaterThanOrEqual(0.68);
});

it("keeps pusher poses opposite and resets deterministically", () => {
  const controller = createDeviceController(resolved);
  const pose = controller.step(1 / 60);
  expect(pose.pushers[0].offset).toBeCloseTo(-pose.pushers[1].offset, 6);
  controller.reset();
  expect(controller.pose()).toEqual(controller.initialPose());
});

it("opens the gate before starting race elapsed time", () => {
  const controller = createDeviceController(resolved);
  controller.advanceMs(1499);
  expect(controller.pose().gateOpen).toBe(false);
  controller.advanceMs(1);
  expect(controller.pose().gateOpen).toBe(true);
});
```

- [ ] **Step 2: Run device tests and verify RED**

Run: `npm test -- --run src/react-app/game/track/obstaclePhysics.test.ts src/react-app/game/track/trackPhysics.launchInvariants.test.ts`

Expected: FAIL because the device controller and bowl launch API do not exist.

- [ ] **Step 3: Implement fixed and kinematic colliders**

Create fixed trimesh colliders for start/vortex/catch geometry, fixed cylinders for pegs, fixed capsule-ended branch rails, and kinematic-position-based bodies for the agitator, gate, and pushers. Use `setNextKinematicTranslation`/`setNextKinematicRotation` once per fixed step. Use the same `DevicePose` to update rendering.

```ts
export type DeviceController = Readonly<{
  step: (seconds: number) => DevicePose;
  pose: () => DevicePose;
  reset: (options?: { gateOpen?: boolean }) => void;
  raceClockStarted: () => boolean;
}>;
```

- [ ] **Step 4: Implement non-overlapping concentric bowl launch rings**

Use deterministic angular jitter by seed, radius increments of at least `0.72`, and the analytic bowl height/normal. Brand returned positions as physical launch positions only after surface clearance has been applied.

- [ ] **Step 5: Run device tests and verify GREEN**

Run: `npm test -- --run src/react-app/game/track/obstaclePhysics.test.ts src/react-app/game/track/trackPhysics.launchInvariants.test.ts`

Expected: focused tests pass with deterministic reset, no initial overlap, correct primitive counts, and no full-race budget consumed.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/react-app/game/track/obstaclePhysics.ts src/react-app/game/track/obstaclePhysics.test.ts src/react-app/game/track/trackPhysics.ts src/react-app/game/track/trackPhysics.launchInvariants.test.ts
git commit -m "feat: add physical shuffle devices"
```

---

### Task 4: Leader-to-Trailer Chase Camera

**Files:**
- Modify: `src/react-app/game/cameraPlan.ts`
- Modify: `src/react-app/game/cameraPlan.test.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/game/MarbleRaceScene.test.ts`

**Interfaces:**
- Consumes: sorted live balls `{ position, progress, projection.sampleIndex }[]`, track samples, elapsed time, and user yaw/pitch/zoom.
- Produces: `createRaceFocusDirector()`, `selectFocusRank()`, and `writeTrackFollowShot()`.

- [ ] **Step 1: Write failing camera phase and follow-pose tests**

```ts
it("follows first place before halfway and walks back after halfway", () => {
  const director = createRaceFocusDirector();
  expect(director.select({ leaderProgress: 0.4, liveCount: 100, nowMs: 8000 })).toBe(0);
  expect(director.select({ leaderProgress: 0.6, liveCount: 100, nowMs: 18000 })).toBeGreaterThan(0);
});

it("latches the slowest live marble after 75 percent", () => {
  const director = createRaceFocusDirector();
  expect(director.select({ leaderProgress: 0.76, liveCount: 37, nowMs: 40000 })).toBe(36);
  expect(director.select({ leaderProgress: 0.9, liveCount: 12, nowMs: 42000 })).toBe(11);
});

it("places the camera ahead of the marble and looks backward", () => {
  const shot = writeTrackFollowShot(target, sample, marblePosition, bounds);
  expect(dot(subtract(shot.position, marblePosition), sample.tangent)).toBeGreaterThan(0);
  expect(distance(shot.position, marblePosition)).toBeGreaterThanOrEqual(6);
  expect(distance(shot.position, marblePosition)).toBeLessThanOrEqual(9);
});
```

- [ ] **Step 2: Run camera tests and verify RED**

Run: `npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.test.ts`

Expected: FAIL because rank-walk and track-relative follow APIs are missing.

- [ ] **Step 3: Implement the focus director**

Use leader progress rather than elapsed time for phase changes. Return rank index `0` before `0.5`, interpolate a percentile from `0` to `1` between `0.5` and `0.75`, and return `liveCount - 1` after `0.75`. Hold a chosen target for at least `1800ms` unless it finishes; use a two-rank hysteresis band before changing within a phase.

- [ ] **Step 4: Implement a track-frame chase pose**

Place the camera `7.5` units along the target sample tangent, `2.8` units up, and look at the marble with a `0.45`-unit upward offset. Reuse vectors, damp position/look/orientation, preserve the final trailer latch, and apply pointer/touch/wheel controls after the directed offset.

- [ ] **Step 5: Run camera tests and verify GREEN**

Run: `npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.test.ts`

Expected: camera tests pass, finite clipping is retained, debug views still pause correctly, and no new frame-loop allocations are present.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/react-app/game/cameraPlan.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.test.ts
git commit -m "feat: follow race from leader to trailer"
```

---

### Task 5: Production Integration, Ten-Race Qualification, and Deployment

**Files:**
- Create: `src/react-app/game/track/obstaclePhysics.validation.test.ts`
- Modify: `src/react-app/game/track/trackPhysics.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/game/MarbleRaceScene.test.ts`
- Modify: `src/react-app/App.css`
- Modify: `README.md`
- Create: `.superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md`

**Interfaces:**
- Consumes: all Task 1-4 resources.
- Produces: production scene lifecycle and `runObstacleValidationRace({ seed, marbleCount: 100, observationSeconds })`.

- [ ] **Step 1: Write failing production seam tests without running a full race**

```ts
it("builds the production scene with every canonical obstacle", () => {
  const resources = createSceneTrackResources(false);
  expect(resources.renderGroup.getObjectByName("start-bowl")).toBeDefined();
  expect(resources.renderGroup.getObjectByName("peg-shuffler")).toBeDefined();
  expect(resources.renderGroup.getObjectByName("alternating-pushers")).toBeDefined();
  expect(resources.renderGroup.getObjectByName("branch-rails")).toBeDefined();
  expect(resources.renderGroup.getObjectByName("vortex-bowl")).toBeDefined();
});

it("starts elapsed race time only after the start gate opens", () => {
  expect(getRaceClockOffsetMs({ shuffleMs: 1500, gateOpenMs: 1500 })).toBe(1500);
});
```

- [ ] **Step 2: Run production seam tests and verify RED**

Run: `npm test -- --run src/react-app/game/MarbleRaceScene.test.ts`

Expected: FAIL until every obstacle and delayed clock seam is wired.

- [ ] **Step 3: Complete scene lifecycle and neon styling**

Wire fixed-step device updates before `world.step()`, copy the returned pose into render objects, exclude shuffle time from elapsed time, reset with an open gate for remaining-marble races, and dispose all physics/render resources. Set the race background to dark navy, use the approved dark track materials and bounded neon lights, and keep HUD text contrast AA-readable.

- [ ] **Step 4: Run focused and full unit suites**

Run: `npm test -- --run src/react-app/game/track/obstacleLayout.test.ts src/react-app/game/track/obstacleGeometry.test.ts src/react-app/game/track/obstacleRender.test.ts src/react-app/game/track/obstaclePhysics.test.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.test.ts`

Then run: `npm test -- --run --exclude src/react-app/game/track/obstaclePhysics.validation.test.ts`

Expected: all unit/static/lifecycle tests pass. These commands do not create a 100-marble end-to-end world and do not consume the ten-race budget.

- [ ] **Step 5: Create the ten-run ledger before qualification**

```md
# 100-Marble Physics Run Ledger

Budget: 10 total end-to-end attempts. An attempt is consumed when a 100-marble Rapier world begins stepping.

| Attempt | Seed | Commit | Escapes | Stalls | Finish count | Last observed second | Result |
|---:|---:|---|---:|---:|---:|---:|---|
```

Before starting, the controller must compare the requested seeds with the ledger and refuse a seed outside the approved list or already recorded. If the test process aborts after stepping begins, record that attempt as consumed.

- [ ] **Step 6: Run exactly the ten approved end-to-end races once**

Run: `npm test -- --run src/react-app/game/track/obstaclePhysics.validation.test.ts`

The test iterates `FIXED_VALIDATION_SEEDS` exactly once and prints ten results. Assert zero escapes, zero stalls, and unique finisher IDs. Report finish count/time without asserting completion by 60 seconds. Immediately copy all ten printed rows into the ledger with `apply_patch`. Do not rerun this command. If it fails, use the captured diagnostics and focused tests; after ten consumed attempts, ask the user before any additional 100-marble race.

- [ ] **Step 7: Build and run browser acceptance**

Run: `npm run build`

At `?trackDebug=1`, verify desktop Top/Side/Profile and capture start, peg, pusher, branch, vortex, trailer, and results screenshots. At `360x800`, verify 100 active marbles, touch-sized HUD, measured FPS at least 30, and zero console errors. Browser observation of the already-running production race does not create an additional headless qualification attempt; do not restart it more than once.

- [ ] **Step 8: Update documentation and commit Task 5**

Document obstacle controls, debug URL, the ten-run budget, the non-time-based safety criterion, and mobile acceptance.

```bash
git add src/react-app/game/track/obstaclePhysics.validation.test.ts src/react-app/game/track/trackPhysics.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.test.ts src/react-app/App.css README.md .superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md
git commit -m "feat: complete Lucky Roll neon obstacle race"
```

- [ ] **Step 9: Review and deploy**

Have a fresh reviewer inspect the entire implementation range for collision gaps, test-budget compliance, lifecycle leaks, camera target errors, and mobile regressions. Resolve Critical and Important findings with focused tests only. Run `git diff --check`, confirm the worktree is clean, fast-forward `main`, run the production build on the merged commit, and push `origin/main`. Cloudflare deployment status is confirmed by the user.
