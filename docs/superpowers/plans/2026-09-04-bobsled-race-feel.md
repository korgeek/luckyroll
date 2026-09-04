# Bobsled Race Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every default or builder-created track into a seamless route-relative downhill bobsled course with banked curves, a physical start pusher, reliable boosters, and a consistently oriented Bird View.

**Architecture:** Preserve `TrackDesign` and the 5×8 editor contract. Convert the validated flat X/Z route into one graded and banked canonical sample stream, build the start extension and all modules as one indexed render/collider mesh, and derive pusher, booster, and camera behavior from those same samples.

**Tech Stack:** TypeScript, React 19, Three.js, Rapier 3D, Vitest, Vite, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-04-bobsled-race-feel-design.md`

## Global Constraints

- Keep `TrackDesign`, local-storage version `1`, share tokens, route validation, the module palette, Default Track, and saved editor tracks unchanged.
- Use a route-relative grade of exactly `7°`; remove the global `20°` board tilt.
- Curve bank is zero with zero longitudinal rate at both `0.10S` landings and reaches at most `24°` inward in the interior.
- The start extension uses the exact canonical `profileAt(CHANNEL_WIDTH)` floor/wall/lip cross-section and is part of the same indexed render mesh and Rapier trimesh as the first module.
- The physical pusher waits `700 ms`, then sweeps for `650 ms` at approximately `13` world units per second.
- Booster forward speed becomes `min(42, max(18, 1.25 × currentForwardSpeed))` on the first forward activation per marble and booster.
- Do not add continuous speed assistance, random forces, teleportation, recovery forces, dependencies, serialized tuning, or per-track slope controls.
- Do not run additional official multi-seed qualification attempts without separate user approval.
- Leave `.codex-remote-attachments/` and all other user-owned untracked files untouched.

## File map

- `src/react-app/game/modular/modularTypes.ts`: canonical grade, bank, start, and booster constants.
- `src/react-app/game/modular/modulePath.ts`: flat route sampling followed by route-relative height and banked sample-frame resolution.
- `src/react-app/game/modular/modulePath.test.ts`: grade direction, lateral-gravity, curve-bank, and landing-frame contracts.
- `src/react-app/game/modular/moduleGeometry.ts`: canonical profile rows and one welded indexed channel mesh.
- `src/react-app/game/modular/moduleGeometry.test.ts`: seam profile/normal and start-extension weld checks.
- `src/react-app/game/modular/modularTrackBuild.ts`: combine the synthetic upstream start row with route samples for geometry only.
- `src/react-app/game/modular/modularTrackBuild.test.ts`: builder compatibility and start-extension inclusion.
- `src/react-app/game/modular/moduleDevices.ts`: gate and pusher descriptors derived from the first graded sample.
- `src/react-app/game/modular/moduleDevices.test.ts`: pusher clearance and travel bounds.
- `src/react-app/game/modular/modularTrackPhysics.ts`: kinematic pusher, gate sequence, launch physics, and booster speed rule.
- `src/react-app/game/modular/modularTrackPhysics.test.ts`: pusher red/green physics tests, 100-marble gate clearance, and booster rules.
- `src/react-app/game/modular/modularTrackRender.ts`: visible pusher and canonical start channel rendering.
- `src/react-app/game/modular/modularTrackRender.test.ts`: pusher render/pose/disposal synchronization.
- `src/react-app/game/cameraPlan.ts`: stable Bird View screen-up direction from finish to start.
- `src/react-app/game/cameraPlan.test.ts`: start-above-finish Bird View orientation.
- `src/react-app/game/MarbleRaceScene.ts`: apply the Bird View screen-up vector without changing Auto Camera.
- `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`: scene-level Bird View orientation contract.
- `README.md`: describe the route-relative bobsled behavior and unchanged builder format.

---

### Task 1: Route-relative downhill samples and seamless curve banking

**Files:**
- Modify: `src/react-app/game/modular/modularTypes.ts`
- Modify: `src/react-app/game/modular/modulePath.ts`
- Modify: `src/react-app/game/modular/modulePath.test.ts`
- Modify: `src/react-app/game/modular/moduleGeometry.test.ts`

**Interfaces:**
- Consumes: `sampleModulePath(track: TrackDesign, route: ValidRoute): readonly ModulePathSample[]`.
- Produces: the same public function and data type, with route-relative `position`, `tangent`, `side`, `up`, `distance`, `bankRadians`, and `centerlineCurvature`; constants `ROUTE_GRADE` and `MAX_CURVE_BANK`.

- [ ] **Step 1: Replace the global-tilt expectation with failing route-grade and bank tests**

Add these assertions, using the existing worst-case route helper where a curve is required:

```ts
const samples = sampleModulePath(track, assertValidTrackDesign(track));
expect(samples.every((sample, index) => index === 0 || sample.position.y <= samples[index - 1].position.y + 1e-9)).toBe(true);
for (const sample of samples.filter((item) => item.localU <= 0.1 || item.localU >= 0.9)) {
  expect(sample.bankRadians).toBeCloseTo(0, 10);
  expect(sample.up).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }));
}
const banked = samples.filter((sample) => track.cells[sample.cellIndex]?.kind === "curve" && sample.localU > 0.1 && sample.localU < 0.9);
expect(Math.max(...banked.map((sample) => Math.abs(sample.bankRadians)))).toBeCloseTo(24 * Math.PI / 180, 2);
for (const sample of samples.filter((item) => track.cells[item.cellIndex]?.kind === "straight")) {
  expect(sample.tangent.y).toBeLessThan(0);
  expect(Math.abs(sample.side.y)).toBeLessThan(1e-9);
}
expect(validateModuleGeometry(buildModuleGeometry(samples))).toEqual([]);
```

At every curve-to-next-module seam, compare the shared sample's `side`, `up`, profile vertices, and adjacent triangle normals exactly as the existing reciprocal-port test compares its welded row.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/moduleGeometry.test.ts
```

