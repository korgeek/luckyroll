import { describe, expect, it } from "vitest";
import { generateTrackGeometry } from "./trackGeometry";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec } from "./trackSpec";
import type { TrackGeometry } from "./trackTypes";

const readProfileRow = (
  geometry: TrackGeometry,
  sampleIndex: number,
): Array<{ x: number; y: number; z: number }> => {
  const rowSize = geometry.profileSegments + 1;

  return Array.from({ length: rowSize }, (_, column) => {
    const offset = (sampleIndex * rowSize + column) * 3;
    return {
      x: geometry.positions[offset],
      y: geometry.positions[offset + 1],
      z: geometry.positions[offset + 2],
    };
  });
};

const countConnectedComponents = (geometry: TrackGeometry): number => {
  const adjacency = new Map<number, Set<number>>();

  const connect = (first: number, second: number): void => {
    const firstNeighbors = adjacency.get(first) ?? new Set<number>();
    firstNeighbors.add(second);
    adjacency.set(first, firstNeighbors);

    const secondNeighbors = adjacency.get(second) ?? new Set<number>();
    secondNeighbors.add(first);
    adjacency.set(second, secondNeighbors);
  };

  for (let index = 0; index < geometry.indices.length; index += 3) {
    const first = geometry.indices[index];
    const second = geometry.indices[index + 1];
    const third = geometry.indices[index + 2];
    connect(first, second);
    connect(second, third);
    connect(third, first);
  }

  const unvisited = new Set(adjacency.keys());
  let components = 0;

  while (unvisited.size > 0) {
    const first = unvisited.values().next().value;
    if (first === undefined) {
      break;
    }

    components += 1;
    const pending = [first];
    unvisited.delete(first);

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }

      for (const neighbor of adjacency.get(current) ?? []) {
        if (unvisited.delete(neighbor)) {
          pending.push(neighbor);
        }
      }
    }
  }

  return components;
};

describe("U-channel geometry", () => {
  const spec = createLuckyRollTrackSpec();
  const samples = sampleTrack(spec);
  const geometry = generateTrackGeometry(samples, spec.profileSegments);
  const rowSize = spec.profileSegments + 1;

  it("generates one complete profile row per centerline sample", () => {
    expect(geometry.positions.length / 3).toBe(samples.length * rowSize);
    expect(geometry.indices.length).toBe((samples.length - 1) * spec.profileSegments * 6);
  });

  it("places the center below both containment edges", () => {
    const firstRow = readProfileRow(geometry, 0);
    const center = firstRow[Math.floor(firstRow.length / 2)];
    expect(firstRow[0].y - center.y).toBeGreaterThanOrEqual(2.5 * 0.68);
    expect(firstRow[firstRow.length - 1].y - center.y).toBeGreaterThanOrEqual(2.5 * 0.68);
  });

  it("shares every profile row between adjacent strips", () => {
    expect(countConnectedComponents(geometry)).toBe(1);
  });

  it("stays below the mobile triangle budget", () => {
    expect(geometry.triangleCount).toBeLessThan(150_000);
  });
});
