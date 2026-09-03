import { describe, expect, it, vi } from "vitest";
import { buildObstacleGeometry, sampleStartBowlSurface } from "./obstacleGeometry";
import { MARBLE_DIAMETER, MARBLE_RADIUS, resolveObstacleLayout } from "./obstacleLayout";
import {
  BowlLaunchError,
  createBowlLaunchPositions,
  createDeviceController,
  createObstaclePhysics,
} from "./obstaclePhysics";
import { createObstacleRenderGroup, setDeviceRenderPose } from "./obstacleRender";
import { buildValidatedTrack } from "./trackBuild";
import { createTrackPhysicsWorld, getInitializedTrackPhysicsRapier, initializeTrackPhysics } from "./trackPhysics";

const track = buildValidatedTrack();
const resolved = resolveObstacleLayout(track.samples);
if (!resolved.ok) throw new Error("The canonical obstacle layout must resolve for physics tests.");
const geometry = buildObstacleGeometry(track.geometry, resolved);

const minimumPairDistance = (positions: readonly { x: number; y: number; z: number }[]): number => Math.min(
  ...positions.flatMap((position, index) => positions.slice(index + 1).map((other) => Math.hypot(
    position.x - other.x,
    position.y - other.y,
    position.z - other.z,
  ))),
);

const vectorDistance = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }): number =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
const rotate = (quaternion: { x: number; y: number; z: number; w: number }, vector: { x: number; y: number; z: number }) => ({
  x: (1 - 2 * (quaternion.y ** 2 + quaternion.z ** 2)) * vector.x + 2 * (quaternion.x * quaternion.y - quaternion.z * quaternion.w) * vector.y + 2 * (quaternion.x * quaternion.z + quaternion.y * quaternion.w) * vector.z,
  y: 2 * (quaternion.x * quaternion.y + quaternion.z * quaternion.w) * vector.x + (1 - 2 * (quaternion.x ** 2 + quaternion.z ** 2)) * vector.y + 2 * (quaternion.y * quaternion.z - quaternion.x * quaternion.w) * vector.z,
  z: 2 * (quaternion.x * quaternion.z - quaternion.y * quaternion.w) * vector.x + 2 * (quaternion.y * quaternion.z + quaternion.x * quaternion.w) * vector.y + (1 - 2 * (quaternion.x ** 2 + quaternion.y ** 2)) * vector.z,
});

