# Curve Safety and Race Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove self-folding modular curves and camera intrusion, show real marble rolling, strengthen race-changing devices, clarify editor replacement, and display finishers separately from eliminated marbles.

**Architecture:** Keep the existing shared sampled-path → indexed render mesh → Rapier trimesh pipeline. Correct the curve analytically at its source, then consume the same descriptors in physics and rendering; add only small pure camera/render helpers and extend the existing scene tick payload for HUD outcomes.

**Tech Stack:** TypeScript 5.9, React 19, Three.js 0.170, Rapier 3D 0.17, Vitest 3, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-curve-race-feel-design.md`

## Global Constraints

- Keep module ports, channel width `12`, rail height `4`, route grade, and straight `0.1S` landings unchanged.
- Curve interior is an exact quarter-circle of radius `8` from `localU=0.1` through `0.9`; banking is zero at both landings.
- Keep one shared indexed channel mesh and one Rapier trimesh with `FIX_INTERNAL_EDGES`; no hidden walls or marble rescue.
- Remove per-sample closed-box rims and do not add a floor speed texture.
- Marble speed feedback comes from one shared asymmetric grayscale texture plus each Rapier body's real quaternion.
- Automatic camera clearance is at least `5` world units along local `up`; Bird View stays unchanged.
- Pinwheel radius is `4` and speed is `5 rad/s`; funnel waist `9.6` spans `localU=0.3..0.7`; each bumper module has five bars and restitution `0.65` with `Max` combine.
- `DONE` counts finishers only; `OUT` counts escape/non-finite DNF only; timeout marbles are late and never increment `OUT`.
- No new dependency and no serialized track-format change.

---

### Task 1: Safe circular curve source and physical containment

**Files:**
- Modify: `src/react-app/game/modular/modulePath.ts:59-76,123-169`
- Modify: `src/react-app/game/modular/modulePath.test.ts:20-61,107-158`
- Modify: `src/react-app/game/modular/modularTrackPhysics.ts:358-418`
- Modify: `src/react-app/game/modular/modularTrackPhysics.test.ts`

**Interfaces:**
- Consumes: `MODULE_SIZE=20`, `LANDING_LENGTH=2`, `CHANNEL_WIDTH=12`, `ModulePathSample`.
- Produces: unchanged `sampleModulePath(track, route): readonly ModulePathSample[]` and new test-support `runModularCurveProbe(options): Promise<CurveProbeResult>`.

- [ ] **Step 1: Replace the test's quintic reference with the approved circular reference and add an inward-fold assertion**

```ts
const circularCurvePoint = (p0: Vec3, incoming: Vec3, outgoing: Vec3, localU: number): Vec3 => {
  const angle = (localU - 0.1) / 0.8 * Math.PI / 2;
  return add(p0, add(scale(incoming, 8 * Math.sin(angle)), scale(outgoing, 8 * (1 - Math.cos(angle)))));
};

it("keeps every curve at radius eight without folding the six-unit inner profile", () => {
  const track = createValidTrackDesign();
  const route = assertValidTrackDesign(track);
  const curves = sampleModulePath(track, route).filter((sample) => track.cells[sample.cellIndex]?.kind === "curve");
  for (const sample of curves.filter((item) => item.localU > 0.1 && item.localU < 0.9)) {
    const planarCurvature = Math.hypot(sample.centerlineCurvature.x, sample.centerlineCurvature.z) / Math.cos(7 * Math.PI / 180) ** 2;
    expect(planarCurvature).toBeCloseTo(1 / 8, 5);
    expect(1 / planarCurvature).toBeGreaterThan(12 / 2);
  }
});
```

- [ ] **Step 2: Run the path test and verify it fails against the current `3.77` minimum radius**

Run: `npm test -- --run src/react-app/game/modular/modulePath.test.ts`

Expected: FAIL in the new curve-radius test and old analytic midpoint expectations.

- [ ] **Step 3: Replace the quintic curve interior with the exact radius-eight arc and delete unused quintic helpers**

```ts
const CURVE_RADIUS = (MODULE_SIZE - 2 * LANDING_LENGTH) / 2;