Expected: FAIL because `BOARD_TILT` creates lateral gravity on east/west straights and all samples report `bankRadians: 0`.

- [ ] **Step 3: Resolve grade and bank from cumulative route distance**

Replace `BOARD_TILT` with:

```ts
export const ROUTE_GRADE = 7 * Math.PI / 180;
export const MAX_CURVE_BANK = 24 * Math.PI / 180;
export const START_LENGTH = 10.2;
```

Keep adaptive flat X/Z path construction, then resolve each accepted sample through a pure frame helper. Use actual accumulated planar distance rather than row number:

```ts
const gradeFrame = (planarTangent: Vec3, planarSide: Vec3, bankRadians: number) => {
  const tangent = normalize({
    x: planarTangent.x * Math.cos(ROUTE_GRADE),
    y: -Math.sin(ROUTE_GRADE),
    z: planarTangent.z * Math.cos(ROUTE_GRADE),
  });
  const flatSide = normalize({ x: planarSide.x, y: 0, z: planarSide.z });
  const flatUp = normalize(cross(flatSide, tangent));
  const side = normalize(add(scale(flatSide, Math.cos(bankRadians)), scale(flatUp, -Math.sin(bankRadians))));
  return { tangent, side, up: normalize(cross(side, tangent)) };
};

const bankAt = (kind: ModuleKind | "start" | "finish", localU: number, signedCurvature: number): number => {
  if (kind !== "curve" || localU <= 0.1 || localU >= 0.9) return 0;
  const t = (localU - 0.1) / 0.8;
  return Math.sign(signedCurvature) * MAX_CURVE_BANK * Math.sin(Math.PI * t) ** 2;
};
```

For each retained point, accumulate `planarDistance += hypot(dx, dz)`, set `position.y = -planarDistance * tan(ROUTE_GRADE)`, set stored `distance = planarDistance / cos(ROUTE_GRADE)`, and transform both reciprocal port metadata entries to that same world position. The `sin²(πt)` envelope makes bank angle and longitudinal rate zero at both interior/landing boundaries. Update adaptive surface-turn checks to evaluate the same graded/banked profile frames, subdividing until the existing two-degree longitudinal-normal limit passes.