describe("obstacle physics", () => {
  it.each([11, 23, 37, 41, 53, 67, 71, 83, 97, 101])("places 100 deterministic bowl marbles without overlap for seed %i", (seed) => {
    const positions = createBowlLaunchPositions(100, resolved.start, seed);

    expect(positions).toHaveLength(100);
    expect(minimumPairDistance(positions)).toBeGreaterThanOrEqual(MARBLE_DIAMETER);
    expect(positions.every((position) => position.physicalLaunchPosition)).toBe(true);
    expect(positions.every((position) => {
      const surface = sampleStartBowlSurface(resolved.start, position.bowlRadius, position.bowlAngle);
      return vectorDistance(position, {
        x: surface.position.x + surface.normal.x * (MARBLE_RADIUS + 0.01),
        y: surface.position.y + surface.normal.y * (MARBLE_RADIUS + 0.01),
        z: surface.position.z + surface.normal.z * (MARBLE_RADIUS + 0.01),
      }) < 0.000_001;
    })).toBe(true);
    expect([...new Set(positions.map((position) => position.bowlRadius))].every((radius, index, rings) =>
      index === 0 || radius - rings[index - 1] >= 0.72,
    )).toBe(true);
    expect(createBowlLaunchPositions(100, resolved.start, seed)).toEqual(positions);
  });

  it("fails closed instead of returning a partial bowl field", () => {
    expect(() => createBowlLaunchPositions(101, resolved.start, 11)).toThrow(BowlLaunchError);
    expect(() => createBowlLaunchPositions(1.5, resolved.start, 11)).toThrow(BowlLaunchError);
    expect(() => createBowlLaunchPositions(10, resolved.start, Number.NaN)).toThrow(BowlLaunchError);
  });

  it("keeps pusher poses opposite and opens the gate exactly after the shuffle", () => {
    const controller = createDeviceController(resolved);
    const firstPose = controller.step(1 / 60);

    expect(firstPose.pushers.left.depth + firstPose.pushers.right.depth).toBeCloseTo(9.4, 6);
    controller.advanceMs(1_483);
    expect(controller.pose().gateOpen).toBe(false);
    expect(controller.raceClockStarted()).toBe(false);
    controller.advanceMs(1 / 3);
    expect(controller.pose().gateOpen).toBe(true);
    expect(controller.raceClockStarted()).toBe(true);
  });

  it("resets device state deterministically and supports an explicitly open remaining-marble gate", () => {
    const controller = createDeviceController(resolved);
    controller.advanceMs(2_000);
    controller.reset();
    expect(controller.pose()).toEqual(controller.initialPose());
    controller.reset({ gateOpen: true });
    expect(controller.pose().gateOpen).toBe(true);
    expect(controller.raceClockStarted()).toBe(true);
  });

  it("uses the same device pose for pusher, gate, and agitator rendering", () => {
    const controller = createDeviceController(resolved);
    const pose = controller.step(1 / 60);
    const group = createObstacleRenderGroup(geometry, controller.initialPose());
    setDeviceRenderPose(group, pose);

    expect(vectorDistance(group.getObjectByName("pusher-left-mesh")!.position, pose.pusherTransforms.left.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(group.getObjectByName("release-gate")!.position, pose.gate.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(group.getObjectByName("start-agitator")!.position, pose.agitator.translation)).toBeLessThan(0.000_001);
    for (const [object, transform] of [[group.getObjectByName("pusher-left-mesh")!, pose.pusherTransforms.left], [group.getObjectByName("pusher-right-mesh")!, pose.pusherTransforms.right], [group.getObjectByName("release-gate")!, pose.gate], [group.getObjectByName("start-agitator")!, pose.agitator]] as const) expect(object.quaternion.toArray()).toEqual([transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w]);
  });

  it("holds the agitator at its exact shuffle-end pose after the gate opens", () => {
    const controller = createDeviceController(resolved);
    controller.advanceMs(1_500);
    const shuffleEnd = controller.pose().agitator.rotation;
    controller.advanceMs(10_000);
    expect(controller.pose().agitator.rotation).toEqual(shuffleEnd);
  });

  it("creates static obstacle colliders and writes each kinematic pose once per fixed step", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const physics = createObstaclePhysics(world, geometry);
    const kinematics = [physics.agitator, physics.gate, ...physics.pushers];
    const calls = kinematics.map(() => ({ translation: 0, rotation: 0 }));
    kinematics.forEach((body, index) => {
      const nextTranslation = body.setNextKinematicTranslation.bind(body);
      const nextRotation = body.setNextKinematicRotation.bind(body);
      body.setNextKinematicTranslation = (translation) => { calls[index].translation += 1; nextTranslation(translation); };
      body.setNextKinematicRotation = (rotation) => { calls[index].rotation += 1; nextRotation(rotation); };
    });

    const pose = physics.stepFixed();

    expect(physics.fixedColliders).toHaveLength(9);
    expect(physics.pegColliders).toHaveLength(7);
    expect(physics.pegBodies).toHaveLength(7);
    expect(physics.agitator.numColliders()).toBe(3);
    expect(physics.gate.numColliders()).toBe(1);
    expect(physics.pushers.map((body) => body.numColliders())).toEqual([1, 1]);
    const rapier = getInitializedTrackPhysicsRapier();
    expect(physics.fixedColliders.every((collider) => collider.shapeType() === rapier.ShapeType.TriMesh)).toBe(true);
    expect(physics.pegColliders.every((collider) => collider.shapeType() === rapier.ShapeType.Capsule)).toBe(true);
    physics.pegColliders.forEach((collider) => {
      expect(collider.radius()).toBeCloseTo(0.42, 6);
      expect(collider.halfHeight()).toBeCloseTo(0.155, 6);
    });
    expect(physics.pusherColliders.every((collider) => collider.shapeType() === rapier.ShapeType.Capsule)).toBe(true);
    expect(physics.agitator.bodyType()).toBe(rapier.RigidBodyType.KinematicPositionBased);
    expect(physics.gate.bodyType()).toBe(rapier.RigidBodyType.KinematicPositionBased);
    expect(physics.pegBodies.every((body) => body.bodyType() === rapier.RigidBodyType.Fixed)).toBe(true);
    expect([physics.agitator.collider(0), physics.gate.collider(0)].every((collider) => collider.shapeType() === rapier.ShapeType.Cuboid)).toBe(true);
    expect(calls).toEqual([
      { translation: 1, rotation: 1 }, { translation: 1, rotation: 1 },
      { translation: 1, rotation: 1 }, { translation: 1, rotation: 1 },
    ]);
    world.step();
    expect(vectorDistance(physics.pushers[0].translation(), pose.pusherTransforms.left.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(physics.pushers[1].translation(), pose.pusherTransforms.right.translation)).toBeLessThan(0.000_001);
    expect(Math.abs(rotate(physics.pushers[0].rotation(), { x: 0, y: 1, z: 0 }).x * resolved.pushers.frame.side.x + rotate(physics.pushers[0].rotation(), { x: 0, y: 1, z: 0 }).y * resolved.pushers.frame.side.y + rotate(physics.pushers[0].rotation(), { x: 0, y: 1, z: 0 }).z * resolved.pushers.frame.side.z)).toBeCloseTo(1, 6);
    expect(physics.pusherColliders[0].halfHeight()).toBeCloseTo((pose.pushers.left.depth - 1.1) / 2, 6);
    expect(vectorDistance(physics.pegBodies[0].translation(), {
      x: geometry.pegs[0].center.x + resolved.pegHall.frame.up.x * 0.575,
      y: geometry.pegs[0].center.y + resolved.pegHall.frame.up.y * 0.575,
      z: geometry.pegs[0].center.z + resolved.pegHall.frame.up.z * 0.575,
    })).toBeLessThan(0.000_001);
    expect(() => physics.stepFixed(1 / 30)).toThrow("fixed timestep");

    physics.dispose();
    physics.dispose();
    expect([...physics.fixedColliders, ...physics.pegColliders, ...physics.pusherColliders].every((collider) => !collider.isValid())).toBe(true);
    expect(kinematics.every((body) => !body.isValid())).toBe(true);
    world.free();
  });

  it("removes exactly every owned body once on normal double-dispose", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const remove = vi.spyOn(world, "removeRigidBody");
    const physics = createObstaclePhysics(world, geometry);
    physics.dispose();
    physics.dispose();
    expect(remove).toHaveBeenCalledTimes(20);
    world.free();
  });

  it.each([0, 600, 1_200])("keeps both pusher capsule spans and world axes aligned at %ims", async (milliseconds) => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const physics = createObstaclePhysics(world, geometry);
    physics.controller.advanceMs(milliseconds);
    const pose = physics.stepFixed();
    world.step();
    for (const [index, side] of [pose.pushers.left, pose.pushers.right].entries()) {
      const body = physics.pushers[index]; const axis = rotate(body.rotation(), { x: 0, y: 1, z: 0 });
      expect(Math.abs(axis.x * resolved.pushers.frame.side.x + axis.y * resolved.pushers.frame.side.y + axis.z * resolved.pushers.frame.side.z)).toBeCloseTo(1, 6);
      expect(physics.pusherColliders[index].halfHeight()).toBeCloseTo((side.depth - 1.1) / 2, 6);
      expect(vectorDistance(body.translation(), index === 0 ? pose.pusherTransforms.left.translation : pose.pusherTransforms.right.translation)).toBeLessThan(0.000_001);
    }
    physics.dispose();
    world.free();
  });

  it("rolls back every created body when a collider descriptor fails", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const unsafeWorld = world as unknown as { createCollider: (...args: unknown[]) => unknown };
    const createCollider = unsafeWorld.createCollider.bind(world);
    const remove = vi.spyOn(world, "removeRigidBody");
    let calls = 0;
    unsafeWorld.createCollider = (...args) => {
      calls += 1;
      if (calls === 4) throw new Error("injected collider failure");
      return createCollider(...args);
    };

    expect(() => createObstaclePhysics(world, geometry)).toThrow("injected collider failure");
    expect(remove).toHaveBeenCalledTimes(4);
    world.free();
  });
});