if (kind === "curve") {
  const p0 = add(entryPort, scale(incoming, LANDING_LENGTH));
  const angularScale = Math.PI / 2 / 0.8;
  return {
    entry,
    exit,
    sideAt: curveSideAt,
    pointAt(localU) {
      if (localU <= 0.1) return coordinate(add(entryPort, scale(incoming, MODULE_SIZE * localU)), incoming, zero);
      if (localU >= 0.9) return coordinate(add(exitPort, scale(outgoing, MODULE_SIZE * (localU - 1))), outgoing, zero);
      const angle = (localU - 0.1) * angularScale;
      const position = add(p0, add(scale(incoming, CURVE_RADIUS * Math.sin(angle)), scale(outgoing, CURVE_RADIUS * (1 - Math.cos(angle)))));
      const derivative = scale(add(scale(incoming, Math.cos(angle)), scale(outgoing, Math.sin(angle))), CURVE_RADIUS * angularScale);
      const secondDerivative = scale(add(scale(incoming, -Math.sin(angle)), scale(outgoing, Math.cos(angle))), CURVE_RADIUS * angularScale ** 2);
      return coordinate(position, derivative, secondDerivative);
    },
  };
}
```

Use the existing frozen `{ x: 0, y: 0, z: 0 }` shape inline for `zero`; do not introduce a public curve type.

- [ ] **Step 4: Run path and geometry tests**

Run: `npm test -- --run src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/moduleGeometry.test.ts`

Expected: both files PASS; existing welded seam and two-degree normal-turn checks remain green.

- [ ] **Step 5: Add a focused real-Rapier curve probe patterned after `runModularSeamProbe`**

```ts
export type CurveProbeOptions = Readonly<{ track: TrackDesign; speed: 8 | 18 | 42; lateral: number }>;
export type CurveProbeResult = Readonly<{ escaped: boolean; exited: boolean; forwardSpeed: number }>;

export const runModularCurveProbe = async ({ track, speed, lateral }: CurveProbeOptions): Promise<CurveProbeResult> => {
  await initializeTrackPhysics();
  const built = buildModularTrack(track);
  const curveCell = built.route.route.find((step) => built.track.cells[step.cellIndex]?.kind === "curve")!.cellIndex;
  const rows = built.samples.filter((sample) => sample.cellIndex === curveCell);
  const entry = rows.find((sample) => sample.localU === 0.1)!;
  const exit = rows.find((sample) => sample.localU === 0.9)!;
  const world = createTrackPhysicsWorld();
  const resources = createModularPhysics(world, built);
  try {
    const position = add(entry.position, add(scale(entry.side, lateral), scale(entry.up, MARBLE_DIAMETER / 2 + 0.02)));
    const [body] = createMarbleBodies(world, [{ ...position, crossOffset: lateral, row: 0, column: 0, physicalLaunchPosition: true }]);
    body.setLinvel(scale(entry.tangent, speed), true);
    let escaped = false; let exited = false; let forwardSpeed = 0;
    for (let step = 0; step < 2 / TIMESTEP_SECONDS; step += 1) {
      resources.stepBeforeWorld(); world.step(); resources.stepAfterWorld([body]);
      const current = toVec3(body.translation()); const projection = projectToTrack(current, built.samples);
      if (distanceSquaredToSample(current, built.samples[projection.sampleIndex]) > 15 ** 2) { escaped = true; break; }
      if ((built.samples[projection.sampleIndex]?.distance ?? -Infinity) >= exit.distance) {
        exited = true; forwardSpeed = dot(toVec3(body.linvel()), exit.tangent); break;
      }
    }
    return Object.freeze({ escaped, exited, forwardSpeed });
  } finally {
    resources.dispose(); world.free();
  }
};
```

The implementation must reuse `createModularPhysics`, `createMarbleBodies`, `projectToTrack`, and `distanceSquaredToSample`; `exited` becomes true when projected distance reaches `exit.distance`, and `forwardSpeed` is `dot(body.linvel(), exit.tangent)` at that moment.

- [ ] **Step 6: Add six curve probe cases and verify RED then GREEN**

```ts
it.each([8, 18, 42] as const)("contains center and near-wall marbles through a curve at %s", async (speed) => {
  for (const lateral of [0, CHANNEL_WIDTH / 2 - 1.5 * MARBLE_DIAMETER]) {
    const result = await runModularCurveProbe({ track: createValidTrackDesign(), speed, lateral });
    expect(result.escaped).toBe(false);
    expect(result.exited).toBe(true);
    expect(result.forwardSpeed).toBeGreaterThan(0);
  }
});
```

Run: `npm test -- --run src/react-app/game/modular/modularTrackPhysics.test.ts`

Expected: PASS after the circular source is active.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/react-app/game/modular/modulePath.ts src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/modularTrackPhysics.ts src/react-app/game/modular/modularTrackPhysics.test.ts
git commit -m "fix: remove modular curve self-intersection"
```

