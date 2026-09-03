import { describe, expect, it } from "vitest";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { MARBLE_DIAMETER, MARBLE_RADIUS, resolveObstacleLayout } from "./obstacleLayout";
import {
  BowlLaunchError,
  createBowlLaunchPositions,
  createDeviceController,
  createObstaclePhysics,
} from "./obstaclePhysics";
import { createObstacleRenderGroup, setDeviceRenderPose } from "./obstacleRender";
import { buildValidatedTrack } from "./trackBuild";
import { createTrackPhysicsWorld, initializeTrackPhysics } from "./trackPhysics";

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

describe("obstacle physics", () => {
  it.each([11, 23, 37, 41, 53, 67, 71, 83, 97, 101])("places 100 deterministic bowl marbles without overlap for seed %i", (seed) => {
    const positions = createBowlLaunchPositions(100, resolved.start, seed);

    expect(positions).toHaveLength(100);
    expect(minimumPairDistance(positions)).toBeGreaterThanOrEqual(MARBLE_DIAMETER);
    expect(positions.every((position) => position.physicalLaunchPosition)).toBe(true);
    expect(positions.every((position) => vectorDistance(position, resolved.start.frame.position) <= resolved.start.radius + MARBLE_RADIUS)).toBe(true);
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
    const group = createObstacleRenderGroup(geometry);
    setDeviceRenderPose(group, pose);

    expect(vectorDistance(group.getObjectByName("pusher-left-mesh")!.position, pose.pusherTransforms.left.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(group.getObjectByName("release-gate")!.position, pose.gate.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(group.getObjectByName("start-agitator")!.position, pose.agitator.translation)).toBeLessThan(0.000_001);
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
    expect(physics.agitator.numColliders()).toBe(3);
    expect(physics.gate.numColliders()).toBe(1);
    expect(physics.pushers.map((body) => body.numColliders())).toEqual([1, 1]);
    expect(calls).toEqual([
      { translation: 1, rotation: 1 }, { translation: 1, rotation: 1 },
      { translation: 1, rotation: 1 }, { translation: 1, rotation: 1 },
    ]);
    world.step();
    expect(vectorDistance(physics.pushers[0].translation(), pose.pusherTransforms.left.translation)).toBeLessThan(0.000_001);
    expect(vectorDistance(physics.pushers[1].translation(), pose.pusherTransforms.right.translation)).toBeLessThan(0.000_001);
    expect(() => physics.stepFixed(1 / 30)).toThrow("fixed timestep");

    physics.dispose();
    physics.dispose();
    expect([...physics.fixedColliders, ...physics.pegColliders].every((collider) => !collider.isValid())).toBe(true);
    expect(kinematics.every((body) => !body.isValid())).toBe(true);
    world.free();
  });
});