Delete the old exported `boardToWorld` rotation and its 20-degree assertions. Update the test-only analytic helpers to compare board-local X/Z first, then apply the same cumulative grade/frame helper; no second world-transform path may remain.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command again. Expected: PASS with `validateModuleGeometry(...)` returning `[]` for default and worst-case designs.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/react-app/game/modular/modularTypes.ts src/react-app/game/modular/modulePath.ts src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/moduleGeometry.test.ts
git commit -m "feat: grade and bank modular routes"
```

### Task 2: Weld the canonical start extension into the track mesh

**Files:**
- Modify: `src/react-app/game/modular/modulePath.ts`
- Modify: `src/react-app/game/modular/modularTrackBuild.ts`
- Modify: `src/react-app/game/modular/modularTrackBuild.test.ts`
- Modify: `src/react-app/game/modular/moduleGeometry.test.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.test.ts`

**Interfaces:**
- Produces: `createStartExtensionSamples(samples: readonly ModulePathSample[]): readonly ModulePathSample[]` for geometry construction only.
- Preserves: `BuiltModularTrack.samples` as route samples used by projection, finish detection, devices, and cameras; `BuiltModularTrack.geometry.samples` includes the upstream start row.

- [ ] **Step 1: Write failing seam and compatibility tests**

Assert:

```ts
const built = buildModularTrack(createValidTrackDesign());
expect(built.geometry.samples.length).toBe(built.samples.length + 1);
expect(built.geometry.samples[1]).toBe(built.samples[0]);
const startRow = Array.from({ length: PROFILE_SEGMENTS + 1 }, (_, column) => vertex(built.geometry, 0, column));
const firstRow = Array.from({ length: PROFILE_SEGMENTS + 1 }, (_, column) => vertex(built.geometry, 1, column));
expect(startRow).toHaveLength(firstRow.length);
expect(profileAt(built.geometry.samples[0].width)).toEqual(profileAt(CHANNEL_WIDTH));
expect(validateModuleGeometry(built.geometry)).toEqual([]);
expect(createModularTrackRender(built).group.getObjectByName("modular-start-enclosure")).toBeUndefined();
```

Also assert the extension end and first module are consecutive indexed rows joined by exactly `PROFILE_SEGMENTS × 2` triangles and contain no standalone end-cap or duplicate triangle.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/react-app/game/modular/modularTrackBuild.test.ts src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackRender.test.ts
```

Expected: FAIL because geometry begins at the first module while a separate narrower enclosure mesh overlaps it.

- [ ] **Step 3: Add exactly one upstream canonical sample row**

Implement the geometry-only extension:

```ts
export const createStartExtensionSamples = (samples: readonly ModulePathSample[]): readonly ModulePathSample[] => {
  const first = samples[0];
  if (first === undefined) throw new Error("A start extension requires a sampled route.");
  const start = Object.freeze({
    ...first,
    index: -1,
    distance: first.distance - START_LENGTH,
    position: Object.freeze({
      x: first.position.x - first.tangent.x * START_LENGTH,
      y: first.position.y - first.tangent.y * START_LENGTH,
      z: first.position.z - first.tangent.z * START_LENGTH,
    }),
    localU: -START_LENGTH / MODULE_SIZE,
    width: CHANNEL_WIDTH,
    bankRadians: 0,
    centerlineCurvature: Object.freeze({ x: 0, y: 0, z: 0 }),
    chordError: 0,
    port: undefined,
    ports: undefined,
  });
  return Object.freeze([start, ...samples]);
};
```

