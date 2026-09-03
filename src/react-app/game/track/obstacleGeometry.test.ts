import { describe, expect, it } from "vitest";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { MIN_DEVICE_CLEARANCE } from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";

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
  for (const start of adjacent.keys()) if (!seen.has(start)) { const loop: number[] = []; let current = start; let prior = -1; while (!seen.has(current)) { seen.add(current); loop.push(current); const next = adjacent.get(current)!.find((v) => v !== prior); if (next === undefined) break; prior = current; current = next; } loops.push(loop); }
  return loops;
};
const twiceArea = (g: Geometry, i: number): number => {
  const a = point(g, g.indices[i]); const b = point(g, g.indices[i + 1]); const c = point(g, g.indices[i + 2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
};

describe("neon obstacle geometry", () => {
  const track = buildValidatedTrack({ features: true }); const resolved = track.obstacleLayout;
  it("keeps canonical U-channel buffers untouched while adding a 0.7-unit shell", () => {
    const positions = track.geometry.positions; const indices = track.geometry.indices; const r = buildObstacleGeometry(track.geometry, resolved);
    expect(track.geometry.positions).toBe(positions); expect(track.geometry.indices).toBe(indices); expect(r.shell.positions).not.toBe(positions); expect(r.shell.thickness).toBe(0.7);
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
    const centralLateral = Array.from({ length: paths[1].length / 3 }, (_, i) => { const p = point({ positions: paths[1], indices: new Uint32Array() }, i); return dot([p[0] - resolved.branch.start.position.x, p[1] - resolved.branch.start.position.y, p[2] - resolved.branch.start.position.z], resolved.branch.start.side); });
    expect(Math.min(...centralLateral)).toBeLessThan(-0.2); expect(Math.max(...centralLateral)).toBeGreaterThan(0.2);
  });
  it("derives the only vortex entry and outlet loops from topology and measures outlet/drop from vertices", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const loops = [...boundaryLoops(r.vortex)].sort((a, b) => a.length - b.length); expect(loops).toHaveLength(2);
    const outletCenter = centroid(r.vortex, loops[0]); const entryCenter = centroid(r.vortex, loops[1]); const outlet = loops[0].map((i) => point(r.vortex, i));
    expect(outlet.reduce((sum, p) => sum + distance(p, outletCenter), 0) / outlet.length * 2).toBeCloseTo(1.36, 2);
    expect(dot([entryCenter[0] - outletCenter[0], entryCenter[1] - outletCenter[1], entryCenter[2] - outletCenter[2]], resolved.vortex.frame.up)).toBeCloseTo(1.36, 2);
    const d = [outletCenter[0] - entryCenter[0], outletCenter[1] - entryCenter[1], outletCenter[2] - entryCenter[2]]; const v = dot(d, resolved.vortex.frame.up);
    expect(Math.sqrt(Math.max(0, distance(outletCenter, entryCenter) ** 2 - v ** 2))).toBeGreaterThan(0.1);
  });
  it("builds high containment walls, an open start throat, and a catch collar that overlaps the outlet", () => {
    const r = buildObstacleGeometry(track.geometry, resolved); const heights = Array.from({ length: r.startBowl.positions.length / 3 }, (_, i) => dot(point(r.startBowl, i), resolved.start.frame.up));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(1.5); expect(r.startThroat.indices.length).toBeGreaterThan(0);
    const outlet = boundaryLoops(r.vortex)[0].map((i) => point(r.vortex, i)); const catchPoints = Array.from({ length: r.catchChannel.positions.length / 3 }, (_, i) => point(r.catchChannel, i));
    expect(Math.min(...outlet.flatMap((a) => catchPoints.map((b) => distance(a, b))))).toBeLessThan(0.35);
  });
  it("has finite non-degenerate indexed triangles in every generated static buffer", () => {
    const r = buildObstacleGeometry(track.geometry, resolved);
    for (const g of [r.shell, r.startBowl, r.startThroat, r.pegHallSurface, r.pusherHallSurface, r.branchRails, r.vortex, r.catchChannel]) { expect(Array.from(g.positions).every(Number.isFinite)).toBe(true); for (let i = 0; i < g.indices.length; i += 3) expect(twiceArea(g, i)).toBeGreaterThan(1e-6); }
  });
});
