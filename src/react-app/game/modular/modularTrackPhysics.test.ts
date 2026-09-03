import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import {
  applyBoosterVelocity,
  createModularLaunchPositions,
  createBoosterState,
  createModularPhysics,
  runModularSeamProbe,
} from "./modularTrackPhysics";
import {
  createMarbleBodies,
  createTrackPhysicsWorld,
  getInitializedTrackPhysicsRapier,
  initializeTrackPhysics,
} from "../track/trackPhysics";

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

  it("advances pinwheels by exactly two radians per second and resets", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const resources = createModularPhysics(world, buildModularTrack(createWorstCaseTrackDesign()));
    const first = resources.stepBeforeWorld();
    const second = resources.stepBeforeWorld();
    expect(second.pinwheelAngles[0] - first.pinwheelAngles[0]).toBeCloseTo(2 / 60);
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
});