In `buildModularTrack`, call `buildModuleGeometry(createStartExtensionSamples(samples))` while returning the original route `samples`. In rendering, build rims from `built.geometry.samples` and remove `buildStartEnclosure(...)`; the normal modular surface and shell now include the start channel. Do not add a second floor, wall profile, or collider at the join.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 2 command again. Expected: PASS and one validated geometry owns the start extension and module route.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/react-app/game/modular/modulePath.ts src/react-app/game/modular/modularTrackBuild.ts src/react-app/game/modular/modularTrackBuild.test.ts src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackRender.ts src/react-app/game/modular/modularTrackRender.test.ts
git commit -m "fix: weld start channel into modular track"
```

### Task 3: Launch the field with one visible physical pusher

**Files:**
- Modify: `src/react-app/game/modular/moduleDevices.ts`
- Modify: `src/react-app/game/modular/moduleDevices.test.ts`
- Modify: `src/react-app/game/modular/modularTrackPhysics.ts`
- Modify: `src/react-app/game/modular/modularTrackPhysics.test.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.ts`
- Modify: `src/react-app/game/modular/modularTrackRender.test.ts`

**Interfaces:**
- Replace: `start.agitator` with `start.pusher: StartDeviceDescriptor & { endCenter: Vec3; durationMs: number }`.
- Replace: `ModularDevicePose.agitatorAngle` with `ModularDevicePose.pusherCenter: Vec3`; remove the duplicate `ModularDevicePose` declaration from `modularTrackPhysics.ts` and import the type from `moduleDevices.ts`.
- Add: `ModularPhysicsResources.pusherBody: RapierBody` for exact physics tests.

- [ ] **Step 1: Write failing pusher descriptor, physics, render, and 100-marble tests**

Require that the pusher width is `CHANNEL_WIDTH - MARBLE_DIAMETER`, its initial front face is behind the first launch row, its final front face stops behind the gate, and its center advances only after gate opening:

```ts
const initial = resources.reset();
expect(initial.gateOpen).toBe(false);
expect(initial.pusherCenter).toEqual(devices.start.pusher.center);
for (let step = 0; step < 41; step += 1) resources.stepBeforeWorld();
expect(resources.stepBeforeWorld().gateOpen).toBe(true);
const moving = resources.stepBeforeWorld();
expect(dot(subtract(moving.pusherCenter, initial.pusherCenter), devices.start.frame.tangent)).toBeGreaterThan(0);
```

In render tests, require `modular-start-pusher` to exist, match `pose.pusherCenter`, and dispose with the track. In the 100-marble physics test, record each body's along coordinate relative to the gate and require every marble center to pass the gate plane within 2.5 seconds after opening, with zero escape, stall, or non-finite state.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/modular/modularTrackRender.test.ts
```

Expected: FAIL because no modular pusher body or mesh exists and launch uses a one-time per-marble velocity assignment.

- [ ] **Step 3: Implement one kinematic pusher and remove hidden launch velocity**

Resolve the pusher from the graded start frame:

```ts
const pusher = Object.freeze({
  center: add(startFrame.position, scale(startFrame.up, 1.6)),
  endCenter: add(add(startFrame.position, scale(startFrame.tangent, 8.8)), scale(startFrame.up, 1.6)),
  tangent: startFrame.tangent,
  side: startFrame.side,
  up: startFrame.up,
  width: CHANNEL_WIDTH - MARBLE_DIAMETER,
  height: 3.2,
  depth: 0.36,
  durationMs: 650,
});
```

Create one `kinematicPositionBased` pusher rigid body with one cuboid collider. In `stepBeforeWorld`, open the gate at `shuffleMs` for a full race and calculate progress with the restart-aware clock below. Use `setNextKinematicTranslation` for the interpolated center before `world.step()`.

```ts
const elapsedMs = elapsedSeconds * 1_000;
const pusherElapsedMs = forceGateOpen ? elapsedMs : Math.max(0, elapsedMs - devices.start.shuffleMs);
const pusherProgress = Math.min(1, pusherElapsedMs / devices.start.pusher.durationMs);
const pusherCenter = add(devices.start.pusher.center, scale(subtract(devices.start.pusher.endCenter, devices.start.pusher.center), pusherProgress));
```

Remove the `launched` `WeakSet` and the block that assigns forward speed `8` in `stepAfterWorld`; all start energy must come from pusher contact and gravity.

