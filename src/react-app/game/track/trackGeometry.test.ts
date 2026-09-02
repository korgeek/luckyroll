import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./trackBuild";
import { generateTrackGeometry } from "./trackGeometry";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec, DEFAULT_TRACK_FEATURE_LAYOUT } from "./trackSpec";
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

type FeatureGeometry = TrackGeometry & Readonly<{
  featurePositions: Float32Array;
  featureNormals: Float32Array;
  featureIndices: Uint32Array;
}>;

const minimumDividerWallClearance = (geometry: FeatureGeometry): number => {
  const rowSize = geometry.profileSegments + 1;
  const nearestWallDistance = (x: number, y: number, z: number): number => {
    const sampleIndex = geometry.samples.reduce((nearest, sample, index) => {
      const currentDistance = Math.hypot(sample.position.x - x, sample.position.z - z);
      const nearestDistance = Math.hypot(
        geometry.samples[nearest].position.x - x,
        geometry.samples[nearest].position.z - z,
      );
      return currentDistance < nearestDistance ? index : nearest;
    }, 0);
    return Math.min(...[0, rowSize - 1].map((column) => {
      const offset = (sampleIndex * rowSize + column) * 3;
      return Math.hypot(
        geometry.positions[offset] - x,
        geometry.positions[offset + 1] - y,
        geometry.positions[offset + 2] - z,
      );
    }));
  };

  return Math.min(...Array.from({ length: geometry.featurePositions.length / 3 }, (_, index) => {
    const offset = index * 3;
    return nearestWallDistance(
      geometry.featurePositions[offset],
      geometry.featurePositions[offset + 1],
      geometry.featurePositions[offset + 2],
    );
  }));
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

  it("adds one rounded divider inside a continuously widened checkpoint-10 hall without replacing the outer channel", () => {
    const baseline = buildValidatedTrack({ features: false });
    const featured = buildValidatedTrack({ features: true });
    const geometry = featured.geometry as FeatureGeometry;
    const splitterSamples = featured.samples.filter((sample) => sample.zone === "splitter");

    expect(featured.geometry.positions).not.toBe(baseline.geometry.positions);
    expect(featured.geometry.positions).not.toStrictEqual(baseline.geometry.positions);
    expect(baseline.geometry.featureIndices).toHaveLength(0);
    expect(splitterSamples.length).toBeGreaterThan(0);
    expect(splitterSamples.every((sample) => sample.width >= 16)).toBe(true);
    expect(geometry.featurePositions.length).toBeGreaterThan(0);
    expect(geometry.featureNormals.length).toBe(geometry.featurePositions.length);
    expect(geometry.featureIndices.length).toBeGreaterThan(0);
    expect(countConnectedComponents(featured.geometry)).toBe(1);
    expect(minimumDividerWallClearance(geometry)).toBeGreaterThanOrEqual(2 * 0.68);
    expect(featured.geometry.triangleCount + geometry.featureIndices.length / 3).toBeLessThan(150_000);
  });

  it("keeps independently built outer typed arrays isolated from feature mode", () => {
    const featured = buildValidatedTrack({ features: true });
    const original = featured.geometry.positions[0];
    featured.geometry.positions[0] += 1;
    const fresh = buildValidatedTrack({ features: true });
    const freshValue = fresh.geometry.positions[0];
    featured.geometry.positions[0] = original;

    expect(freshValue).toBe(original);
  });

  it("keeps the rounded divider short enough to avoid turning the hall into a long two-lane bottleneck", () => {
    const geometry = buildValidatedTrack({ features: true }).geometry as FeatureGeometry;
    const positions = geometry.featurePositions;
    const horizontalExtent = Math.max(...Array.from({ length: positions.length / 3 }, (_, index) =>
      Array.from({ length: positions.length / 3 }, (_, otherIndex) => Math.hypot(
        positions[index * 3] - positions[otherIndex * 3],
        positions[index * 3 + 2] - positions[otherIndex * 3 + 2],
      )),
    ).flat());
    const outlineLength = positions.length / 3 / 2 - 1;

    expect(horizontalExtent).toBeGreaterThanOrEqual(1.89);
    expect(horizontalExtent).toBeLessThanOrEqual(2.1);
    expect(positions[outlineLength * 3 + 1] - positions[1]).toBeGreaterThanOrEqual(3 * 0.68);
  });

  it("keeps the divider above three marble diameters without making its exit a tall launch face", () => {
    const featured = buildValidatedTrack({ features: true });
    const positions = featured.geometry.featurePositions;
    const outlineLength = positions.length / 3 / 2 - 1;
    const height = positions[outlineLength * 3 + 1] - positions[1];

    expect(height).toBeGreaterThanOrEqual(3 * 0.68);
    expect(height).toBeLessThanOrEqual(2.2);
  });

  it("tapers feature-only exit containment without changing its center floor", () => {
    const baseline = buildValidatedTrack({
      features: true,
      featureLayout: { ...DEFAULT_TRACK_FEATURE_LAYOUT, edgeLift: 0 },
    });
    const lifted = buildValidatedTrack({ features: true });
    const rowSize = lifted.geometry.profileSegments + 1;
    const exitIndex = 590;
    const approachIndex = 560;
    const centerColumn = Math.floor(lifted.geometry.profileSegments / 2);
    const vertexY = (geometry: FeatureGeometry, sampleIndex: number, column: number): number =>
      geometry.positions[(sampleIndex * rowSize + column) * 3 + 1];

    expect(exitIndex).toBeLessThan(lifted.samples.length);
    expect(vertexY(lifted.geometry as FeatureGeometry, exitIndex, centerColumn))
      .toBeCloseTo(vertexY(baseline.geometry as FeatureGeometry, exitIndex, centerColumn), 6);
    expect(vertexY(lifted.geometry as FeatureGeometry, exitIndex, lifted.geometry.profileSegments))
      .toBeGreaterThan(vertexY(baseline.geometry as FeatureGeometry, exitIndex, lifted.geometry.profileSegments));
    expect(vertexY(lifted.geometry as FeatureGeometry, exitIndex, 0))
      .toBeCloseTo(vertexY(baseline.geometry as FeatureGeometry, exitIndex, 0), 6);
    expect(vertexY(lifted.geometry as FeatureGeometry, approachIndex, 0))
      .toBeCloseTo(vertexY(baseline.geometry as FeatureGeometry, approachIndex, 0), 6);
  });

});
