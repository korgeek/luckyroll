import { describe, expect, it } from "vitest";
import { createMarbleBodies, createTrackCollider, launchPositionsFor, runValidationRace } from "./trackPhysics";
import { buildValidatedTrack } from "./trackBuild";
import { createLaunchSlots } from "./trackSpec";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

const subtract = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const dot = (left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const distanceToTriangle = (
  point: { x: number; y: number; z: number },
  first: { x: number; y: number; z: number },
  second: { x: number; y: number; z: number },
  third: { x: number; y: number; z: number },
): number => {
  const ab = subtract(second, first);
  const ac = subtract(third, first);
  const ap = subtract(point, first);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(ap.x, ap.y, ap.z);

  const bp = subtract(point, second);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bp.x, bp.y, bp.z);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const projection = { x: first.x + ab.x * d1 / (d1 - d3), y: first.y + ab.y * d1 / (d1 - d3), z: first.z + ab.z * d1 / (d1 - d3) };
    return Math.hypot(point.x - projection.x, point.y - projection.y, point.z - projection.z);
  }

  const cp = subtract(point, third);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cp.x, cp.y, cp.z);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const projection = { x: first.x + ac.x * d2 / (d2 - d6), y: first.y + ac.y * d2 / (d2 - d6), z: first.z + ac.z * d2 / (d2 - d6) };
    return Math.hypot(point.x - projection.x, point.y - projection.y, point.z - projection.z);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = subtract(third, second);
    const amount = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const projection = { x: second.x + edge.x * amount, y: second.y + edge.y * amount, z: second.z + edge.z * amount };
    return Math.hypot(point.x - projection.x, point.y - projection.y, point.z - projection.z);
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  const projection = {
    x: first.x + ab.x * v + ac.x * w,
    y: first.y + ab.y * v + ac.y * w,
    z: first.z + ab.z * v + ac.z * w,
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y, point.z - projection.z);
};

const nearestMeshTriangle = (point: { x: number; y: number; z: number }) => {
  const geometry = buildValidatedTrack().geometry;
  const vertexAt = (index: number) => ({
    x: geometry.positions[index * 3],
    y: geometry.positions[index * 3 + 1],
    z: geometry.positions[index * 3 + 2],
  });
  let minimum = Number.POSITIVE_INFINITY;
  let nearestIndex = -1;
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const distance = distanceToTriangle(
      point,
      vertexAt(geometry.indices[index]),
      vertexAt(geometry.indices[index + 1]),
      vertexAt(geometry.indices[index + 2]),
    );
    if (distance < minimum) {
      minimum = distance;
      nearestIndex = index;
    }
  }
  return { distance: minimum, triangle: nearestIndex / 3 };
};

const minimumMeshDistance = (point: { x: number; y: number; z: number }) => nearestMeshTriangle(point).distance;

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
    const clearances = positions.map(minimumMeshDistance);

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

    console.info(`[track-physics] single seed=1 completed=${result.finishOrder.length} lastFinishMs=${result.finishTimesMs[0] ?? "none"} escapes=${result.escapes.length} stalls=${result.stalls.length}`);

    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("finishes seeds 11 and 23 twice without recovery", () =>
    validateSeedsTwice([11, 23]), 180_000);
});