Create a `modular-start-pusher` box mesh using the same descriptor transform. `setModularDevicePose` writes both gate visibility and exact pusher position. Full and remaining-marble reset return the pusher to its initial center; remaining restart keeps the gate open and immediately begins the same sweep.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 3 command again. Expected: PASS, including all 100 marbles crossing the gate within the bound. Tune only `endCenter` within the start channel or `durationMs` if that physical acceptance fails; do not add per-marble forces.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/react-app/game/modular/moduleDevices.ts src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackPhysics.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/modular/modularTrackRender.ts src/react-app/game/modular/modularTrackRender.test.ts
git commit -m "feat: launch marbles with physical pusher"
```

### Task 4: Make every forward booster pass noticeably accelerate

**Files:**
- Modify: `src/react-app/game/modular/modularTrackPhysics.ts`
- Modify: `src/react-app/game/modular/modularTrackPhysics.test.ts`

**Interfaces:**
- Preserves: `applyBoosterVelocity(velocity, forward, consumed, boosterCellIndex, marbleIndex, cellCount?): Vec3`.
- Changes: first positive forward activation uses minimum `18`, multiplier `1.25`, and cap `42`.

- [ ] **Step 1: Write failing booster table tests**

```ts
it.each([
  [0.5, 18],
  [10, 18],
  [20, 25],
  [40, 42],
  [50, 50],
] as const)("boosts forward speed %s to %s", (incoming, expected) => {
  const state = createBoosterState(1);
  expect(applyBoosterVelocity({ x: incoming, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 0).x).toBe(expected);
});
```

Keep explicit tests that zero/backward travel does not consume, lateral/normal components remain unchanged, swept entry activates once, and reset permits one new activation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts -t "boost|booster"
```

Expected: FAIL because the current rule only multiplies by `1.20` and has no minimum exit speed.

- [ ] **Step 3: Implement the minimum/multiplier/cap rule**

```ts
const currentForward = dot(velocity, direction);
if (!(currentForward > 0)) return velocity;
const after = Math.min(42, Math.max(18, currentForward * 1.25));
const delta = Math.max(0, after - currentForward);
if (delta === 0) return velocity;
consumed[slot] = 1;
return add(velocity, scale(direction, delta));
```

Only mark the booster consumed when it adds positive speed. Leave the existing full-width swept crossing and per-race consumption matrix in place.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 4 command again. Expected: PASS with no speed above `42` caused by a booster and no deceleration of natural speeds above the cap.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/react-app/game/modular/modularTrackPhysics.ts src/react-app/game/modular/modularTrackPhysics.test.ts
git commit -m "feat: guarantee noticeable booster speed"
```

### Task 5: Orient Bird View from start at top to finish at bottom

**Files:**
- Modify: `src/react-app/game/cameraPlan.ts`
- Modify: `src/react-app/game/cameraPlan.test.ts`
- Modify: `src/react-app/game/MarbleRaceScene.ts`
- Modify: `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

**Interfaces:**
- Add: `getBirdViewUp(samples: readonly TrackSample[]): Vec3`.
- Preserve: `RaceScene.setBirdView(enabled: boolean): void` and all Auto Camera behavior.

- [ ] **Step 1: Write failing camera orientation tests**

```ts
const samples = [
  { position: { x: 4, y: 0, z: 8 } },
  { position: { x: -2, y: -4, z: -6 } },
] as readonly TrackSample[];
const up = getBirdViewUp(samples);
const finishToStart = { x: 6, y: 0, z: 14 };
expect(up.x * finishToStart.x + up.z * finishToStart.z).toBeGreaterThan(0);
expect(up.y).toBe(0);
expect(Math.hypot(up.x, up.z)).toBeCloseTo(1, 8);
```

Add coincident/empty endpoint fallback coverage and a scene lifecycle assertion that Bird View assigns this horizontal vector to `camera.up`, while disabling Bird View resumes the existing directed camera frame.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts
```

Expected: FAIL because Bird View currently retains the track surface's nearly vertical up vector.

- [ ] **Step 3: Implement stable screen-up direction**

```ts
export const getBirdViewUp = (samples: readonly TrackSample[]): Vec3 => {
  const start = samples[0]?.position;
  const finish = samples[samples.length - 1]?.position;
  if (start === undefined || finish === undefined) return { x: 0, y: 0, z: -1 };
  const length = Math.hypot(start.x - finish.x, start.z - finish.z);
  return length > 1e-9
    ? { x: (start.x - finish.x) / length, y: 0, z: (start.z - finish.z) / length }
    : { x: 0, y: 0, z: -1 };
};
```

In `updateCamera`, set `localUp = getBirdViewUp(course.samples)` only in the `birdView` branch before writing the shot. Keep the existing position, bounds, clip planes, toggle, easing, reduced-motion behavior, and Auto Camera path.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 5 command again. Expected: PASS with start-to-finish vertical screen orientation stable for default and saved tracks.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/react-app/game/cameraPlan.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts
git commit -m "fix: orient bird view along race direction"
```

### Task 6: Integration, mobile acceptance, documentation, and delivery

**Files:**
- Modify: `README.md`
- Modify only if acceptance exposes a defect: files already listed in Tasks 1–5 and their matching tests.

**Interfaces:**
- Consumes: completed graded/banked `BuiltModularTrack`, pusher pose, booster behavior, and Bird View orientation.
- Produces: deploy-ready `main` with no task-created worktrees remaining.

- [ ] **Step 1: Run focused integrated physics**

```bash
npm test -- --run src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/moduleGeometry.test.ts src/react-app/game/modular/modularTrackBuild.test.ts src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/game/raceCourse.test.ts
```

Expected: all selected tests pass, including the existing one-seed 100-marble start validation. Do not enable either environment-gated official qualification suite.

- [ ] **Step 2: Inspect both track sources in the browser**

Run `npm run dev`, then at the reported mobile viewport (approximately `326×710` CSS pixels):

1. start the Default Track;
2. confirm pusher movement is visible and the full field enters the seamless channel;
3. switch to Bird View and confirm start is at screen top and finish at bottom;
4. create or select one saved builder track and repeat;
5. confirm a curve visibly banks without a ridge at either neighboring seam;
6. confirm a slow marble crossing a booster receives obvious forward speed;
7. confirm no persistent one-wall gravity bias on east/west straights.

- [ ] **Step 3: Update README**

Document exactly: unchanged builder/storage/share format, route-relative 7-degree descent, automatic 24-degree interior curve bank with flat seamless landings, physical start pusher, minimum-18 booster exit speed, and start-top Bird View.

- [ ] **Step 4: Run full verification**

```bash
npm test -- --run
npm run lint
npm run check
git diff --check
```

Expected: 0 failed tests, 0 lint errors, TypeScript/Vite build success, Wrangler deploy dry-run success, and no whitespace errors. Existing intentional qualification skips and Vite chunk-size warnings are acceptable; record their exact counts.

- [ ] **Step 5: Request final code review and resolve blockers**

Review the complete range from the pre-implementation base through HEAD against the spec. Fix every Critical or Important finding with a focused red/green test and rerun Step 4 after the final code change.

- [ ] **Step 6: Commit documentation and verified acceptance changes**

```bash
git add README.md
git commit -m "docs: describe bobsled track behavior"
```

If acceptance required code changes, stage only the named source and matching test files in the same corrective commit; never stage `.codex-remote-attachments/`.

- [ ] **Step 7: Consolidate and push**

Verify exact worktree paths with `git worktree list`. Integrate all reviewed task commits into `main` without force-resetting or overwriting user changes, remove only clean task-created worktrees, fetch `origin`, rebase only if remote `main` advanced, and run:

```bash
git push origin main
```

Expected: `origin/main` points at the verified bobsled commit, the primary worktree is clean except preserved user-owned untracked files, and no task-created worktree remains.
