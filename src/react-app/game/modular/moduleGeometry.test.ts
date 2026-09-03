import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { assertValidTrackDesign } from "../../designer/trackValidation";
import { CHANNEL_WIDTH, MARBLE_DIAMETER, RAIL_HEIGHT, sampleModulePath } from "./modulePath";
import { buildModuleGeometry, validateModuleGeometry, PROFILE_SEGMENTS, profileAt } from "./moduleGeometry";

const vertex = (geometry: ReturnType<typeof buildModuleGeometry>, row: number, column: number) => {
  const offset = (row * (geometry.profileSegments + 1) + column) * 3;
  return { x: geometry.positions[offset], y: geometry.positions[offset + 1], z: geometry.positions[offset + 2] };
};

describe("welded modular channel geometry", () => {
  it("uses a symmetric profile with a 55 percent flat floor and inward 0.75D lips", () => {
    const profile = profileAt(CHANNEL_WIDTH);
    const floor = profile.filter((point) => Math.abs(point.height) < 1e-9);
    expect(floor[0].lateral).toBeCloseTo(-CHANNEL_WIDTH * 0.275, 8);
    expect(floor[floor.length - 1]?.lateral).toBeCloseTo(CHANNEL_WIDTH * 0.275, 8);
    expect(profile).toHaveLength(PROFILE_SEGMENTS + 1);
    expect(profile.every((point, index) => Math.abs(point.lateral + profile[profile.length - index - 1].lateral) < 1e-9)).toBe(true);
    const top = profile.filter((point) => point.height >= RAIL_HEIGHT - 1e-9).map((point) => point.lateral);
    expect(top[top.length - 1]).toBeCloseTo(
      CHANNEL_WIDTH / 2 - 0.75 * MARBLE_DIAMETER, 8,
    );
    const rightFloorIndex = profile.findIndex((point) => Math.abs(point.lateral - CHANNEL_WIDTH * 0.275) < 1e-9 && point.height === 0);
    const outerIndex = profile.reduce((best, point, index) => point.lateral > profile[best].lateral ? index : best, 0);
    const direction = (from: number, to: number) => ({ x: profile[to].lateral - profile[from].lateral, y: profile[to].height - profile[from].height });
    const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;
    const length = (a: { x: number; y: number }) => Math.hypot(a.x, a.y);
    expect(dot(direction(rightFloorIndex - 1, rightFloorIndex), direction(rightFloorIndex, rightFloorIndex + 1)) /
      (length(direction(rightFloorIndex - 1, rightFloorIndex)) * length(direction(rightFloorIndex, rightFloorIndex + 1)))).toBeGreaterThan(0.99);
    expect(dot(direction(outerIndex - 1, outerIndex), direction(outerIndex, outerIndex + 1)) /
      (length(direction(outerIndex - 1, outerIndex)) * length(direction(outerIndex, outerIndex + 1)))).toBeGreaterThan(0.99);
    expect(profile.slice(rightFloorIndex, outerIndex + 1).every((point, index, wall) => index === 0 || point.height >= wall[index - 1].height)).toBe(true);
    expect(profile.slice(outerIndex).every((point, index, lip) => index === 0 || point.height >= lip[index - 1].height)).toBe(true);
    const facetCosines = profile.slice(1, -1).map((_, index) => {
      const a = direction(index, index + 1); const b = direction(index + 1, Math.min(profile.length - 1, index + 2));
      return dot(a, b) / (length(a) * length(b));
    });
    expect(Math.min(...facetCosines)).toBeGreaterThan(0.9);
  });

  it("welds every reciprocal port to one exact indexed row without caps or duplicate triangles", () => {
    const track = createValidTrackDesign();
    const geometry = buildModuleGeometry(sampleModulePath(track, assertValidTrackDesign(track)));
    expect(geometry.seams.every((seam) => seam.upstreamRow === seam.downstreamRow)).toBe(true);
    expect(new Set(geometry.seams.map((seam) => seam.upstreamRow)).size).toBe(geometry.seams.length);
    const triangles = Array.from({ length: geometry.indices.length / 3 }, (_, index) => {
      const offset = index * 3;
      return [...geometry.indices.slice(offset, offset + 3)].sort((a, b) => a - b).join(",");
    });
    expect(new Set(triangles).size).toBe(triangles.length);
    expect(validateModuleGeometry(geometry)).toEqual([]);
  });

  it("keeps profile rows canonical for funnel widths and longitudinal turns bounded", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    const geometry = buildModuleGeometry(samples);
    expect(geometry.samples).toBe(samples);
    for (const seam of geometry.seams) {
      expect(seam.upstreamRow).toBe(seam.downstreamRow);
      expect(vertex(geometry, seam.upstreamRow, 0)).toEqual(vertex(geometry, seam.downstreamRow, 0));
    }
    expect(validateModuleGeometry(geometry).filter((failure) => failure.code === "longitudinal-normal")).toEqual([]);
    expect(samples.every((sample) => sample.chordError !== undefined && sample.chordError <= 0.0136)).toBe(true);
  });

  it("rejects a longitudinal mesh-strip normal turn even when path tangents are unchanged", () => {
    const geometry = buildModuleGeometry(sampleModulePath(createValidTrackDesign(), assertValidTrackDesign(createValidTrackDesign())));
    const indices = new Uint32Array(geometry.indices);
    const triangle = Math.floor(PROFILE_SEGMENTS / 2) * 2 + 1;
    [indices[triangle * 3 + 1], indices[triangle * 3 + 2]] = [indices[triangle * 3 + 2], indices[triangle * 3 + 1]];
    const failures = validateModuleGeometry({ ...geometry, indices });
    expect(failures.some((failure) => failure.code === "longitudinal-normal")).toBe(true);
  });
});
