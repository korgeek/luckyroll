import { describe, expect, it } from "vitest";
import { buildObstacleGeometry, buildStartEnclosure, buildStartRampBridge } from "./obstacleGeometry";
import { MIN_DEVICE_CLEARANCE } from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";
import { projectToTrack } from "./trackSampler";

type Geometry = Readonly<{ positions: Float32Array; indices: Uint32Array }>;
const point = (g: Geometry, i: number): readonly [number, number, number] => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (v: readonly number[], axis: Readonly<{ x: number; y: number; z: number }>): number => v[0] * axis.x + v[1] * axis.y + v[2] * axis.z;
const centroid = (g: Geometry, indexes: readonly number[]): readonly [number, number, number] => {
  const total = [0, 0, 0]; for (const i of indexes) { const p = point(g, i); total[0] += p[0]; total[1] += p[1]; total[2] += p[2]; }
  return [total[0] / indexes.length, total[1] / indexes.length, total[2] / indexes.length];
};
const boundaryLoops = (g: Geometry): readonly (readonly number[])[] => {
  const edges = new Map<string, { count: number; pair: readonly [number, number] }>();
  for (let i = 0; i < g.indices.length; i += 3) for (const [a, b] of [[g.indices[i], g.indices[i + 1]], [g.indices[i + 1], g.indices[i + 2]], [g.indices[i + 2], g.indices[i]]] as const) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`; const old = edges.get(key); edges.set(key, { count: (old?.count ?? 0) + 1, pair: [a, b] });
  }
  const adjacent = new Map<number, number[]>();
  for (const edge of edges.values()) if (edge.count === 1) { const [a, b] = edge.pair; adjacent.set(a, [...(adjacent.get(a) ?? []), b]); adjacent.set(b, [...(adjacent.get(b) ?? []), a]); }
  const seen = new Set<number>(); const loops: number[][] = [];
  for (const start of adjacent.keys()) if (!seen.has(start)) { const loop: number[] = []; const pending = [start]; seen.add(start); while (pending.length > 0) { const current = pending.pop()!; loop.push(current); for (const next of adjacent.get(current)!) if (!seen.has(next)) { seen.add(next); pending.push(next); } } loops.push(loop); }
  return loops;
};
const twiceArea = (g: Geometry, i: number): number => {
  const a = point(g, g.indices[i]); const b = point(g, g.indices[i + 1]); const c = point(g, g.indices[i + 2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
};

describe("neon obstacle geometry", () => {
  const track = buildValidatedTrack({ features: true }); const resolved = track.obstacleLayout;
  it("keeps canonical U-channel buffers untouched while adding a 1.2-unit shell", () => {
    const positions = track.geometry.positions; const indices = track.geometry.indices; const r = buildObstacleGeometry(track.geometry, resolved);
    expect(track.geometry.positions).toBe(positions); expect(track.geometry.indices).toBe(indices); expect(r.shell.positions).not.toBe(positions); expect(r.shell.thickness).toBeGreaterThanOrEqual(1.2);
  });
  it("builds a rectangular start floor with four-unit back and side walls", () => {
    const frame = resolved.start.frame;
    const enclosure = buildStartEnclosure(frame, 10.2, 10.4, 4);
    const relative = Array.from({ length: enclosure.positions.length / 3 }, (_, index) => {
      const p = point(enclosure, index);
      const offset = [p[0] - frame.position.x, p[1] - frame.position.y, p[2] - frame.position.z] as const;
      return { along: dot(offset, frame.tangent), lateral: dot(offset, frame.side), height: dot(offset, frame.up) };
    });
    expect(Math.min(...relative.map(({ along }) => along))).toBeCloseTo(0, 5);
    expect(Math.max(...relative.map(({ along }) => along))).toBeCloseTo(10.2, 5);
    expect(Math.max(...relative.map(({ lateral }) => Math.abs(lateral)))).toBeCloseTo(5.2, 5);
    expect(Math.max(...relative.map(({ height }) => height))).toBeCloseTo(4, 5);
  });
  it("builds actual contained 18-unit peg and pusher halls from resolved frames", () => {
    const r = buildObstacleGeometry(track.geometry, resolved);
    expect(distance(point(r.pegHallSurface, 0), point(r.pegHallSurface, 1))).toBeCloseTo(18, 5); expect(distance(point(r.pusherHallSurface, 0), point(r.pusherHallSurface, 1))).toBeCloseTo(18, 5);
    for (const peg of r.pegs) expect(9 - Math.abs(peg.lateral) - peg.radius).toBeGreaterThanOrEqual(MIN_DEVICE_CLEARANCE);
  });
  it("generates exactly two smooth branch passages with every rail surface gap at least 2.04", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const paths = r.branchRails.centerlines; expect(paths).toHaveLength(3);
    for (let i = 0; i < paths[0].length / 3; i += 1) {
      const geometry = (positions: Float32Array): Geometry => ({ positions, indices: new Uint32Array() }); const left = point(geometry(paths[0]), i); const middle = point(geometry(paths[1]), i); const right = point(geometry(paths[2]), i);
      expect(distance(left, middle) - r.branchRails.radius * 2).toBeGreaterThanOrEqual(MIN_DEVICE_CLEARANCE); expect(distance(middle, right) - r.branchRails.radius * 2).toBeGreaterThanOrEqual(MIN_DEVICE_CLEARANCE);
    }
    const centralLateral = Array.from({ length: paths[1].length / 3 }, (_, i) => { const p = point({ positions: paths[1], indices: new Uint32Array() }, i); const sample = track.samples[projectToTrack({ x: p[0], y: p[1], z: p[2] }, track.samples).sampleIndex]; return dot([p[0] - sample.position.x, p[1] - sample.position.y, p[2] - sample.position.z], sample.side); });
    expect(Math.min(...centralLateral)).toBeLessThan(-0.2); expect(Math.max(...centralLateral)).toBeGreaterThan(0.2);
  });
  it("attaches both generated branch floors to canonical branch samples without vertical drift", () => {
    const r = buildObstacleGeometry(track.geometry, resolved);
    expect(r.branchFloors).toHaveLength(2);
    for (const floor of r.branchFloors) for (let i = 0; i < floor.positions.length / 3; i += 1) {
      const current = point(floor, i); const sampleIndex = projectToTrack({ x: current[0], y: current[1], z: current[2] }, track.samples).sampleIndex; const sample = track.samples[sampleIndex];
      expect(Math.abs(dot([current[0] - sample.position.x, current[1] - sample.position.y, current[2] - sample.position.z], sample.up))).toBeLessThan(0.08);
    }
  });
  it("orients every branch rail ring with its locally projected canonical frame", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const ringSize = 10;
    for (let i = 0; i < r.branchRails.centerlines[0].length / 3; i += 1) {
      const center = point({ positions: r.branchRails.centerlines[0], indices: new Uint32Array() }, i); const vertex = point(r.branchRails, i * ringSize); const sample = track.samples[projectToTrack({ x: center[0], y: center[1], z: center[2] }, track.samples).sampleIndex];
      const radial = [vertex[0] - center[0], vertex[1] - center[1], vertex[2] - center[2]]; const length = Math.hypot(...radial); expect(dot(radial.map((v) => v / length), sample.side)).toBeGreaterThan(0.98);
    }
  });
  it("derives the only vortex entry and outlet loops from topology and measures outlet/drop from vertices", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const loops = [...boundaryLoops(r.vortex)]; expect(loops).toHaveLength(2);
    const outletAnchor = { x: resolved.vortex.frame.position.x + resolved.vortex.frame.tangent.x * 0.28 - resolved.vortex.frame.up.x * 1.36, y: resolved.vortex.frame.position.y + resolved.vortex.frame.tangent.y * 0.28 - resolved.vortex.frame.up.y * 1.36, z: resolved.vortex.frame.position.z + resolved.vortex.frame.tangent.z * 0.28 - resolved.vortex.frame.up.z * 1.36 };
    const outletLoop = loops.reduce((nearest, loop) => loop.reduce((sum, i) => { const p = point(r.vortex, i); return sum + Math.hypot(p[0] - outletAnchor.x, p[1] - outletAnchor.y, p[2] - outletAnchor.z); }, 0) < nearest.reduce((sum, i) => { const p = point(r.vortex, i); return sum + Math.hypot(p[0] - outletAnchor.x, p[1] - outletAnchor.y, p[2] - outletAnchor.z); }, 0) ? loop : nearest);
    const outletCenter = centroid(r.vortex, outletLoop); const outlet = outletLoop.map((i) => point(r.vortex, i));
    expect(outlet.reduce((sum, p) => sum + distance(p, outletCenter), 0) / outlet.length * 2).toBeCloseTo(1.36, 2);
    const rim = Array.from({ length: r.vortex.positions.length / 3 }, (_, i) => point(r.vortex, i)).filter((p) => Math.abs(Math.hypot(p[0] - resolved.vortex.frame.position.x, p[1] - resolved.vortex.frame.position.y, p[2] - resolved.vortex.frame.position.z) - resolved.vortex.radius) < 0.05 && Math.abs(dot([p[0] - resolved.vortex.frame.position.x, p[1] - resolved.vortex.frame.position.y, p[2] - resolved.vortex.frame.position.z], resolved.vortex.frame.up)) < 0.05);
    const entryCenter = [rim.reduce((sum, p) => sum + p[0], 0) / rim.length, rim.reduce((sum, p) => sum + p[1], 0) / rim.length, rim.reduce((sum, p) => sum + p[2], 0) / rim.length] as const;
    expect(dot([entryCenter[0] - outletCenter[0], entryCenter[1] - outletCenter[1], entryCenter[2] - outletCenter[2]], resolved.vortex.frame.up)).toBeCloseTo(1.36, 2);
    const d = [outletCenter[0] - entryCenter[0], outletCenter[1] - entryCenter[1], outletCenter[2] - entryCenter[2]]; const v = dot(d, resolved.vortex.frame.up); expect(Math.sqrt(Math.max(0, distance(outletCenter, entryCenter) ** 2 - v ** 2))).toBeGreaterThan(0.1);
  });
  it("builds high containment walls, an open start throat, and a catch collar that overlaps the outlet", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const heights = Array.from({ length: r.startBowl.positions.length / 3 }, (_, i) => dot(point(r.startBowl, i), resolved.start.frame.up));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(1.5); expect(r.startThroat.indices.length).toBeGreaterThan(0);
    const outlet = boundaryLoops(r.vortex)[0].map((i) => point(r.vortex, i)); const catchPoints = Array.from({ length: r.catchChannel.positions.length / 3 }, (_, i) => point(r.catchChannel, i));
    expect(Math.min(...outlet.flatMap((a) => catchPoints.map((b) => distance(a, b))))).toBeLessThan(0.35);
  });
  it("cuts localized wall apertures and derives only the intended bowl openings from welded topology", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const startLoops = boundaryLoops(r.startBowl); const vortexLoops = boundaryLoops(r.vortex);
    expect(startLoops).toHaveLength(2); expect(vortexLoops).toHaveLength(2);
    expect(Math.min(...startLoops.map((loop) => loop.length))).toBeLessThan(24); expect(Math.min(...vortexLoops.map((loop) => loop.length))).toBeLessThan(24);
    const throatPoints = Array.from({ length: r.startThroat.positions.length / 3 }, (_, i) => point(r.startThroat, i)); const startAperture = startLoops.flatMap((loop) => loop.map((i) => point(r.startBowl, i)));
    expect(Math.min(...throatPoints.flatMap((a) => startAperture.map((b) => distance(a, b))))).toBeLessThan(0.5);
  });
  it("faces the vortex aperture toward the actual incoming canonical route", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const aperture = boundaryLoops(r.vortex).reduce((outermost, loop) => loop.reduce((sum, i) => sum + distance(point(r.vortex, i), [resolved.vortex.frame.position.x, resolved.vortex.frame.position.y, resolved.vortex.frame.position.z]), 0) > outermost.reduce((sum, i) => sum + distance(point(r.vortex, i), [resolved.vortex.frame.position.x, resolved.vortex.frame.position.y, resolved.vortex.frame.position.z]), 0) ? loop : outermost); const aperturePoints = aperture.map((i) => point(r.vortex, i)); const center = [aperturePoints.reduce((sum, p) => sum + p[0], 0) / aperturePoints.length, aperturePoints.reduce((sum, p) => sum + p[1], 0) / aperturePoints.length, aperturePoints.reduce((sum, p) => sum + p[2], 0) / aperturePoints.length] as const; const prior = track.samples[resolved.vortex.frame.sampleIndex - 1]; const incoming = [prior.position.x - resolved.vortex.frame.position.x, prior.position.y - resolved.vortex.frame.position.y, prior.position.z - resolved.vortex.frame.position.z]; const entry = [center[0] - resolved.vortex.frame.position.x, center[1] - resolved.vortex.frame.position.y, center[2] - resolved.vortex.frame.position.z];
    expect(aperturePoints.length).toBeGreaterThan(0); expect(Math.hypot(...entry)).toBeGreaterThan(0.1); expect(Math.hypot(...incoming)).toBeGreaterThan(0.1); expect((entry[0] * incoming[0] + entry[1] * incoming[1] + entry[2] * incoming[2]) / (Math.hypot(...entry) * Math.hypot(...incoming))).toBeGreaterThan(0.8);
  });
  it("forms a route-oriented, enclosed catch half-tunnel with a rounded multi-ring bowl and outlet lip", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const up = resolved.vortex.frame.up;
    const bowlHeights = new Set(Array.from({ length: r.vortex.positions.length / 3 }, (_, i) => dot(point(r.vortex, i), up).toFixed(3))); expect(bowlHeights.size).toBeGreaterThan(4);
    const catchPoints = Array.from({ length: r.catchChannel.positions.length / 3 }, (_, i) => point(r.catchChannel, i)); const side = resolved.vortex.frame.side;
    expect(Math.max(...catchPoints.map((p) => dot(p, side))) - Math.min(...catchPoints.map((p) => dot(p, side)))).toBeGreaterThan(1.2);
    expect(Math.max(...catchPoints.map((p) => dot(p, up))) - Math.min(...catchPoints.map((p) => dot(p, up)))).toBeGreaterThan(0.6);
  });
  it("welds the catch collar to its half-tunnel with only the downstream channel opening", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); expect(boundaryLoops(r.catchChannel)).toHaveLength(1);
  });
  it("spans both local sides in the downstream catch U-section while retaining its vertical bowl", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const cross = 12; const row = 5; const sample = track.samples[resolved.vortex.frame.sampleIndex + row]; const base = { x: sample.position.x - sample.up.x * 1.58, y: sample.position.y - sample.up.y * 1.58, z: sample.position.z - sample.up.z * 1.58 };
    const local = Array.from({ length: cross + 1 }, (_, index) => point(r.catchChannel, row * (cross + 1) + index)).map((p) => ({ side: dot([p[0] - base.x, p[1] - base.y, p[2] - base.z], sample.side), up: dot([p[0] - base.x, p[1] - base.y, p[2] - base.z], sample.up) }));
    expect(Math.min(...local.map((value) => value.side))).toBeLessThan(-0.6); expect(Math.max(...local.map((value) => value.side))).toBeGreaterThan(0.6); expect(Math.min(...local.map((value) => value.up))).toBeLessThan(-0.6); expect(Math.max(...local.map((value) => value.up))).toBeCloseTo(0, 2);
  });
  it("uses a multi-section rounded profile for the start throat floor and walls", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); expect(r.startThroat.positions.length / 3).toBeGreaterThan(16); expect(new Set(Array.from({ length: r.startThroat.positions.length / 3 }, (_, i) => point(r.startThroat, i)[1].toFixed(3))).size).toBeGreaterThan(3);
  });
  it("builds an upward-wound start ramp bridge across the bowl-to-track overlap", () => {
    const bridge = buildStartRampBridge(resolved.start.frame);
    const frame = resolved.start.frame;
    const local = (index: number) => {
      const p = point(bridge, index);
      const delta = [p[0] - frame.position.x, p[1] - frame.position.y, p[2] - frame.position.z] as const;
      return { along: dot(delta, frame.tangent), side: dot(delta, frame.side), up: dot(delta, frame.up) };
    };
    expect(bridge.positions.length / 3).toBe(12);
    expect([0, 4, 8].map((index) => local(index).along)).toEqual([4.3, 6.5, 8.7].map((value) => expect.closeTo(value, 5)));
    expect([0, 4, 8].map((index) => local(index).up)).toEqual([-0.72, -0.34285714285714286, -0.03].map((value) => expect.closeTo(value, 5)));
    expect(local(0).side).toBeCloseTo(-3, 5);
    expect(local(1).side).toBeCloseTo(3, 5);
    const normal = (offset: number) => {
      const a = point(bridge, bridge.indices[offset]); const b = point(bridge, bridge.indices[offset + 1]); const c = point(bridge, bridge.indices[offset + 2]);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      return [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]] as const;
    };
    expect(dot(normal(0), frame.up)).toBeGreaterThan(0);
    expect(dot(normal(6), frame.side)).toBeGreaterThan(0);
    expect(dot(normal(12), frame.side)).toBeLessThan(0);
  });
  it("has finite non-degenerate indexed triangles in every generated static buffer", () => {
    const r = buildObstacleGeometry(track.geometry, resolved);
    for (const g of [r.shell, r.startBowl, r.startThroat, r.pegHallSurface, r.pusherHallSurface, ...r.branchFloors, r.branchRails, r.vortex, r.catchChannel]) { expect(Array.from(g.positions).every(Number.isFinite)).toBe(true); for (let i = 0; i < g.indices.length; i += 3) expect(twiceArea(g, i)).toBeGreaterThan(1e-6); }
  });
});
