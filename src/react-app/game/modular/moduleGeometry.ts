import type { TrackGeometry, Vec3 } from "../track/trackTypes";
import {
  CHANNEL_WIDTH,
  MAX_CURVE_BANK,
  MARBLE_DIAMETER,
  RAIL_HEIGHT,
  ROUTE_GRADE,
  type ModulePathSample,
} from "./modularTypes";

export const PROFILE_SEGMENTS = 128;
export const FLOOR_SPAN = 0.55;
const WALL_SEGMENTS = 62;
const FLOOR_SEGMENTS = PROFILE_SEGMENTS - WALL_SEGMENTS * 2;
const WALL_RISE_HEIGHT = RAIL_HEIGHT * 0.7875;
const CURVE_INNER_RAIL_HEIGHT = 5;

export type ChannelProfilePoint = Readonly<{ lateral: number; height: number }>;

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
const bezier = (
  a: ChannelProfilePoint,
  b: ChannelProfilePoint,
  c: ChannelProfilePoint,
  d: ChannelProfilePoint,
  amount: number,
): ChannelProfilePoint => {
  const inverse = 1 - amount;
  return {
    lateral: inverse ** 3 * a.lateral + 3 * inverse ** 2 * amount * b.lateral + 3 * inverse * amount ** 2 * c.lateral + amount ** 3 * d.lateral,
    height: inverse ** 3 * a.height + 3 * inverse ** 2 * amount * b.height + 3 * inverse * amount ** 2 * c.height + amount ** 3 * d.height,
  };
};

/** The one cross-section used by every modular render and collider row. */
export const profileAt = (width: number, leftHeight = RAIL_HEIGHT, rightHeight = RAIL_HEIGHT): readonly ChannelProfilePoint[] => {
  const half = width / 2;
  const floorHalf = width * FLOOR_SPAN / 2;
  const floor = { lateral: floorHalf, height: 0 };
  const points: ChannelProfilePoint[] = [];

  const wallSpan = half - floorHalf;
  const wall = (height: number): readonly ChannelProfilePoint[] => {
    const tip = { lateral: half, height };
    const result: ChannelProfilePoint[] = [];
    for (let index = 0; index <= WALL_SEGMENTS; index += 1) result.push(freeze(bezier(
      floor,
      { lateral: floor.lateral + wallSpan * 0.42, height: 0 },
      { lateral: tip.lateral, height: height / RAIL_HEIGHT * WALL_RISE_HEIGHT },
      tip,
      index / WALL_SEGMENTS,
    )));
    return result;
  };
  const rightHalf = wall(rightHeight);
  const floorPoints = Array.from({ length: FLOOR_SEGMENTS + 1 }, (_, index) => freeze({ lateral: lerp(-floorHalf, floorHalf, index / FLOOR_SEGMENTS), height: 0 }));
  const leftHalf = wall(leftHeight).map((point) => freeze({ lateral: -point.lateral, height: point.height })).reverse();
  points.push(...leftHalf, ...floorPoints.slice(1), ...rightHalf.slice(1));
  return Object.freeze(points);
};

export const CHANNEL_PROFILE = profileAt(CHANNEL_WIDTH);

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, amount: number): Vec3 => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const magnitude = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
  const length = magnitude(a);
  return length === 0 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / length);
};

const profileForFrame = (frame: Pick<ModulePathSample, "side" | "width"> & Readonly<{ centerlineCurvature: Vec3 }>): readonly ChannelProfilePoint[] => {
  const signedCurvature = frame.centerlineCurvature.x * frame.side.x + frame.centerlineCurvature.y * frame.side.y + frame.centerlineCurvature.z * frame.side.z;
  const bankBlend = Math.min(1, Math.abs(frame.side.y) / (Math.sin(MAX_CURVE_BANK) * Math.cos(ROUTE_GRADE)));
  const innerHeight = lerp(RAIL_HEIGHT, CURVE_INNER_RAIL_HEIGHT, bankBlend);
  return profileAt(frame.width, signedCurvature < 0 ? innerHeight : RAIL_HEIGHT, signedCurvature > 0 ? innerHeight : RAIL_HEIGHT);
};