### Task 2: Clean channel silhouette and visible marble rolling

**Files:**
- Modify: `src/react-app/game/modular/modularTrackRender.ts:45-75,145-163`
- Modify: `src/react-app/game/modular/modularTrackRender.test.ts:8-70`
- Modify: `src/react-app/game/MarbleRaceScene.ts:254-317,319-339,397-414`
- Modify: `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

**Interfaces:**
- Consumes: Three `DataTexture`, Rapier `body.rotation()` quaternion, existing color batches.
- Produces: `createMarbleRollTexture(): THREE.DataTexture`; no change to `RaceScene` public methods.

- [ ] **Step 1: Write render tests that reject segmented rims and require an asymmetric shared marble map**

```ts
it("renders the channel without closed per-sample rim boxes", () => {
  const rendered = createModularTrackRender(buildModularTrack(createWorstCaseTrackDesign()));
  expect(rendered.group.getObjectByName("modular-neon-rims")).toBeUndefined();
  disposeModularTrackRender(rendered);
});

it("creates one asymmetric repeating marble roll texture", () => {
  const texture = createMarbleRollTexture();
  expect(texture).toBeInstanceOf(THREE.DataTexture);
  expect(new Set(Array.from(texture.image.data as Uint8Array))).not.toEqual(new Set([255]));
  texture.dispose();
});
```

- [ ] **Step 2: Run the two test files and verify the new assertions fail**

Run: `npm test -- --run src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

Expected: FAIL because rims still exist and no marble texture helper exists.

- [ ] **Step 3: Delete `createRims` and its call**

Remove the `BoxGeometry`/`InstancedMesh` rim construction and `group.add(createRims(...))`. Keep the shared channel mesh and shell unchanged.

- [ ] **Step 4: Add one dependency-free texture and apply the body quaternion to every instance**

```ts
export const createMarbleRollTexture = (): THREE.DataTexture => {
  const width = 32; const height = 16; const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const stripe = Math.abs(x - width * 0.28) < 3 || Math.hypot(x - 23, y - 5) < 2.5;
    const value = stripe ? 70 : 255; const offset = (y * width + x) * 4;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
};
```

Create one texture per scene, pass it as `map` to every color-batch `MeshStandardMaterial`, and dispose it in `teardown`. In the matrix update:

```ts
const rotation = ball.body.rotation();
dummy.position.set(ball.position.x, ball.position.y, ball.position.z);
dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
dummy.scale.setScalar(ball.done ? 0 : 1);
dummy.updateMatrix();
```

- [ ] **Step 5: Extend the lifecycle mock with `rotation()` and assert matrix rotation changes**

```ts
rotation: () => ({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 })
```

After one animation frame, call `getMatrixAt`, decompose it, and assert the instance quaternion has absolute dot product near `1` with the body quaternion.

- [ ] **Step 6: Run focused tests and commit Task 2**

Run: `npm test -- --run src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

Expected: both files PASS.

```bash
git add src/react-app/game/modular/modularTrackRender.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts
git commit -m "feat: show physical marble rotation"
```

### Task 3: Curve-following camera with rail clearance

**Files:**
- Modify: `src/react-app/game/cameraPlan.ts:8-9,136-180`
- Modify: `src/react-app/game/cameraPlan.test.ts:33-68,136-180`
- Modify: `src/react-app/game/MarbleRaceScene.ts:342-374`
- Modify: `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

