import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./trackBuild";
import { launchPositionsFor } from "./trackPhysics";
import { exactLaunchMeshDistance } from "./trackPhysics.mesh.testSupport";
import { createLaunchSlots } from "./trackSpec";

const FIXED_SEEDS = [11, 23, 37, 41, 53, 67, 71, 83, 97, 101] as const;
const MARBLE_RADIUS = 0.34;
const geometry = buildValidatedTrack().geometry;
const slots = createLaunchSlots(100);

const minimumPairDistance = (positions: readonly { x: number; y: number; z: number }[]): number => Math.min(
  ...positions.flatMap((position, index) => positions.slice(index + 1).map((other) => Math.hypot(
    position.x - other.x,
    position.y - other.y,
    position.z - other.z,
  ))),
);

describe("physical launch invariants", () => {
  it.each(FIXED_SEEDS)("keeps seed %i clear, separated, and contained", (seed) => {
    const positions = launchPositionsFor(slots, geometry, seed);
    const wallMargins = positions.map((position) => {
      const sample = geometry.samples[position.row * 2];
      const lateral = (position.x - sample.position.x) * sample.side.x
        + (position.y - sample.position.y) * sample.side.y
        + (position.z - sample.position.z) * sample.side.z;
      return sample.width / 2 - Math.abs(lateral);
    });

    expect(Math.min(...positions.map(exactLaunchMeshDistance))).toBeGreaterThanOrEqual(MARBLE_RADIUS + 0.005);
    expect(minimumPairDistance(positions)).toBeGreaterThanOrEqual(MARBLE_RADIUS * 2);
    expect(Math.min(...wallMargins)).toBeGreaterThanOrEqual(MARBLE_RADIUS);
  });
});
