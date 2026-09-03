import { describe, expect, it } from "vitest";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { MIN_DEVICE_CLEARANCE } from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";

const distance = (left: readonly number[], right: readonly number[]): number => Math.hypot(
  left[0] - right[0], left[1] - right[1], left[2] - right[2],
);

const vertex = (positions: Float32Array, index: number): readonly number[] => [
  positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2],
];

const centroid = (positions: Float32Array, from: number, count: number): readonly number[] => {
  const total = [0, 0, 0];
  for (let index = from; index < from + count; index += 1) {
    const current = vertex(positions, index);
    total[0] += current[0]; total[1] += current[1]; total[2] += current[2];
  }
  return total.map((value) => value / count);
};

describe("neon obstacle geometry", () => {
  const track = buildValidatedTrack({ features: true });
  const resolved = track.obstacleLayout;

  it("keeps canonical U-channel buffers untouched while adding a 0.7-unit shell", () => {
    const positions = track.geometry.positions;
    const indices = track.geometry.indices;
    const resources = buildObstacleGeometry(track.geometry, resolved);

    expect(track.geometry.positions).toBe(positions);
    expect(track.geometry.indices).toBe(indices);
    expect(resources.shell.positions).not.toBe(positions);
    expect(resources.shell.thickness).toBe(0.7);
    expect(resources.shell.positions.length).toBeGreaterThan(0);
  });

  it("builds real 18-unit-wide peg and pusher device surfaces from resolved frames", () => {
    const resources = buildObstacleGeometry(track.geometry, resolved);
    const pegSpan = distance(vertex(resources.pegHallSurface.positions, 0), vertex(resources.pegHallSurface.positions, 1));
    const pusherSpan = distance(vertex(resources.pusherHallSurface.positions, 0), vertex(resources.pusherHallSurface.positions, 1));

    expect(pegSpan).toBeCloseTo(18, 5);
    expect(pusherSpan).toBeCloseTo(18, 5);
    expect(resources.pegHallSurface.positions).toHaveLength(24);
    expect(resources.pusherHallSurface.positions).toHaveLength(24);
    expect(pegSpan).toBeGreaterThan(track.obstacleLayout.pegHall.baseSurfaceWidth);
    expect(pusherSpan).toBeGreaterThan(track.obstacleLayout.pushers.baseSurfaceWidth);
  });

  it("keeps generated peg surfaces clear of their 18-unit hall walls", () => {
    const resources = buildObstacleGeometry(track.geometry, resolved);
    const leftWall = vertex(resources.pegHallSurface.positions, 0);
    const rightWall = vertex(resources.pegHallSurface.positions, 1);

    for (const peg of resources.pegs) {
      const center = [peg.center.x, peg.center.y, peg.center.z];
      expect(Math.min(distance(center, leftWall), distance(center, rightWall)) - peg.radius)
        .toBeGreaterThanOrEqual(MIN_DEVICE_CLEARANCE);
    }
  });

  it("builds an indexed vortex with only entry and outlet boundaries at approved dimensions", () => {
    const resources = buildObstacleGeometry(track.geometry, resolved);

    expect(resources.vortex.indices.length).toBeGreaterThan(0);
    expect(resources.vortex.indices.length % 3).toBe(0);
    expect(resources.vortex.outletDiameter).toBeCloseTo(1.36, 6);
    expect(resources.vortex.rimDrop).toBeCloseTo(1.36, 6);
    expect(resources.vortex.openBoundaries).toEqual(["entry", "outlet"]);
    const outletCenter = centroid(resources.vortex.positions, 0, 32);
    const rimCenter = centroid(resources.vortex.positions, 32, 32);
    const delta = outletCenter.map((value, index) => value - rimCenter[index]);
    const vertical = delta[0] * resolved.vortex.frame.up.x + delta[1] * resolved.vortex.frame.up.y + delta[2] * resolved.vortex.frame.up.z;
    expect(Math.sqrt(Math.max(0, distance(outletCenter, rimCenter) ** 2 - vertical ** 2))).toBeGreaterThan(0.1);
    expect(resources.catchChannel.overlap).toBeGreaterThan(0);
  });

  it("builds a continuous capsule-ended two-path branch with a safe merge opening", () => {
    const resources = buildObstacleGeometry(track.geometry, resolved);

    expect(resources.branchRails.positions.length).toBeGreaterThan(0);
    expect(resources.branchRails.indices.length).toBeGreaterThan(0);
    expect(resources.branchRails.roundedEnds).toBe(true);
    expect(resources.branchRails.mergeOpening).toBeGreaterThanOrEqual(MIN_DEVICE_CLEARANCE);
    const start = resolved.branch.start.position;
    const tangent = resolved.branch.start.tangent;
    const minimumStartExtension = Math.min(...Array.from({ length: resources.branchRails.positions.length / 3 }, (_, index) => {
      const current = vertex(resources.branchRails.positions, index);
      return (current[0] - start.x) * tangent.x + (current[1] - start.y) * tangent.y + (current[2] - start.z) * tangent.z;
    }));
    expect(minimumStartExtension).toBeLessThan(-0.2);
  });
});