**Interfaces:**
- Consumes: `readonly TrackSample[]`, focused marble sample index, `CameraControlOffsets`.
- Produces: `writeTrackFollowShot(target, marblePosition, samples, sampleIndex, bounds)` and `enforceCameraClearance(target, localUp, minimum=5)`.

- [ ] **Step 1: Add banked-curve tests for route anchoring and post-control clearance**

```ts
it("anchors a follow shot on the sampled route behind a banked curve marble", () => {
  const samples = buildModularTrack(createValidTrackDesign()).samples;
  const sampleIndex = samples.findIndex((sample) => Math.abs(sample.bankRadians) > 0.1);
  const target = mutableShot();
  writeTrackFollowShot(target, samples[sampleIndex].position, samples, sampleIndex, getTrackBounds(samples));
  expect(Number.isFinite(target.position.x + target.position.y + target.position.z)).toBe(true);
  expect(dot(subtract(target.position, target.lookAt), samples[sampleIndex].up)).toBeGreaterThanOrEqual(5);
});

it("keeps extreme controls above the local rail", () => {
  const target = mutableShot();
  writeControlledTrackFollowShot(target, directed, bankedUp, { yaw: 0, pitch: -0.55, zoom: 0.55, panY: -24 });
  expect(dot(subtract(target.position, target.lookAt), bankedUp)).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2: Run camera tests and verify they fail**

Run: `npm test -- --run src/react-app/game/cameraPlan.test.ts`

Expected: FAIL because the signature and clearance guard do not exist.

- [ ] **Step 3: Anchor behind the marble by sample distance and enforce clearance after controls**

```ts
const cameraAnchor = (samples: readonly TrackSample[], sampleIndex: number, behind = 6): TrackSample => {
  const focus = samples[Math.max(0, Math.min(samples.length - 1, sampleIndex))] ?? samples[0];
  const targetDistance = (focus?.distance ?? 0) - behind;
  let index = Math.max(0, sampleIndex);
  while (index > 0 && samples[index].distance > targetDistance) index -= 1;
  return samples[index] ?? focus;
};

