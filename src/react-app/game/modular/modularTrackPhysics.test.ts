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
import { MARBLE_DIAMETER } from "./modularTypes";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

const rotate = (quaternion: { x: number; y: number; z: number; w: number }, vector: { x: number; y: number; z: number }) => ({
  x: (1 - 2 * (quaternion.y ** 2 + quaternion.z ** 2)) * vector.x + 2 * (quaternion.x * quaternion.y - quaternion.z * quaternion.w) * vector.y + 2 * (quaternion.x * quaternion.z + quaternion.y * quaternion.w) * vector.z,
  y: 2 * (quaternion.x * quaternion.y + quaternion.z * quaternion.w) * vector.x + (1 - 2 * (quaternion.x ** 2 + quaternion.z ** 2)) * vector.y + 2 * (quaternion.y * quaternion.z - quaternion.x * quaternion.w) * vector.z,
  z: 2 * (quaternion.x * quaternion.z - quaternion.y * quaternion.w) * vector.x + 2 * (quaternion.y * quaternion.z + quaternion.x * quaternion.w) * vector.y + (1 - 2 * (quaternion.x ** 2 + quaternion.y ** 2)) * vector.z,
});
const multiplyQuaternion = (a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
const rotationAroundY = (radians: number) => ({ x: 0, y: Math.sin(radians / 2), z: 0, w: Math.cos(radians / 2) });

describe("modular track physics", () => {
  it("creates one welded track mesh without a legacy rear collider", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const rapier = getInitializedTrackPhysicsRapier();
    expect(resources.trackCollider.shapeType()).toBe(rapier.ShapeType.TriMesh);
    expect((resources.trackCollider.shape as InstanceType<typeof rapier.TriMesh>).flags & rapier.TriMeshFlags.FIX_INTERNAL_EDGES).toBeTruthy();
    expect(resources.fixedColliders).toHaveLength(0);
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
    const bumpers = resources.fixedColliders;
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

  it("randomizes 100 non-overlapping launch slots across the first channel", () => {
    const built = buildModularTrack(createValidTrackDesign());
    const first = createModularLaunchPositions(100, built, 23);
    const second = createModularLaunchPositions(100, built, 23);
    const otherSeed = createModularLaunchPositions(100, built, 37);
    expect(second).toEqual(first);
    expect(otherSeed.map(({ row, column }) => [row, column])).not.toEqual(first.map(({ row, column }) => [row, column]));
    expect(new Set(first.map(({ row, column }) => `${row}:${column}`)).size).toBe(100);
    expect(first.every(({ row, column }) => row >= 0 && row < 10 && column >= 0 && column < 10)).toBe(true);
    const start = resolveModuleDevices(built.track, built.route, built.samples).start;
    const gateOffset = { x: start.gate.center.x - start.frame.position.x, y: start.gate.center.y - start.frame.position.y, z: start.gate.center.z - start.frame.position.z };
    const gateNearFace = gateOffset.x * start.frame.tangent.x + gateOffset.y * start.frame.tangent.y + gateOffset.z * start.frame.tangent.z - start.gate.depth / 2;
    for (const position of first) {
      const offset = { x: position.x - start.frame.position.x, y: position.y - start.frame.position.y, z: position.z - start.frame.position.z };
      const along = offset.x * start.frame.tangent.x + offset.y * start.frame.tangent.y + offset.z * start.frame.tangent.z;
      expect(along).toBeGreaterThan(0);
      expect(along - MARBLE_DIAMETER / 2).toBeGreaterThanOrEqual(0.25);
      expect(along + MARBLE_DIAMETER / 2).toBeLessThanOrEqual(gateNearFace);
    }
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
    const baseTranslation = body.translation();
    body.setTranslation({ x: 0, y: 0, z: 0 }, false);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
    world.propagateModifiedBodyPositionsToColliders();
    expect(body.numColliders()).toBe(3);
    for (let arm = 0; arm < 3; arm += 1) {
      const radial = { x: Math.cos(arm * Math.PI * 2 / 3), y: 0, z: Math.sin(arm * Math.PI * 2 / 3) };
      const collider = body.collider(arm);
      expect(collider.shapeType()).toBe((getInitializedTrackPhysicsRapier()).ShapeType.Capsule);
      const localTranslation = collider.translation();
      expect(localTranslation.x).toBeCloseTo(radial.x * pinwheel.radius / 2, 6);
      expect(localTranslation.y).toBeCloseTo(0, 6);
      expect(localTranslation.z).toBeCloseTo(radial.z * pinwheel.radius / 2, 6);
      const localLongAxis = rotate(collider.rotation(), { x: 0, y: 1, z: 0 });
      expect(localLongAxis.x).toBeCloseTo(radial.x, 6);
      expect(localLongAxis.y).toBeCloseTo(0, 6);
      expect(localLongAxis.z).toBeCloseTo(radial.z, 6);
    }
    body.setTranslation(baseTranslation, false);
    body.setRotation(baseRotation, false);
    world.propagateModifiedBodyPositionsToColliders();
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

  it("opens the gate after 700 ms and advances one physical pusher", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(world.colliders.len()).toBe(3 + devices.bumpers.length * 3 + devices.pinwheels.length * 3);
    expect(resources.fixedColliders).toHaveLength(devices.bumpers.length * 3);
    expect(resources.pusherBody).toBeDefined();
    if (!resources.pusherBody) throw new Error("Missing physical start pusher.");
    const pusherCollider = resources.pusherBody.collider(0);
    expect(resources.pusherBody.numColliders()).toBe(1);
    expect(pusherCollider.shapeType()).toBe(getInitializedTrackPhysicsRapier().ShapeType.Cuboid);
    expect(pusherCollider.halfExtents().x).toBeCloseTo(devices.start.pusher.width / 2, 6);
    expect(pusherCollider.halfExtents().y).toBeCloseTo(devices.start.pusher.height / 2, 6);
    expect(pusherCollider.halfExtents().z).toBeCloseTo(devices.start.pusher.depth / 2, 6);
    const initial = resources.reset();
    expect(initial.gateOpen).toBe(false);
    expect(initial.pusherCenter).toEqual(devices.start.pusher.center);
    expect(resources.pusherBody.translation().x).toBeCloseTo(devices.start.pusher.center.x, 6);
    expect(resources.pusherBody.translation().y).toBeCloseTo(devices.start.pusher.center.y, 6);
    expect(resources.pusherBody.translation().z).toBeCloseTo(devices.start.pusher.center.z, 6);
    for (let step = 0; step < 41; step += 1) expect(resources.stepBeforeWorld().pusherCenter).toEqual(initial.pusherCenter);
    expect(resources.stepBeforeWorld().gateOpen).toBe(true);
    const moving = resources.stepBeforeWorld();
    expect(dot(subtract(moving.pusherCenter, initial.pusherCenter), devices.start.frame.tangent)).toBeGreaterThan(0);
    world.step();
    expect(resources.pusherBody.translation().x).toBeCloseTo(moving.pusherCenter.x, 6);
    expect(resources.pusherBody.translation().y).toBeCloseTo(moving.pusherCenter.y, 6);
    expect(resources.pusherBody.translation().z).toBeCloseTo(moving.pusherCenter.z, 6);
    resources.dispose(); world.free();
  });

  it("resets the pusher deterministically and sweeps immediately on a remaining-marble restart", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const pusher = resolveModuleDevices(built.track, built.route, built.samples).start.pusher;
    for (let step = 0; step < 50; step += 1) resources.stepBeforeWorld();
    expect(resources.reset()).toMatchObject({ gateOpen: false, pusherCenter: pusher.center });
    expect(resources.pusherBody.translation().x).toBeCloseTo(pusher.center.x, 6);
    expect(resources.pusherBody.translation().y).toBeCloseTo(pusher.center.y, 6);
    expect(resources.pusherBody.translation().z).toBeCloseTo(pusher.center.z, 6);
    const restart = resources.reset(true);
    expect(restart).toMatchObject({ gateOpen: true, pusherCenter: pusher.center });
    const moving = resources.stepBeforeWorld();
    expect(dot(subtract(moving.pusherCenter, restart.pusherCenter), pusher.tangent)).toBeGreaterThan(0);
    resources.dispose(); world.free();
  });

  it("does not inject launch velocity after the gate opens", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const [body] = createMarbleBodies(world, createModularLaunchPositions(1, built, 11));
    for (let step = 0; step < 42; step += 1) resources.stepBeforeWorld();
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    resources.stepAfterWorld([body]);
    expect(body.linvel()).toEqual({ x: 0, y: 0, z: 0 });
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

  it("physically pushes all 100 marbles past the gate within 2.5 seconds", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const built = buildModularTrack(createValidTrackDesign());
    const resources = createModularPhysics(world, built);
    const start = resolveModuleDevices(built.track, built.route, built.samples).start;
    const bodies = createMarbleBodies(world, createModularLaunchPositions(100, built, 23));
    const crossingTimes = new Array<number | undefined>(bodies.length).fill(undefined);
    const escapes = new Set<number>();
    const nonFinite = new Set<number>();
    let postGateSteps = 0;
    while (postGateSteps < 150 && crossingTimes.some((time) => time === undefined)) {
      const pose = resources.stepBeforeWorld();
      world.step();
      resources.stepAfterWorld(bodies);
      if (pose.gateOpen) postGateSteps += 1;
      bodies.forEach((body, index) => {
        if (crossingTimes[index] !== undefined) return;
        const position = body.translation(); const velocity = body.linvel();
        if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z].every(Number.isFinite)) nonFinite.add(index + 1);
        const relative = subtract(position, start.gate.center);
        const along = dot(relative, start.frame.tangent);
        if (along >= 0) crossingTimes[index] = postGateSteps * 1_000 / 60;
        const lateral = dot(subtract(position, start.frame.position), start.frame.side);
        const height = dot(subtract(position, start.frame.position), start.frame.up);
        if (along < 0 && (Math.abs(lateral) > start.width / 2 + MARBLE_DIAMETER / 2 || height < -MARBLE_DIAMETER || height > start.wallHeight + MARBLE_DIAMETER)) escapes.add(index + 1);
      });
    }
    expect(nonFinite).toEqual(new Set());
    expect(escapes).toEqual(new Set());
    expect(crossingTimes.filter((time) => time === undefined)).toEqual([]);
    expect(Math.max(...crossingTimes.map((time) => time ?? Infinity))).toBeLessThanOrEqual(2_500);
    resources.dispose(); world.free();
  });
});