export const profileNormalsAt = (
  frame: Pick<ModulePathSample, "tangent" | "side" | "up" | "centerlineCurvature">,
  width: number,
): readonly Vec3[] => {
  const profile = profileForFrame({ ...frame, width });
  return profile.slice(1).map((right, column) => {
    const left = profile[column];
    const transverse = add(
      scale(frame.side, right.lateral - left.lateral),
      scale(frame.up, right.height - left.height),
    );
    return normalize(cross(transverse, frame.tangent));
  });
};

const calculateNormals = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const normal = normalize(cross(
      { x: positions[b] - positions[a], y: positions[b + 1] - positions[a + 1], z: positions[b + 2] - positions[a + 2] },
      { x: positions[c] - positions[a], y: positions[c + 1] - positions[a + 1], z: positions[c + 2] - positions[a + 2] },
    ));
    for (const vertex of [a, b, c]) {
      normals[vertex] += normal.x;
      normals[vertex + 1] += normal.y;
      normals[vertex + 2] += normal.z;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const normal = normalize({ x: normals[offset], y: normals[offset + 1], z: normals[offset + 2] });
    normals[offset] = normal.x; normals[offset + 1] = normal.y; normals[offset + 2] = normal.z;
  }
  return normals;
};

export type ModularTrackGeometry = TrackGeometry & Readonly<{
  samples: readonly ModulePathSample[];
  sourceCellBySample: Uint8Array;
  seams: readonly Readonly<{ upstreamCell: number; downstreamCell: number; upstreamRow: number; downstreamRow: number }>[];
}>;

export type ModularGeometryFailure = Readonly<{
  code: "non-finite" | "index" | "degenerate" | "normal" | "disconnected" | "seam" | "cap" | "duplicate" | "profile" | "chord" | "longitudinal-normal";
  sampleIndex?: number;
  message: string;
}>;

export const buildModuleGeometry = (samples: readonly ModulePathSample[]): ModularTrackGeometry => {
  const rowSize = PROFILE_SEGMENTS + 1;
  const positions = new Float32Array(samples.length * rowSize * 3);
  const sourceCellBySample = new Uint8Array(samples.length);
  for (let row = 0; row < samples.length; row += 1) {
    const sample = samples[row];
    sourceCellBySample[row] = sample.cellIndex;
    const profile = profileForFrame(sample);
    for (let column = 0; column < rowSize; column += 1) {
      const point = profile[column];
      const position = add(sample.position, add(scale(sample.side, point.lateral), scale(sample.up, point.height)));
      const offset = (row * rowSize + column) * 3;
      positions[offset] = position.x; positions[offset + 1] = position.y; positions[offset + 2] = position.z;
    }
  }

  const indices = new Uint32Array(Math.max(0, samples.length - 1) * PROFILE_SEGMENTS * 6);
  let offset = 0;
  for (let row = 0; row < samples.length - 1; row += 1) {
    for (let column = 0; column < PROFILE_SEGMENTS; column += 1) {
      const a = row * rowSize + column;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices[offset] = a; indices[offset + 1] = b; indices[offset + 2] = c;
      indices[offset + 3] = b; indices[offset + 4] = d; indices[offset + 5] = c;
      offset += 6;
    }
  }

  const seams = samples.flatMap((sample, row) => {
    if (sample.ports?.length !== 2) return [];
    const [upstream, downstream] = sample.ports;
    return [{ upstreamCell: upstream.cellIndex, downstreamCell: downstream.cellIndex, upstreamRow: row, downstreamRow: row }];
  });
  return Object.freeze({
    positions,
    normals: calculateNormals(positions, indices),
    indices,
    featurePositions: new Float32Array(),
    featureNormals: new Float32Array(),
    featureIndices: new Uint32Array(),
    samples,
    profileSegments: PROFILE_SEGMENTS,
    triangleCount: indices.length / 3,
    sourceCellBySample,
    seams: Object.freeze(seams),
  });
};