export const enforceCameraClearance = (target: CameraShot, up: Vec3, minimum = 5): CameraShot => {
  const height = (target.position.x - target.lookAt.x) * up.x + (target.position.y - target.lookAt.y) * up.y + (target.position.z - target.lookAt.z) * up.z;
  if (height < minimum) {
    const correction = minimum - height;
    target.position.x += up.x * correction; target.position.y += up.y * correction; target.position.z += up.z * correction;
  }
  return target;
};
```

`writeTrackFollowShot` sets the camera at `anchor.position + 5 * anchor.up`, looks at the marble plus `0.45 * focus.up`, calls `writeClip`, and applies `enforceCameraClearance`. `writeControlledTrackFollowShot` calls the same guard after yaw/pitch/zoom/pan.

- [ ] **Step 4: Pass course samples and target index from the scene; update camera orientation order**

```ts
writeTrackFollowShot(cameraShot, target.position, course.samples, target.sampleIndex, bounds);
camera.up.lerp(cameraUpTarget, 0.05).normalize();
camera.position.lerp(cameraTarget, 0.042);
cameraLook.lerp(cameraFocus, 0.05);
camera.lookAt(cameraLook);
```

- [ ] **Step 5: Run camera and lifecycle tests, then commit Task 3**

Run: `npm test -- --run src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts`

Expected: both files PASS.

```bash
git add src/react-app/game/cameraPlan.ts src/react-app/game/cameraPlan.test.ts src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts
git commit -m "fix: keep follow camera above curves"
```

### Task 4: Stronger pinwheel, funnel, and bumpers

**Files:**
- Modify: `src/react-app/game/modular/moduleDevices.ts:8-15,150-206`
- Modify: `src/react-app/game/modular/moduleDevices.test.ts`
- Modify: `src/react-app/game/modular/modulePath.ts:99-109,261-263`
- Modify: `src/react-app/game/modular/modulePath.test.ts:92-107`
- Modify: `src/react-app/game/modular/modularTrackRender.ts:96-111`
- Modify: `src/react-app/game/modular/modularTrackRender.test.ts:73-105`
- Modify: `src/react-app/game/modular/modularTrackPhysics.ts:18-24,208-244,262-281`
- Modify: `src/react-app/game/modular/modularTrackPhysics.test.ts`

**Interfaces:**
- Consumes/produces unchanged `ModuleDevices`, `PinwheelLayout`, `moduleWidthAt`, and `ModularDevicePose`; descriptor values become the single source for render and physics.

- [ ] **Step 1: Change focused expectations first**

```ts
expect(devices.pinwheels[0]).toMatchObject({ radius: 4, angularSpeed: 5 });
expect(devices.pinwheels[0]!.minimumPassage).toBe(12 - 2 * 4);
expect(devices.bumpers.filter((bar) => bar.cellIndex === bumperCell)).toHaveLength(5);
expect(moduleWidthAt("funnel", 0.3)).toBeCloseTo(9.6, 12);
expect(moduleWidthAt("funnel", 0.7)).toBeCloseTo(9.6, 12);
```

Add a render assertion that the `CapsuleGeometry` radius is `layout.armThickness / 2` and length is `layout.radius - layout.armThickness`. Add a pose assertion that one 1/60-second step advances the pinwheel by `layout.angularSpeed / 60`.

- [ ] **Step 2: Run the device/path/render/physics files and verify RED**

Run: `npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts`

Expected: FAIL only on old constants, three-bar layout, two-unit funnel, hard-coded render geometry, and hard-coded angular step.

- [ ] **Step 3: Apply the approved descriptor and layout values**

```ts
const PINWHEEL_RADIUS = 4;
const PINWHEEL_ANGULAR_SPEED = 5;
const BUMPER_PLACEMENTS = [[0.25, -1], [0.375, 1], [0.5, -1], [0.625, 1], [0.75, -1]] as const;
// In resolveBumpers, replace the inline three-item tuple with:
for (const [localU, sign] of BUMPER_PLACEMENTS) {
  const frame = frameAtCellU(samples, cellIndex, localU);
  if (frame === undefined) continue;
  const inward = scale(frame.side, -sign);
  const axis = rotate(inward, frame.tangent, BUMPER_TIP_ANGLE);
  const up = normalize(subtract(frame.up, scale(axis, dot(frame.up, axis))));
  values.push(Object.freeze({
    cellIndex, localU,
    center: add(add(frame.position, scale(frame.side, sign * (CHANNEL_WIDTH / 2 - BUMPER_LENGTH / 2))), scale(frame.up, BUMPER_HEIGHT / 2)),
    forward: frame.tangent, axis, up, tipDirection: axis,
    length: BUMPER_LENGTH, thickness: BUMPER_THICKNESS, height: BUMPER_HEIGHT,
    clearPassage: CHANNEL_WIDTH - BUMPER_LENGTH * 2,
    distanceFromNearestSeam: Math.max(LANDING_LENGTH, Math.min(localU, 1 - localU) * MODULE_SIZE),
  }));
}
minimumPassage: CHANNEL_WIDTH - 2 * PINWHEEL_RADIUS,
```

For the funnel, change `taper` from `0.4375` to `0.25` and seed adaptive sampling with `[0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]`.

- [ ] **Step 4: Remove pinwheel literals and strengthen bumper contact**

```ts
const armGeometry = new THREE.CapsuleGeometry(layout.armThickness / 2, layout.radius - layout.armThickness, 4, 8);
angles = angles.map((_angle, index) => elapsedSeconds * (devices.pinwheels[index]?.angularSpeed ?? 0));
const BUMPER_RESTITUTION = 0.65;
```

Apply `.setRestitutionCombineRule(rapier.CoefficientCombineRule.Max)` to the bumper shaft and both cap descriptors only.

- [ ] **Step 5: Add one direct bumper rebound assertion**

```ts
it("rebounds a marble from a bumper like a pinball", async () => {
  await initializeTrackPhysics();
  const world = createTrackPhysicsWorld({ x: 0, y: 0, z: 0 });
  const built = buildModularTrack(createWorstCaseTrackDesign());
  const resources = createModularPhysics(world, built);
  const bumper = resolveModuleDevices(built.track, built.route, built.samples).bumpers[0]!;
  const rapier = getInitializedTrackPhysicsRapier();
  const rawNormal = {
    x: bumper.up.y * bumper.axis.z - bumper.up.z * bumper.axis.y,
    y: bumper.up.z * bumper.axis.x - bumper.up.x * bumper.axis.z,
    z: bumper.up.x * bumper.axis.y - bumper.up.y * bumper.axis.x,
  };
  const length = Math.hypot(rawNormal.x, rawNormal.y, rawNormal.z);
  const normal = { x: rawNormal.x / length, y: rawNormal.y / length, z: rawNormal.z / length };
  const clearance = bumper.thickness / 2 + MARBLE_DIAMETER / 2 + 0.08;
  const start = { x: bumper.center.x + normal.x * clearance, y: bumper.center.y + normal.y * clearance, z: bumper.center.z + normal.z * clearance };
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true));
  world.createCollider(rapier.ColliderDesc.ball(MARBLE_DIAMETER / 2).setRestitution(0.08), body);
  body.setLinvel({ x: -normal.x * 8, y: -normal.y * 8, z: -normal.z * 8 }, true);
  for (let step = 0; step < 120 && dot(body.linvel(), normal) <= 0.5; step += 1) world.step();
  expect(dot(body.linvel(), normal)).toBeGreaterThan(0.5);
  resources.dispose(); world.free();
});
```

Do not add a general collision-event system.

- [ ] **Step 6: Run focused tests and the existing 100-marble acceptance once**

Run: `npm test -- --run src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/modular/modularTrackPhysics.test.ts`

Expected: all four files PASS, including the existing 100-marble timeout/cap checks.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/react-app/game/modular/moduleDevices.ts src/react-app/game/modular/moduleDevices.test.ts src/react-app/game/modular/modulePath.ts src/react-app/game/modular/modulePath.test.ts src/react-app/game/modular/modularTrackRender.ts src/react-app/game/modular/modularTrackRender.test.ts src/react-app/game/modular/modularTrackPhysics.ts src/react-app/game/modular/modularTrackPhysics.test.ts
git commit -m "feat: strengthen modular race devices"
```

