import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { insideFinishVolume, createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, distanceSquaredToSample, distanceSquaredToTrackSegments, initializeTrackPhysics, launchPositionsFor, runValidationRace, runValidationSuite } from "./trackPhysics";
import { createDefaultTrackDesign } from "../../designer/trackDesign";
import { buildModularTrack } from "../modular/modularTrackBuild";
import { createModularPhysics } from "../modular/modularTrackPhysics";
import { projectToTrack } from "./trackSampler";
import { buildValidatedTrack } from "./trackBuild";
import { exactLaunchMeshDistance } from "./trackPhysics.mesh.testSupport";
import { createLaunchSlots } from "./trackSpec";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics", () => {
  it("stops a fast marble at the actual final curve wall instead of tunneling through it", async () => {
    await initializeTrackPhysics();
    const built = buildModularTrack(createDefaultTrackDesign());
    const geometrySamples: typeof built.samples = built.geometry.samples;
    const row = geometrySamples.findIndex(sample => sample.cellIndex === 35 && sample.localU >= 0.7);
    const offset = (row * built.geometry.profileSegments + 140) * 6;
    const [a, b, c] = [0, 1, 2].map(index => new Vector3().fromArray(built.geometry.positions, built.geometry.indices[offset + index] * 3));
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const center = a.add(b).add(c).divideScalar(3);
    const world = createTrackPhysicsWorld({ x: 0, y: 0, z: 0 });
    const resources = createModularPhysics(world, built);
    try {
      const position = center.clone().addScaledVector(normal, 0.8);
      const [body] = createMarbleBodies(world, [{ ...position, crossOffset: 0, row: 0, column: 0, physicalLaunchPosition: true }]);
      expect(body.isCcdEnabled()).toBe(false);
      body.setLinvel(normal.clone().multiplyScalar(-120), true);
      resources.stepAfterWorld([body]);
      expect(body.isCcdEnabled()).toBe(true);
      world.step();
      const clearance = new Vector3().copy(body.translation()).sub(center).dot(normal);
      expect(clearance).toBeGreaterThan(0.3);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      resources.stepAfterWorld([body]);
      expect(body.isCcdEnabled()).toBe(false);
      body.setTranslation(built.samples[0].position, true);
      body.setLinvel({ x: 120, y: 0, z: 0 }, true);
      resources.stepAfterWorld([body]);
      expect(body.isCcdEnabled()).toBe(false);
    } finally { resources.dispose(); world.free(); }
  });
  it("counts finish crossings across the full graded channel width and rejects outside points", () => {
    const samples = buildModularTrack(createDefaultTrackDesign()).samples;
    const finish = samples[samples.length - 1]!;
    const point = (along: number, across: number, height: number) => ({
      x: finish.position.x + finish.tangent.x * along + finish.side.x * across + finish.up.x * height,
      y: finish.position.y + finish.tangent.y * along + finish.side.y * across + finish.up.y * height,
      z: finish.position.z + finish.tangent.z * along + finish.side.z * across + finish.up.z * height,
    });
    for (const side of [-1, 1]) expect(insideFinishVolume(point(1, side * 5.5, 0.34), finish)).toBe(true);
    expect(insideFinishVolume(point(0, 6.1, 1), finish)).toBe(false);
    expect(insideFinishVolume(point(0, 0, -0.1), finish)).toBe(false);
    expect(insideFinishVolume(point(4.1, 0, 1), finish)).toBe(false);
    expect(insideFinishVolume(point(0, 0, 25), finish)).toBe(false);
  });

	it("measures escape distance to adjacent sample segments instead of sparse points", () => {
		const samples = [{ position: { x: 0, y: 0, z: 0 } }, { position: { x: 16, y: 0, z: 0 } }] as unknown as Parameters<typeof distanceSquaredToTrackSegments>[1];
		expect(distanceSquaredToSample({ x: 8, y: 12, z: 6 }, samples[0])).toBe(244);
		expect(distanceSquaredToTrackSegments({ x: 8, y: 12, z: 6 }, samples)).toBe(180);
		expect(distanceSquaredToTrackSegments({ x: 8, y: 16, z: 0 }, samples)).toBe(256);
		expect(distanceSquaredToTrackSegments({ x: -16, y: 0, z: 0 }, samples)).toBe(256);
		expect(distanceSquaredToTrackSegments({ x: 3, y: 4, z: 0 }, [samples[0]])).toBe(25);
		expect(distanceSquaredToTrackSegments({ x: 3, y: 4, z: 0 }, [samples[0], samples[0]])).toBe(25);
	});

	it("keeps a real Default Track wall midpoint inside the existing escape radius", () => {
		const built = buildModularTrack(createDefaultTrackDesign());
		const geometrySamples = built.geometry.samples as unknown as typeof built.samples;
		const row = geometrySamples.findIndex((sample) => sample.cellIndex === 0 && sample.localU === 0.1);
		const nextRow = geometrySamples.findIndex((sample, index) => index > row && sample.cellIndex === 0 && sample.localU === 0.9);
		const rowSize = built.geometry.profileSegments + 1;
		const a = row * rowSize * 3; const b = nextRow * rowSize * 3;
		const position = { x: (built.geometry.positions[a] + built.geometry.positions[b]) / 2, y: (built.geometry.positions[a + 1] + built.geometry.positions[b + 1]) / 2, z: (built.geometry.positions[a + 2] + built.geometry.positions[b + 2]) / 2 };
		const projection = projectToTrack(position, built.samples);
		expect(distanceSquaredToSample(position, built.samples[projection.sampleIndex])).toBeGreaterThan(15 ** 2);
		expect(distanceSquaredToTrackSegments(position, built.samples)).toBeLessThanOrEqual(15 ** 2);
	});
  it("keeps all physical launch positions non-overlapping inside the entry channel", () => {
    const positions = launchPositionsFor(createLaunchSlots(100), buildValidatedTrack().geometry);

    expect(Math.min(...positions.flatMap((position, index) =>
      positions.slice(index + 1).map((other) => Math.hypot(
        position.x - other.x,
        position.y - other.y,
        position.z - other.z,
      )),
    ))).toBeGreaterThanOrEqual(0.68);
  });

  it("starts every marble clear of the actual faceted track mesh", () => {
    const positions = launchPositionsFor(createLaunchSlots(100), buildValidatedTrack().geometry);
    const clearances = positions.map(exactLaunchMeshDistance);

    expect(Math.min(...clearances)).toBeGreaterThanOrEqual(0.345);
  });

  it("uses the seed to generate repeatable but physically distinct launch coordinates", () => {
    const slots = createLaunchSlots(100);
    const geometry = buildValidatedTrack().geometry;
    const seed11 = launchPositionsFor(slots, geometry, 11);
    const seed11Repeat = launchPositionsFor(slots, geometry, 11);
    const seed23 = launchPositionsFor(slots, geometry, 23);

    expect(seed11).toEqual(seed11Repeat);
    expect(seed11).not.toEqual(seed23);
  });

  it("creates bodies through the public two-argument physical-launch API", async () => {
    await runValidationRace({ seed: 1, marbleCount: 1, durationSeconds: 0 });
    const module = (await import("@dimforge/rapier3d-compat/rapier.es.js")).default;
    const geometry = buildValidatedTrack().geometry;
    const positions = launchPositionsFor(createLaunchSlots(100), geometry, 11);
    const world = new module.World({ x: 0, y: -16, z: 0 });
    createTrackCollider(world, geometry);

    const bodies = createMarbleBodies(world, positions);

    expect(bodies).toHaveLength(100);
    expect(bodies.map((body, index) => Math.hypot(
      body.translation().x - positions[index].x,
      body.translation().y - positions[index].y,
      body.translation().z - positions[index].z,
    )).every((difference) => difference < 0.00001)).toBe(true);
    world.free();
  });

  it("attaches a real divider collider to the same fixed body as the outer U-channel", async () => {
    await initializeTrackPhysics();
    const world = createTrackPhysicsWorld();
    const featured = buildValidatedTrack({ features: true });
    const colliders = createTrackCollider(world, featured.geometry) as unknown as {
      outer: { parent: () => unknown };
      divider: { parent: () => unknown } | undefined;
    };

    try {
      expect(colliders.divider).toBeDefined();
      expect(colliders.divider!.parent()).toBe(colliders.outer.parent());
    } finally {
      world.free();
    }
  });

  it("exposes the ten-fixed-seed feature validation suite", () => {
    expect(runValidationSuite).toBeTypeOf("function");
  });

  it("rolls one marble from A through 12 using gravity only", async () => {
    const result = await runValidationRace({ seed: 1, marbleCount: 1, durationSeconds: 60 });

    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("rolls one marble through the production splitter in the 45–60 second feature window", async () => {
    const result = await runValidationRace({ seed: 11, marbleCount: 1, durationSeconds: 60, features: true });

    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("finishes seeds 11 and 23 twice without recovery", () =>
    validateSeedsTwice([11, 23], true), 180_000);
});
