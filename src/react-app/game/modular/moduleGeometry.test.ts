import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { assertValidTrackDesign } from "../../designer/trackValidation";
import { CHANNEL_WIDTH, MARBLE_DIAMETER, RAIL_HEIGHT, ROUTE_GRADE, sampleModulePath } from "./modulePath";
import { buildModularTrack } from "./modularTrackBuild";
import { buildModuleGeometry, validateModuleGeometry, PROFILE_SEGMENTS, profileAt } from "./moduleGeometry";

const vertex = (geometry: ReturnType<typeof buildModuleGeometry>, row: number, column: number) => {
  const offset = (row * (geometry.profileSegments + 1) + column) * 3;
  return { x: geometry.positions[offset], y: geometry.positions[offset + 1], z: geometry.positions[offset + 2] };
};
const triangleNormal = (geometry: ReturnType<typeof buildModuleGeometry>, triangle: number) => {
  const [a, b, c] = Array.from(geometry.indices.slice(triangle * 3, triangle * 3 + 3)).map((index) => vertex(
    geometry,
    Math.floor(index / (geometry.profileSegments + 1)),
    index % (geometry.profileSegments + 1),
  ));
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
};

describe("welded modular channel geometry", () => {
  it("uses a tall open profile without an inward wall hook", () => {
    const profile = profileAt(CHANNEL_WIDTH);
    const floor = profile.filter((point) => Math.abs(point.height) < 1e-9);
    expect(floor[0].lateral).toBeCloseTo(-CHANNEL_WIDTH * 0.275, 8);
    expect(floor[floor.length - 1]?.lateral).toBeCloseTo(CHANNEL_WIDTH * 0.275, 8);
    expect(profile).toHaveLength(PROFILE_SEGMENTS + 1);
    expect(profile.every((point, index) => Math.abs(point.lateral + profile[profile.length - index - 1].lateral) < 1e-9)).toBe(true);
    expect(profile[0]).toEqual({ lateral: -CHANNEL_WIDTH / 2, height: RAIL_HEIGHT });
    expect(profile[profile.length - 1]).toEqual({ lateral: CHANNEL_WIDTH / 2, height: RAIL_HEIGHT });
    expect(profile.slice(1).every((point, index) => point.lateral > profile[index].lateral)).toBe(true);
    const rightFloorIndex = profile.findIndex((point) => Math.abs(point.lateral - CHANNEL_WIDTH * 0.275) < 1e-9 && point.height === 0);
    const outerIndex = profile.length - 1;
    const direction = (from: number, to: number) => ({ x: profile[to].lateral - profile[from].lateral, y: profile[to].height - profile[from].height });
    const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;
    const length = (a: { x: number; y: number }) => Math.hypot(a.x, a.y);
    expect(dot(direction(rightFloorIndex - 1, rightFloorIndex), direction(rightFloorIndex, rightFloorIndex + 1)) /
      (length(direction(rightFloorIndex - 1, rightFloorIndex)) * length(direction(rightFloorIndex, rightFloorIndex + 1)))).toBeGreaterThan(0.99);
    expect(profile.slice(rightFloorIndex, outerIndex + 1).every((point, index, wall) => index === 0 || point.height >= wall[index - 1].height)).toBe(true);
    const facetCosines = profile.slice(1, -1).map((_, index) => {
      const a = direction(index, index + 1); const b = direction(index + 1, Math.min(profile.length - 1, index + 2));
      return dot(a, b) / (length(a) * length(b));
    });
    expect(Math.min(...facetCosines)).toBeGreaterThan(Math.cos(10 * Math.PI / 180));
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

  it("winds the start channel quad upward", () => {
    const track = createValidTrackDesign();
    const geometry = buildModuleGeometry(sampleModulePath(track, assertValidTrackDesign(track)));
    const rowSize = geometry.profileSegments + 1;
    expect(Array.from(geometry.indices.slice(0, 6))).toEqual([0, 1, rowSize, 1, rowSize + 1, rowSize]);
  });

  it("joins the start extension to the first module with one indexed strip", () => {
    const built = buildModularTrack(createValidTrackDesign());
    const geometry = built.geometry;
    const rowSize = PROFILE_SEGMENTS + 1;
    const startRow = Array.from({ length: rowSize }, (_, column) => vertex(geometry, 0, column));
    const firstRow = Array.from({ length: rowSize }, (_, column) => vertex(geometry, 1, column));
    const triangles = Array.from({ length: geometry.indices.length / 3 }, (_, triangle) =>
      Array.from(geometry.indices.slice(triangle * 3, triangle * 3 + 3)));
    const startJoin = triangles.filter((indices) => {
      const rows = new Set(indices.map((index) => Math.floor(index / rowSize)));
      return rows.size === 2 && rows.has(0) && rows.has(1);
    });

    expect(geometry.samples[1]).toBe(built.samples[0]);
    expect(startRow).toHaveLength(firstRow.length);
    expect(startJoin).toHaveLength(PROFILE_SEGMENTS * 2);
    expect(triangles.some((indices) => indices.every((index) => Math.floor(index / rowSize) === 0))).toBe(false);
    expect(triangles.some((indices) => indices.every((index) => Math.floor(index / rowSize) === 1))).toBe(false);
    expect(new Set(triangles.map((indices) => [...indices].sort((a, b) => a - b).join(","))).size).toBe(triangles.length);
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

  it("keeps curve exits exactly flat across their canonical welded rows", () => {
    const track = createWorstCaseTrackDesign();
    const geometry = buildModuleGeometry(sampleModulePath(track, assertValidTrackDesign(track)));
    const rowSize = geometry.profileSegments + 1;
    const seams = geometry.seams.filter((seam) => track.cells[seam.upstreamCell]?.kind === "curve");

    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) {
      const row = seam.upstreamRow;
      const shared = geometry.samples[row];
      expect(shared.side).toEqual(geometry.samples[row - 1].side);
      expect(shared.up).toEqual(geometry.samples[row - 1].up);
      expect(shared.side).toEqual(geometry.samples[row + 1].side);
      expect(shared.up).toEqual(geometry.samples[row + 1].up);
      for (let column = 0; column < rowSize; column += 1) {
        expect(vertex(geometry, seam.upstreamRow, column)).toEqual(vertex(geometry, seam.downstreamRow, column));
      }
      for (let column = 0; column < geometry.profileSegments; column += 1) {
        const previous = ((row - 1) * geometry.profileSegments + column) * 2 + 1;
        const next = (row * geometry.profileSegments + column) * 2;
        const a = triangleNormal(geometry, previous); const b = triangleNormal(geometry, next);
        expect(a.x).toBeCloseTo(b.x, 5);
        expect(a.y).toBeCloseTo(b.y, 5);
        expect(a.z).toBeCloseTo(b.z, 5);
      }
    }
  });

  it("keeps every banked inner rail outside the curve center with marble clearance", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    const geometry = buildModuleGeometry(samples);
    const curveRows = samples
      .map((sample, row) => ({ sample, row }))
      .filter(({ sample }) => track.cells[sample.cellIndex]?.kind === "curve" && Math.hypot(sample.centerlineCurvature.x, sample.centerlineCurvature.z) > 1e-9);

    expect(curveRows.length).toBeGreaterThan(0);
    let minimumInnerNormalDot = 1;
    let worstRow = -1;
    for (const { sample, row } of curveRows) {
      const curvatureMagnitude = Math.hypot(sample.centerlineCurvature.x, sample.centerlineCurvature.z);
      const inward = { x: sample.centerlineCurvature.x / curvatureMagnitude, z: sample.centerlineCurvature.z / curvatureMagnitude };
      const radius = Math.cos(ROUTE_GRADE) ** 2 / curvatureMagnitude;
      const inwardRail = Math.max(...[vertex(geometry, row, 0), vertex(geometry, row, PROFILE_SEGMENTS)].map((point) =>
        (point.x - sample.position.x) * inward.x + (point.z - sample.position.z) * inward.z));
      expect(inwardRail).toBeLessThan(radius - MARBLE_DIAMETER / 2);

      const previous = samples[row - 1]; const next = samples[row + 1];
      if (previous?.cellIndex !== sample.cellIndex || next?.cellIndex !== sample.cellIndex) continue;
      const signedCurvature = sample.centerlineCurvature.x * sample.side.x + sample.centerlineCurvature.y * sample.side.y + sample.centerlineCurvature.z * sample.side.z;
      const innerColumn = signedCurvature < 0 ? 0 : PROFILE_SEGMENTS - 1;
      const before = triangleNormal(geometry, ((row - 1) * PROFILE_SEGMENTS + innerColumn) * 2 + 1);
      const after = triangleNormal(geometry, (row * PROFILE_SEGMENTS + innerColumn) * 2);
      const normalDot = before.x * after.x + before.y * after.y + before.z * after.z;
      if (normalDot < minimumInnerNormalDot) { minimumInnerNormalDot = normalDot; worstRow = row; }
    }
    expect(minimumInnerNormalDot, `worst row ${worstRow}, u=${samples[worstRow]?.localU}`).toBeGreaterThan(Math.cos(45 * Math.PI / 180));
  });

  it("rejects a longitudinal mesh-strip normal turn even when path tangents are unchanged", () => {
    const geometry = buildModuleGeometry(sampleModulePath(createValidTrackDesign(), assertValidTrackDesign(createValidTrackDesign())));
    const indices = new Uint32Array(geometry.indices);
    const triangle = 10 * 2 + 1;
    [indices[triangle * 3 + 1], indices[triangle * 3 + 2]] = [indices[triangle * 3 + 2], indices[triangle * 3 + 1]];
    const failures = validateModuleGeometry({ ...geometry, indices });
    expect(failures.some((failure) => failure.code === "longitudinal-normal")).toBe(true);
  });

  it("rejects a welded seam whose retained analytic chord error exceeds 0.02D", () => {
    const geometry = buildModuleGeometry(sampleModulePath(createValidTrackDesign(), assertValidTrackDesign(createValidTrackDesign())));
    const row = geometry.seams[0]?.upstreamRow ?? 1;
    const samples = [...geometry.samples];
    samples[row] = Object.freeze({ ...samples[row], chordError: 0.02 });
    const failures = validateModuleGeometry({ ...geometry, samples });
    expect(failures.some((failure) => failure.code === "chord" && failure.sampleIndex === row)).toBe(true);
  });

  it("rejects a spatially collapsed triangle even when its indices remain distinct", () => {
    const geometry = buildModuleGeometry(sampleModulePath(createValidTrackDesign(), assertValidTrackDesign(createValidTrackDesign())));
    const positions = new Float32Array(geometry.positions);
    const triangle = 10 * 2 + 1;
    const first = geometry.indices[triangle * 3] * 3;
    const third = geometry.indices[triangle * 3 + 2] * 3;
    positions[third] = positions[first]; positions[third + 1] = positions[first + 1]; positions[third + 2] = positions[first + 2];
    const failures = validateModuleGeometry({ ...geometry, positions });
    expect(failures.some((failure) => failure.code === "degenerate")).toBe(true);
  });
});