### Task 5: Explicit editor selection and separate OUT count

**Files:**
- Modify: `src/react-app/components/TrackEditor.tsx:30-76`
- Modify: `src/react-app/components/TrackEditor.test.tsx`
- Modify: `src/react-app/App.css:3`
- Modify: `src/react-app/game/MarbleRaceScene.ts:18-25,397-420`
- Modify: `src/react-app/game/MarbleRaceScene.lifecycle.test.ts`
- Modify: `src/react-app/App.tsx:20-41,75-95,134`
- Modify: `src/react-app/App.test.tsx`
- Modify: `src/react-app/components/RaceHud.tsx`

**Interfaces:**
- Produces tick payload `{ type:"tick"; elapsedMs; finishedCount; eliminatedCount; remaining; leader?; trailer? }`.
- Produces `RaceHud` prop `eliminatedCount: number`; public race start/control interfaces stay unchanged.

- [ ] **Step 1: Add editor selection and explicit replacement tests**

```tsx
await user.click(screen.getByRole("gridcell", { name: /row 1 column 2/i }));
expect(screen.getByRole("gridcell", { name: /row 1 column 2/i })).toHaveAttribute("aria-selected", "true");
await user.click(screen.getByRole("button", { name: "Booster module" }));
expect(screen.getByRole("button", { name: /replace cell 2 with booster/i })).toBeEnabled();
```

Retain the existing test proving palette → occupied cell changes Straight to Booster.

- [ ] **Step 2: Add scene/App tests for finish and elimination semantics**

Capture full emitted events in `MarbleRaceScene.lifecycle.test.ts`. Drive one mocked body to non-finite DNF and assert the next tick has `finishedCount:0` and `eliminatedCount:1`. In `App.test.tsx`, invoke the captured scene callback with:

```ts
{ type: "tick", elapsedMs: 1000, finishedCount: 3, eliminatedCount: 2, remaining: [], leader: undefined, trailer: undefined }
```

Assert the HUD shows `DONE 3/100` and `OUT 2`. Emit `timeout` afterward and assert `OUT 2` remains unchanged.

- [ ] **Step 3: Run the UI/lifecycle tests and verify RED**

