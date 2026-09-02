import { buildValidatedTrack } from "./trackBuild";

type Point = Readonly<{ x: number; y: number; z: number }>;

const subtract = (left: Point, right: Point): Point => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const dot = (left: Point, right: Point): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const distanceToTriangle = (point: Point, first: Point, second: Point, third: Point): number => {
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

const geometry = buildValidatedTrack().geometry;
const vertexAt = (index: number): Point => ({
  x: geometry.positions[index * 3],
  y: geometry.positions[index * 3 + 1],
  z: geometry.positions[index * 3 + 2],
});
const triangles = Array.from({ length: geometry.indices.length / 3 }, (_, index) => [
  vertexAt(geometry.indices[index * 3]),
  vertexAt(geometry.indices[index * 3 + 1]),
  vertexAt(geometry.indices[index * 3 + 2]),
] as const);

export const exactLaunchMeshDistance = (point: Point): number => Math.min(
  ...triangles.map(([first, second, third]) => distanceToTriangle(point, first, second, third)),
);