const failure = (code: ModularGeometryFailure["code"], message: string, sampleIndex?: number): ModularGeometryFailure =>
  Object.freeze(sampleIndex === undefined ? { code, message } : { code, sampleIndex, message });

const triangleCross = (geometry: ModularTrackGeometry, triangle: number): Vec3 => {
  const offset = triangle * 3;
  const a = geometry.indices[offset] * 3;
  const b = geometry.indices[offset + 1] * 3;
  const c = geometry.indices[offset + 2] * 3;
  return cross(
    { x: geometry.positions[b] - geometry.positions[a], y: geometry.positions[b + 1] - geometry.positions[a + 1], z: geometry.positions[b + 2] - geometry.positions[a + 2] },
    { x: geometry.positions[c] - geometry.positions[a], y: geometry.positions[c + 1] - geometry.positions[a + 1], z: geometry.positions[c + 2] - geometry.positions[a + 2] },
  );
};

export const validateModuleGeometry = (geometry: ModularTrackGeometry): readonly ModularGeometryFailure[] => {
  const failures: ModularGeometryFailure[] = [];
  const vertexCount = geometry.positions.length / 3;
  if (![geometry.positions, geometry.normals, geometry.indices, geometry.sourceCellBySample].every((buffer) => Array.from(buffer).every(Number.isFinite))) failures.push(failure("non-finite", "Modular geometry contains a non-finite buffer value."));
  if (geometry.normals.length !== geometry.positions.length || geometry.indices.length % 3 !== 0) failures.push(failure("index", "Modular geometry buffers have incompatible lengths."));
  for (const index of geometry.indices) if (index >= vertexCount) failures.push(failure("index", "Modular geometry index is out of range."));

  const seen = new Set<string>();
  const edges = new Map<string, number>();
  const addEdge = (left: number, right: number): void => {
    const key = left < right ? `${left},${right}` : `${right},${left}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  };
  const adjacency = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let triangle = 0; triangle < geometry.indices.length / 3; triangle += 1) {
    const offset = triangle * 3;
    const [a, b, c] = [geometry.indices[offset], geometry.indices[offset + 1], geometry.indices[offset + 2]];
    const key = [a, b, c].sort((left, right) => left - right).join(",");
    if (seen.has(key)) failures.push(failure("duplicate", "Modular geometry contains a duplicate triangle."));
    seen.add(key);
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
    if (a === b || b === c || a === c || magnitude(triangleCross(geometry, triangle)) <= 1e-6) failures.push(failure("degenerate", "Modular geometry contains a degenerate triangle."));
    adjacency[a]?.add(b); adjacency[a]?.add(c); adjacency[b]?.add(a); adjacency[b]?.add(c); adjacency[c]?.add(a); adjacency[c]?.add(b);
  }
  if (vertexCount > 0) {
    const visited = new Set<number>([0]);
    const pending = [0];
    while (pending.length) for (const next of adjacency[pending.pop()!] ?? []) if (!visited.has(next)) { visited.add(next); pending.push(next); }
    if (visited.size !== vertexCount) failures.push(failure("disconnected", "Modular geometry has disconnected indexed vertices."));
  }

  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const normalLength = Math.hypot(geometry.normals[offset], geometry.normals[offset + 1], geometry.normals[offset + 2]);
    if (!Number.isFinite(normalLength) || Math.abs(normalLength - 1) > 1e-4) failures.push(failure("normal", "Modular geometry normal is not unit length."));
  }
  const rowSize = geometry.profileSegments + 1;
  if (geometry.profileSegments !== PROFILE_SEGMENTS || geometry.samples.length * rowSize * 3 !== geometry.positions.length) failures.push(failure("profile", "Modular geometry does not use the canonical profile topology."));
  for (let row = 0; row < geometry.samples.length; row += 1) {
    const profile = profileForFrame(geometry.samples[row]);
    for (let column = 0; column < rowSize; column += 1) {
      const expected = add(geometry.samples[row].position, add(scale(geometry.samples[row].side, profile[column].lateral), scale(geometry.samples[row].up, profile[column].height)));
      const actual = row * rowSize + column;
      const delta = Math.hypot(geometry.positions[actual * 3] - expected.x, geometry.positions[actual * 3 + 1] - expected.y, geometry.positions[actual * 3 + 2] - expected.z);
      // Float32 positions quantize large board coordinates; retain a tight, deterministic tolerance.
      if (delta > 2e-5) { failures.push(failure("profile", "Modular profile coordinates drift from the canonical sample frame.", row)); break; }
    }
  }
  for (const seam of geometry.seams) {
    if (seam.upstreamRow !== seam.downstreamRow || geometry.sourceCellBySample[seam.upstreamRow] !== seam.upstreamCell) failures.push(failure("seam", "Connected modular ports are not welded to one source row."));
    const row = seam.upstreamRow;
    if (row < 0 || row >= geometry.samples.length || geometry.samples[row].ports?.length !== 2) failures.push(failure("cap", "Connected modular seam has an invalid boundary row."));
    if (row >= 0 && row < geometry.samples.length) {
      for (let column = 0; column < geometry.profileSegments; column += 1) {
        const left = row * rowSize + column;
        const right = left + 1;
        const key = left < right ? `${left},${right}` : `${right},${left}`;
        if (edges.get(key) !== 2) failures.push(failure("seam", "Connected modular seam contains an open or overlapping profile edge.", row));
      }
    }
  }

  for (let triangle = 0; triangle < geometry.indices.length / 3; triangle += 1) {
    const offset = triangle * 3;
    const rows = [geometry.indices[offset], geometry.indices[offset + 1], geometry.indices[offset + 2]].map((index) => Math.floor(index / rowSize));
    if (rows[0] === rows[1] && rows[1] === rows[2] && geometry.seams.some((seam) => seam.upstreamRow === rows[0])) failures.push(failure("cap", "Connected modular seam contains an end cap triangle.", rows[0]));
  }

  let previousProfileNormals: readonly Vec3[] | undefined;
  for (let row = 0; row < geometry.samples.length; row += 1) {
    const chordError = geometry.samples[row].chordError;
    if (chordError === undefined || !Number.isFinite(chordError) || chordError > 0.02 * MARBLE_DIAMETER) failures.push(failure("chord", "Modular longitudinal chord error exceeds 0.02D.", row));
    const nextProfileNormals = profileNormalsAt(geometry.samples[row], geometry.samples[row].width);
    if (previousProfileNormals === undefined) { previousProfileNormals = nextProfileNormals; continue; }
    for (let column = 0; column < nextProfileNormals.length; column += 1) {
      const previousNormal = previousProfileNormals[column];
      const nextNormal = nextProfileNormals[column];
      const surfaceTurn = Math.acos(Math.max(-1, Math.min(1, previousNormal.x * nextNormal.x + previousNormal.y * nextNormal.y + previousNormal.z * nextNormal.z)));
      if (surfaceTurn > 2 * Math.PI / 180 + 1e-6) {
        failures.push(failure("longitudinal-normal", "Adjacent modular surface triangles turn more than two degrees.", row));
        break;
      }
    }
    previousProfileNormals = nextProfileNormals;
  }
  for (let row = 0; row < geometry.samples.length - 1; row += 1) {
    for (let column = 0; column < geometry.profileSegments; column += 1) {
      const a = row * rowSize + column;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      const offset = (row * geometry.profileSegments + column) * 6;
      if (geometry.indices[offset] !== a || geometry.indices[offset + 1] !== b || geometry.indices[offset + 2] !== c
        || geometry.indices[offset + 3] !== b || geometry.indices[offset + 4] !== d || geometry.indices[offset + 5] !== c) {
        failures.push(failure("longitudinal-normal", "Modular surface triangle winding disagrees with its analytic profile frame.", row));
        break;
      }
    }
  }
  return Object.freeze(failures);
};
