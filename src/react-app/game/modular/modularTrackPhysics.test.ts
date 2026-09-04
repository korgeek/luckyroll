import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import {
  applyBoosterVelocity,
  createModularLaunchPositions,
  createBoosterState,
  createModularPhysics,
  runModularValidationRace,
  runModularSeamProbe,
} from "./modularTrackPhysics";
import {
  createMarbleBodies,
  createTrackPhysicsWorld,
  getInitializedTrackPhysicsRapier,
  initializeTrackPhysics,
} from "../track/trackPhysics";
import { resolveModuleDevices } from "./moduleDevices";

const rotate = (quaternion: { x: number; y: number; z: number; w: number }, vector: { x: number; y: number; z: number }) => ({
  x: (1 - 2 * (quaternion.y ** 2 + quaternion.z ** 2)) * vector.x + 2 * (quaternion.x * quaternion.y - quaternion.z * quaternion.w) * vector.y + 2 * (quaternion.x * quaternion.z + quaternion.y * quaternion.w) * vector.z,
  y: 2 * (quaternion.x * quaternion.y + quaternion.z * quaternion.w) * vector.x + (1 - 2 * (quaternion.x ** 2 + quaternion.z ** 2)) * vector.y + 2 * (quaternion.y * quaternion.z - quaternion.x * quaternion.w) * vector.z,
  z: 2 * (quaternion.x * quaternion.z - quaternion.y * quaternion.w) * vector.x + 2 * (quaternion.y * quaternion.z + quaternion.x * quaternion.w) * vector.y + (1 - 2 * (quaternion.x ** 2 + quaternion.y ** 2)) * vector.z,
});
const inverseRotate = (quaternion: { x: number; y: number; z: number; w: number }, vector: { x: number; y: number; z: number }) => rotate({ x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w }, vector);
const multiplyQuaternion = (a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
const rotationAroundY = (radians: number) => ({ x: 0, y: Math.sin(radians / 2), z: 0, w: Math.cos(radians / 2) });

describe("modular track physics", () => {
  it("creates one fixed welded trimesh with internal-edge fixing", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const resources = createModularPhysics(world, buildModularTrack(createValidTrackDesign()));
    const rapier = getInitializedTrackPhysicsRapier();
    expect(resources.trackCollider.shapeType()).toBe(rapier.ShapeType.TriMesh);
    expect((resources.trackCollider.shape as InstanceType<typeof rapier.TriMesh>).flags & rapier.TriMeshFlags.FIX_INTERNAL_EDGES).toBeTruthy();
    resources.dispose();
    world.free();
  });

  it("observes bumper physics frames and descriptor dimensions", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const resources = createModularPhysics(world, built);
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    const rapier = getInitializedTrackPhysicsRapier();
    const bumpers = resources.fixedColliders.filter((collider) => collider.shapeType() === rapier.ShapeType.Cuboid || collider.shapeType() === rapier.ShapeType.Cylinder);
    expect(bumpers).toHaveLength(devices.bumpers.length * 3);
    for (let index = 0; index < devices.bumpers.length; index += 1) {
      const bumper = devices.bumpers[index]!;
      const shaft = bumpers[index * 3]!;
      const firstCap = bumpers[index * 3 + 1]!;
      const secondCap = bumpers[index * 3 + 2]!;
      const body = shaft.parent();
      expect(body).not.toBeNull();
      if (!body) continue;
      const worldX = rotate(body.rotation(), { x: 1, y: 0, z: 0 });
      const worldY = rotate(body.rotation(), { x: 0, y: 1, z: 0 });
      const worldZ = rotate(body.rotation(), { x: 0, y: 0, z: 1 });
      const up = bumper.up; const axis = bumper.axis; const rightHanded = { x: up.y * axis.z - up.z * axis.y, y: up.z * axis.x - up.x * axis.z, z: up.x * axis.y - up.y * axis.x };
      const alignment = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) => left.x * right.x + left.y * right.y + left.z * right.z;
      expect(alignment(worldX, up)).toBeCloseTo(1, 6);
      expect(alignment(worldY, axis)).toBeCloseTo(1, 6);
      expect(alignment(worldZ, rightHanded)).toBeCloseTo(1, 6);
      const shaftExtents = shaft.halfExtents();
      expect(shaftExtents.x).toBeCloseTo(bumper.height / 2, 6);
      expect(shaftExtents.y).toBeCloseTo((bumper.length - bumper.thickness) / 2, 6);
      expect(shaftExtents.z).toBeCloseTo(bumper.thickness / 2, 6);
      for (const cap of [firstCap, secondCap]) {
        expect(cap.shapeType()).toBe(rapier.ShapeType.Cylinder);
        expect(cap.halfHeight()).toBeCloseTo(bumper.height / 2, 6);
        expect(cap.radius()).toBeCloseTo(bumper.thickness / 2, 6);
        expect(Math.abs(alignment(rotate(cap.rotation(), { x: 0, y: 1, z: 0 }), up))).toBeCloseTo(1, 6);
      }
    }
    resources.dispose(); world.free();
  });

  it("boosts only positive forward velocity once and never brakes", () => {
    const state = createBoosterState(8, 40);
    expect(applyBoosterVelocity({ x: 10, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 6)).toEqual({ x: 12, y: 2, z: 3 });
    expect(applyBoosterVelocity({ x: 20, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 7)).toEqual({ x: 20, y: 2, z: 3 });
    expect(applyBoosterVelocity({ x: 10, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, state, 1, 7)).toEqual({ x: 10, y: 2, z: 3 });
    const compact = createBoosterState(2, 3);
    expect(applyBoosterVelocity({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, compact, 2, 1, 3)).toEqual({ x: 12, y: 0, z: 0 });
  });

  it("creates deterministic non-overlapping bowl launch positions without stepping", () => {
    const built = buildModularTrack(createValidTrackDesign());
    const first = createModularLaunchPositions(100, built, 23);
    const second = createModularLaunchPositions(100, built, 23);
    expect(second).toEqual(first);
    for (let left = 0; left < first.length; left += 1) for (let right = left + 1; right < first.length; right += 1) {
      const a = first[left]; const b = first[right];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThanOrEqual(0.68);
    }
  });

  it("keeps pinwheel capsule frames radial and advances the body by local-Y spin", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const resources = createModularPhysics(world, built);
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    const pinwheel = devices.pinwheels[0]!;
    const body = resources.pinwheelBodies[0]!;
    const baseRotation = body.rotation();
    expect(body.numColliders()).toBe(3);
    for (let arm = 0; arm < 3; arm += 1) {
      const radial = { x: Math.cos(arm * Math.PI * 2 / 3), y: 0, z: Math.sin(arm * Math.PI * 2 / 3) };
      const collider = body.collider(arm);
      expect(collider.shapeType()).toBe((getInitializedTrackPhysicsRapier()).ShapeType.Capsule);
      const localTranslation = inverseRotate(baseRotation, {
        x: collider.translation().x - body.translation().x,
        y: collider.translation().y - body.translation().y,
        z: collider.translation().z - body.translation().z,
      });
      expect(localTranslation.x).toBeCloseTo(radial.x * pinwheel.radius / 2, 6);
      expect(localTranslation.y).toBeCloseTo(0, 6);
      expect(localTranslation.z).toBeCloseTo(radial.z * pinwheel.radius / 2, 6);
      const localLongAxis = inverseRotate(baseRotation, rotate(collider.rotation(), { x: 0, y: 1, z: 0 }));
      expect(localLongAxis.x).toBeCloseTo(radial.x, 6);
      expect(localLongAxis.y).toBeCloseTo(0, 6);
      expect(localLongAxis.z).toBeCloseTo(radial.z, 6);
    }
    const first = resources.stepBeforeWorld();
    world.step();
    const expectedRotation = multiplyQuaternion(baseRotation, rotationAroundY(first.pinwheelAngles[0]!));
    const actualRotation = body.rotation();
    const quaternionAlignment = Math.abs(expectedRotation.x * actualRotation.x + expectedRotation.y * actualRotation.y + expectedRotation.z * actualRotation.z + expectedRotation.w * actualRotation.w);
    expect(quaternionAlignment).toBeCloseTo(1, 6);
    expect(resources.reset().pinwheelAngles[0]).toBe(0);
    resources.dispose(); world.free();
  });

  it.each([8, 18, 42] as const)("keeps representative seam probes contained at speed %i", async (speed) => {
    for (const lateral of [0, 12 / 2 - 1.5 * 0.68, -(12 / 2 - 1.5 * 0.68)]) {
      const result = await runModularSeamProbe({ speed, lateral });
      expect(result.maxNormalVelocityDelta).toBeLessThanOrEqual(0.05);
      expect(result.maxForwardLossRatio).toBeLessThanOrEqual(0.01);
      expect(result.escapes).toBe(0);
    }
  });

  it("opens the physical gate before launching at exactly eight forward units per second", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const [body] = createMarbleBodies(world, createModularLaunchPositions(1, built, 11));
    let launchedVelocity;
    for (let step = 0; step < 43; step += 1) {
      const pose = resources.stepBeforeWorld();
      world.step();
      resources.stepAfterWorld([body]);
      if (pose.gateOpen && launchedVelocity === undefined) launchedVelocity = body.linvel();
    }
    const forward = built.samples[0].tangent;
    expect(launchedVelocity).toBeDefined();
    if (launchedVelocity === undefined) throw new Error("Gate did not launch the marble.");
    expect(launchedVelocity.x * forward.x + launchedVelocity.y * forward.y + launchedVelocity.z * forward.z).toBeCloseTo(8, 5);
    resources.dispose(); world.free();
  });

  it("consumes only a forward swept booster crossing and clears it on reset", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const resources = createModularPhysics(world, built);
    const booster = resolveModuleDevices(built.track, built.route, built.samples).boosters[0]!;
    const [body] = createMarbleBodies(world, [{ ...booster.center, crossOffset: 0, row: 0, column: 0, physicalLaunchPosition: true }]);
    const at = (along: number): { x: number; y: number; z: number } => ({ x: booster.center.x + booster.forward.x * along, y: booster.center.y + booster.forward.y * along, z: booster.center.z + booster.forward.z * along });
    const outside = (booster.endDistance - booster.startDistance) / 2 + 1;
    resources.reset(); body.setTranslation(at(outside), true); body.setLinvel({ x: -booster.forward.x * 10, y: -booster.forward.y * 10, z: -booster.forward.z * 10 }, true); resources.stepAfterWorld([body]);
    body.setTranslation(at(-outside), true);
    const wrongWayVelocity = body.linvel();
    expect(resources.stepAfterWorld([body])).toHaveLength(0);
    const afterWrongWayVelocity = body.linvel();
    expect(afterWrongWayVelocity).toEqual(wrongWayVelocity);
    body.setTranslation(at(outside), true); body.setLinvel({ x: booster.forward.x * 10, y: booster.forward.y * 10, z: booster.forward.z * 10 }, true);
    expect(resources.stepAfterWorld([body])).toHaveLength(1);
    body.setTranslation(at(-outside), true); body.setLinvel({ x: -booster.forward.x * 10, y: -booster.forward.y * 10, z: -booster.forward.z * 10 }, true);
    expect(resources.stepAfterWorld([body])).toHaveLength(0);
    resources.reset(); body.setTranslation(at(-outside), true); resources.stepAfterWorld([body]);
    body.setTranslation(at(-outside), true); body.setLinvel({ x: booster.forward.x * 10, y: booster.forward.y * 10, z: booster.forward.z * 10 }, true);
    expect(resources.stepAfterWorld([body])).toHaveLength(0);
    resources.reset(); body.setTranslation(at(-outside), true); resources.stepAfterWorld([body]);
    body.setTranslation(at(outside), true); body.setLinvel({ x: booster.forward.x * 10, y: booster.forward.y * 10, z: booster.forward.z * 10 }, true);
    expect(resources.stepAfterWorld([body])).toHaveLength(1);
    resources.dispose(); world.free();
  });

  it("runs a deterministic small modular validation race without requiring completion", async () => {
    const options = { track: createValidTrackDesign(), seed: 23, marbleCount: 2, durationSeconds: 1 } as const;
    const first = await runModularValidationRace(options);
    const second = await runModularValidationRace(options);
    expect(second).toEqual(first);
    expect(first.seed).toBe(23);
    expect(first.finishOrder).toEqual([]);
    expect(first.boosterCapViolations).toEqual([]);
  });
});