Run: `npm test -- --run src/react-app/components/TrackEditor.test.tsx src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/App.test.tsx`

Expected: FAIL because selection state is not exposed and tick/HUD lack `eliminatedCount`.

- [ ] **Step 4: Add persistent selected-cell styling and explicit action copy**

```tsx
const selected = state.selectedCell === index;
<button
  role="gridcell"
  className={`track-cell ${cell === null ? "empty" : "occupied"} ${fixed ? "fixed" : ""} ${selected ? "selected" : ""}`}
  aria-selected={selected}
  /* existing handlers */
/>
```

Change the generic button label to ``Replace cell ${(menuCell ?? state.selectedCell) + 1} with ${state.selectedKind}`` and add an `aria-live="polite"` armed message: ``${state.selectedKind} selected. Tap a cell to place or replace it.``

```css
.track-cell.selected{border-color:#70f5ff;background:#1b3762;box-shadow:0 0 0 2px #70f5ff55,0 0 18px #38dceb77}
```

- [ ] **Step 5: Separate scene outcomes without changing timeout behavior**

Add `eliminated: boolean` to `Ball`, initialized `false`. On either DNF branch set both `done=true` and `eliminated=true`; on finish set only `done=true`.

```ts
const eliminatedCount = balls.reduce((count, ball) => count + Number(ball.eliminated), 0);
const finishedCount = balls.reduce((count, ball) => count + Number(ball.done && !ball.eliminated), 0);
emit({ type: "tick", elapsedMs, finishedCount, eliminatedCount, remaining: liveBalls.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble });
```

Timeout emits no outcome change, so late marbles stay active.

- [ ] **Step 6: Thread `eliminatedCount` through App and RaceHud**

```tsx
type Hud = { elapsedMs: number; finishedCount: number; eliminatedCount: number; leader?: Marble; trailer?: Marble };
// all resets use { elapsedMs: 0, finishedCount: 0, eliminatedCount: 0 }
<RaceHud {...hud} total={session.marbles.length} />
```

Render a fourth bottom badge `<span>OUT {eliminatedCount}</span>` and leave `DONE {finishedCount}/{total}` unchanged.

- [ ] **Step 7: Run focused tests and commit Task 5**

Run: `npm test -- --run src/react-app/components/TrackEditor.test.tsx src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/App.test.tsx`

Expected: all three files PASS.

```bash
git add src/react-app/components/TrackEditor.tsx src/react-app/components/TrackEditor.test.tsx src/react-app/App.css src/react-app/game/MarbleRaceScene.ts src/react-app/game/MarbleRaceScene.lifecycle.test.ts src/react-app/App.tsx src/react-app/App.test.tsx src/react-app/components/RaceHud.tsx
git commit -m "feat: clarify track editing and race outcomes"
```

### Task 6: Integrated verification and documentation consistency

**Files:**
- Modify only if required by observed behavior: `docs/superpowers/specs/2026-09-04-curve-race-feel-design.md`
- Verify: entire repository

**Interfaces:**
- Consumes all Task 1-5 changes; produces no new runtime interface.

- [ ] **Step 1: Run the production build**

Run: `npm run build`

Expected: TypeScript and both Vite targets build successfully. Existing large-chunk warnings are non-blocking.

- [ ] **Step 2: Run the full test suite once**

Run: `npm test -- --run`

Expected: all test files pass; only existing explicitly skipped validation cases remain skipped.

- [ ] **Step 3: Run the existing repository checks**

Run: `npm run lint`

Run: `npm run check`

Expected: lint, TypeScript, Vite build, and Wrangler dry-run all succeed.

- [ ] **Step 4: Inspect the integrated diff and spec coverage**

Run: `git diff --check`

Confirm the diff contains no dependency or serialized track-format change, no floor texture, no hidden collider/recovery, and that each exact constant in Global Constraints appears in code or an assertion.

- [ ] **Step 5: Commit only an actual consistency correction, otherwise leave no extra commit**

```bash
git add docs/superpowers/specs/2026-09-04-curve-race-feel-design.md
git commit -m "docs: align curve race feedback specification"
```

Run this commit only if Step 4 required a real documentation correction. Do not create an empty integration commit.
