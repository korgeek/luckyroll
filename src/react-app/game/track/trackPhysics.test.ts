import { describe, expect, it } from "vitest";
import { createMarbleBodies, createTrackCollider, launchPositionsFor, runValidationRace } from "./trackPhysics";
import { buildValidatedTrack } from "./trackBuild";
import { exactLaunchMeshDistance } from "./trackPhysics.mesh.testSupport";
import { createLaunchSlots } from "./trackSpec";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics", () => {
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

  it("rolls one marble from A through 12 using gravity only", async () => {
    const result = await runValidationRace({ seed: 1, marbleCount: 1, durationSeconds: 60 });

    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("finishes seeds 11 and 23 twice without recovery", () =>
    validateSeedsTwice([11, 23]), 180_000);
});
