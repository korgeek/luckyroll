import type { ResolvedFrame, ResolvedPeg, ResolvedStart, ValidResolvedObstacleLayout, TrackGeometry, Vec3 } from "./trackTypes";

export type IndexedGeometry = Readonly<{ positions: Float32Array; normals: Float32Array; indices: Uint32Array }>;
type BranchGeometry = IndexedGeometry & Readonly<{ centerlines: readonly Float32Array[]; radius: number }>;
export type ObstacleGeometryResources = Readonly<{
  shell: IndexedGeometry & Readonly<{ thickness: number }>;
  startBowl: IndexedGeometry;
  startThroat: IndexedGeometry;
  pegHallSurface: IndexedGeometry;
  pusherHallSurface: IndexedGeometry;
  pegs: readonly ResolvedPeg[];
  branchFloors: readonly IndexedGeometry[];
  branchRails: BranchGeometry;
  vortex: IndexedGeometry;
  catchChannel: IndexedGeometry;
  layout: ValidResolvedObstacleLayout;
}>;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, n: number): Vec3 => ({ x: v.x * n, y: v.y * n, z: v.z * n });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (v: Vec3): Vec3 => { const n = Math.hypot(v.x, v.y, v.z); return n === 0 ? { x: 0, y: 1, z: 0 } : scale(v, 1 / n); };
const inFrame = (f: ResolvedFrame, along: number, side: number, up = 0): Vec3 => add(f.position, add(scale(f.tangent, along), add(scale(f.side, side), scale(f.up, up))));
const write = (target: number[], p: Vec3): void => { target.push(p.x, p.y, p.z); };

export type BowlSurfaceSample = Readonly<{ position: Vec3; normal: Vec3; centerAlong: number; height: number }>;
type BowlProfilePoint = Readonly<{ radius: number; height: number; centerAlong: number }>;
const bowlProfile = (outerRadius: number, innerRadius: number, drop: number, innerAlong: number): readonly BowlProfilePoint[] => Object.freeze([
  Object.freeze({ radius: innerRadius, height: -drop, centerAlong: innerAlong }),
  Object.freeze({ radius: innerRadius + 0.16, height: -drop + 0.12, centerAlong: innerAlong * 2 / 3 }),
  Object.freeze({ radius: (innerRadius + outerRadius) / 2, height: -drop * 0.28, centerAlong: innerAlong / 3 }),
  Object.freeze({ radius: outerRadius, height: 0, centerAlong: 0 }),
]);
const sampleProfile = (profile: readonly BowlProfilePoint[], radius: number): Readonly<{ height: number; centerAlong: number; heightSlope: number; centerSlope: number }> => {
  const limited = Math.max(profile[0].radius, Math.min(profile[profile.length - 1].radius, radius));
  const upperIndex = Math.min(profile.length - 1, Math.max(1, profile.findIndex((point) => limited <= point.radius)));
  const lower = profile[upperIndex - 1]; const upper = profile[upperIndex]; const fraction = (limited - lower.radius) / (upper.radius - lower.radius);
  return Object.freeze({ height: lower.height + (upper.height - lower.height) * fraction, centerAlong: lower.centerAlong + (upper.centerAlong - lower.centerAlong) * fraction, heightSlope: (upper.height - lower.height) / (upper.radius - lower.radius), centerSlope: (upper.centerAlong - lower.centerAlong) / (upper.radius - lower.radius) });
};
const sampleWalledBowlSurface = (frame: ResolvedFrame, outerRadius: number, innerRadius: number, drop: number, innerAlong: number, radius: number, angle: number): BowlSurfaceSample => {
  const profile = sampleProfile(bowlProfile(outerRadius, innerRadius, drop, innerAlong), radius);
  const radialDerivative = add(scale(frame.tangent, profile.centerSlope + Math.cos(angle)), add(scale(frame.side, Math.sin(angle)), scale(frame.up, profile.heightSlope)));
  const angleDerivative = add(scale(frame.tangent, -Math.sin(angle) * radius), scale(frame.side, Math.cos(angle) * radius));
  let normal = normalize(cross(angleDerivative, radialDerivative)); if (normal.x * frame.up.x + normal.y * frame.up.y + normal.z * frame.up.z < 0) normal = scale(normal, -1);
  return Object.freeze({ position: inFrame(frame, profile.centerAlong + Math.cos(angle) * radius, Math.sin(angle) * radius, profile.height), normal, centerAlong: profile.centerAlong, height: profile.height });
};
export const sampleStartBowlSurface = (start: ResolvedStart, radius: number, angle: number): BowlSurfaceSample =>
  sampleWalledBowlSurface(start.frame, start.radius, 1.55, 0.72, 6.05, radius, angle);

const normalsFor = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3; const b = indices[i + 1] * 3; const c = indices[i + 2] * 3;
    const ab = { x: positions[b] - positions[a], y: positions[b + 1] - positions[a + 1], z: positions[b + 2] - positions[a + 2] };
    const ac = { x: positions[c] - positions[a], y: positions[c + 1] - positions[a + 1], z: positions[c + 2] - positions[a + 2] };
    const face = normalize({ x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x });
    for (const at of [a, b, c]) { normals[at] += face.x; normals[at + 1] += face.y; normals[at + 2] += face.z; }
  }
  for (let i = 0; i < normals.length; i += 3) { const n = normalize({ x: normals[i], y: normals[i + 1], z: normals[i + 2] }); normals[i] = n.x; normals[i + 1] = n.y; normals[i + 2] = n.z; }
  return normals;
};
const indexed = (positions: number[], indices: number[]): IndexedGeometry => { const p = new Float32Array(positions); const i = new Uint32Array(indices); return Object.freeze({ positions: p, normals: normalsFor(p, i), indices: i }); };
const join = (parts: readonly IndexedGeometry[]): IndexedGeometry => {
  const positions: number[] = []; const indices: number[] = []; let offset = 0;
  for (const part of parts) { positions.push(...part.positions); for (const index of part.indices) indices.push(index + offset); offset += part.positions.length / 3; }
  return indexed(positions, indices);
};

export const buildTrackShell = (track: TrackGeometry): IndexedGeometry & Readonly<{ thickness: number }> => {
  const positions: number[] = []; const indices: number[] = []; const row = track.profileSegments + 1;
  for (let sample = 0; sample < track.samples.length; sample += 1) for (const column of [0, track.profileSegments]) {
    const at = (sample * row + column) * 3; const edge = { x: track.positions[at], y: track.positions[at + 1], z: track.positions[at + 2] }; write(positions, edge); write(positions, add(edge, scale(track.samples[sample].up, -0.7)));
  }
  for (let sample = 0; sample < track.samples.length - 1; sample += 1) {
    for (const side of [0, 1]) { const a = sample * 4 + side * 2; const b = a + 4; indices.push(a, b, a + 1, a + 1, b, b + 1); }
    const a = sample * 4; const b = a + 4; indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  return Object.freeze({ ...indexed(positions, indices), thickness: 0.7 });
};

const wideHall = (frame: ResolvedFrame, width: number, length: number): IndexedGeometry => {
  const floor = [inFrame(frame, -length / 2, -width / 2), inFrame(frame, -length / 2, width / 2), inFrame(frame, length / 2, -width / 2), inFrame(frame, length / 2, width / 2)];
  const top = floor.map((p) => add(p, scale(frame.up, 1.5))); const positions: number[] = []; [...floor, ...top].forEach((p) => write(positions, p));
  return indexed(positions, [0, 2, 1, 1, 2, 3, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);
};

const walledBowl = (frame: ResolvedFrame, outerRadius: number, innerRadius: number, drop: number, innerAlong: number, wallHeight: number, entryAngle = 0, segments = 32): IndexedGeometry => {
  const positions: number[] = []; const indices: number[] = []; const radial = [innerRadius, innerRadius + 0.16, (innerRadius + outerRadius) / 2, outerRadius];
  radial.forEach((radius) => {
    for (let i = 0; i < segments; i += 1) { const angle = i / segments * Math.PI * 2; write(positions, sampleWalledBowlSurface(frame, outerRadius, innerRadius, drop, innerAlong, radius, angle).position); }
  });
  for (let ring = 0; ring < radial.length - 1; ring += 1) for (let i = 0; i < segments; i += 1) { const next = (i + 1) % segments; const a = ring * segments + i; const b = ring * segments + next; const c = a + segments; const d = b + segments; indices.push(a, b, c, b, d, c); }
  const floorOuter = (radial.length - 1) * segments; const innerTop = floorOuter + segments; const outerTop = innerTop + segments; const outerBottom = outerTop + segments;
  for (const [radius, height] of [[outerRadius, wallHeight], [outerRadius + 0.42, wallHeight], [outerRadius + 0.42, 0]] as const) for (let i = 0; i < segments; i += 1) { const angle = i / segments * Math.PI * 2; write(positions, inFrame(frame, Math.cos(angle) * radius, Math.sin(angle) * radius, height)); }
  const entrySegment = Math.round((entryAngle / (Math.PI * 2) + 1) * segments) % segments;
  const aperture = (i: number): boolean => Math.abs(((i - entrySegment + segments / 2) % segments) - segments / 2) <= 2;
  for (let i = 0; i < segments; i += 1) if (!aperture(i)) {
    const next = (i + 1) % segments;
    for (const [from, to] of [[floorOuter, innerTop], [innerTop, outerTop], [outerTop, outerBottom], [outerBottom, floorOuter]] as const) { const a = from + i; const b = from + next; const c = to + i; const d = to + next; indices.push(a, c, b, b, c, d); }
  }
  for (const at of [(entrySegment + 3) % segments, (entrySegment - 3 + segments) % segments]) { const a = floorOuter + at; const b = innerTop + at; const c = outerTop + at; const d = outerBottom + at; indices.push(a, b, c, a, c, d); }
  return indexed(positions, indices);
};

export { walledBowl as buildWalledBowl };

const channelThroat = (frame: ResolvedFrame, centerAlong: number, width: number, length: number, depth: number): IndexedGeometry => {
  const positions: number[] = []; const indices: number[] = []; const rows = 5; const cross = 8;
  for (let row = 0; row < rows; row += 1) { const t = row / (rows - 1); const along = centerAlong + (t - 0.5) * length; const radius = width / 2 * (0.9 + 0.1 * Math.sin(Math.PI * t)); for (let i = 0; i <= cross; i += 1) { const angle = Math.PI + i / cross * Math.PI; write(positions, inFrame(frame, along, Math.cos(angle) * radius, -depth + Math.sin(angle) * radius)); } }
  for (let row = 0; row < rows - 1; row += 1) for (let i = 0; i < cross; i += 1) { const a = row * (cross + 1) + i; const b = a + 1; const c = a + cross + 1; const d = c + 1; indices.push(a, c, b, b, c, d); }
  return indexed(positions, indices);
};

const sampleBranchPath = (samples: readonly TrackGeometry["samples"][number][], kind: "left" | "middle" | "right"): Float32Array => {
  const values: number[] = []; const count = 17;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1); const sample = samples[Math.round(t * (samples.length - 1))]; const base = sample.position; const sine = Math.sin(Math.PI * 2 * t);
    const lateral = kind === "left" ? -5 + 1.8 * t - 0.18 * sine : kind === "right" ? 5 - 1.8 * t - 0.18 * sine : 0.75 * sine;
    write(values, add(base, scale(sample.side, lateral)));
  }
  return new Float32Array(values);
};

const branchFloor = (left: Float32Array, right: Float32Array): IndexedGeometry => {
  const positions: number[] = []; const indices: number[] = []; const count = left.length / 3;
  for (let i = 0; i < count; i += 1) { positions.push(left[i * 3], left[i * 3 + 1], left[i * 3 + 2], right[i * 3], right[i * 3 + 1], right[i * 3 + 2]); }
  for (let i = 0; i < count - 1; i += 1) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return indexed(positions, indices);
};

const tube = (centers: Float32Array, radius: number, frames: readonly ResolvedFrame[]): IndexedGeometry => {
  const ring = 10; const count = centers.length / 3; const positions: number[] = []; const indices: number[] = [];
  const center = (index: number): Vec3 => ({ x: centers[index * 3], y: centers[index * 3 + 1], z: centers[index * 3 + 2] });
  for (let i = 0; i < count; i += 1) for (let j = 0; j < ring; j += 1) { const angle = j / ring * Math.PI * 2; const frame = frames[i]; write(positions, add(center(i), add(scale(frame.side, Math.cos(angle) * radius), scale(frame.up, Math.sin(angle) * radius)))); }
  for (let i = 0; i < count - 1; i += 1) for (let j = 0; j < ring; j += 1) { const next = (j + 1) % ring; const a = i * ring + j; const b = i * ring + next; const c = a + ring; const d = b + ring; indices.push(a, c, b, b, c, d); }
  const cap = (base: number, direction: Vec3, atEnd: boolean): void => {
    const frame = frames[base];
    let prior = Array.from({ length: ring }, (_, j) => (atEnd ? (count - 1) * ring : 0) + j);
    for (let level = 1; level < 4; level += 1) {
      const angle = level / 4 * Math.PI / 2; const ringRadius = radius * Math.cos(angle); const shift = radius * Math.sin(angle); const ringIndexes: number[] = [];
      for (let j = 0; j < ring; j += 1) { const theta = j / ring * Math.PI * 2; ringIndexes.push(positions.length / 3); write(positions, add(center(base), add(scale(direction, shift), add(scale(frame.side, Math.cos(theta) * ringRadius), scale(frame.up, Math.sin(theta) * ringRadius))))); }
      for (let j = 0; j < ring; j += 1) { const next = (j + 1) % ring; indices.push(prior[j], ringIndexes[j], prior[next], prior[next], ringIndexes[j], ringIndexes[next]); } prior = ringIndexes;
    }
    const tip = positions.length / 3; write(positions, add(center(base), scale(direction, radius))); for (let j = 0; j < ring; j += 1) indices.push(prior[j], tip, prior[(j + 1) % ring]);
  };
  cap(0, scale(normalize(sub(center(0), center(1))), 1), false); cap(count - 1, scale(normalize(sub(center(count - 1), center(count - 2))), 1), true);
  return indexed(positions, indices);
};

const branch = (track: TrackGeometry, layout: ValidResolvedObstacleLayout): Readonly<{ rails: BranchGeometry; floors: readonly IndexedGeometry[] }> => {
  const samples = track.samples.slice(layout.branch.start.sampleIndex, layout.branch.end.sampleIndex + 1);
  const frames = Array.from({ length: 17 }, (_, i) => { const sample = samples[Math.round(i / 16 * (samples.length - 1))]; return Object.freeze({ sampleIndex: sample.index, position: sample.position, tangent: sample.tangent, side: sample.side, up: sample.up }); });
  const centerlines = [sampleBranchPath(samples, "left"), sampleBranchPath(samples, "middle"), sampleBranchPath(samples, "right")];
  return Object.freeze({ rails: Object.freeze({ ...join(centerlines.map((line) => tube(line, 0.28, frames))), centerlines: Object.freeze(centerlines), radius: 0.28 }), floors: Object.freeze([branchFloor(centerlines[0], centerlines[1]), branchFloor(centerlines[1], centerlines[2])]) });
};

const catchChannel = (samples: readonly TrackGeometry["samples"][number][], frame: ResolvedFrame, outletAlong: number, radius: number): IndexedGeometry => {
  const cross = 12; const route = samples.slice(frame.sampleIndex, frame.sampleIndex + 6); const positions: number[] = []; const indices: number[] = [];
  route.forEach((sample, row) => { const blend = row / Math.max(1, route.length - 1); const base = row === 0 ? inFrame(frame, outletAlong, 0, -1.36) : add(sample.position, scale(sample.up, -1.58)); for (let i = 0; i <= cross; i += 1) { const angle = Math.PI + i / cross * Math.PI; const collarRadial = add(scale(frame.tangent, Math.cos(angle)), scale(frame.side, Math.sin(angle))); const tunnelRadial = add(scale(sample.side, Math.cos(angle)), scale(sample.up, Math.sin(angle))); const radial = normalize(add(scale(collarRadial, 1 - blend), scale(tunnelRadial, blend))); write(positions, add(base, scale(radial, radius))); } });
  for (let row = 0; row < route.length - 1; row += 1) for (let i = 0; i < cross; i += 1) { const a = row * (cross + 1) + i; const b = a + 1; const c = a + cross + 1; const d = c + 1; indices.push(a, c, b, b, c, d); }
  return indexed(positions, indices);
};

export const buildObstacleGeometry = (track: TrackGeometry, layout: ValidResolvedObstacleLayout): ObstacleGeometryResources => {
  const outletRadius = layout.vortex.outletDiameter / 2; const outletAlong = 0.28; const predecessor = track.samples[Math.max(0, layout.vortex.frame.sampleIndex - 1)]; const towardIncomingRoute = sub(predecessor.position, layout.vortex.frame.position); const vortexEntryAngle = Math.atan2(towardIncomingRoute.x * layout.vortex.frame.side.x + towardIncomingRoute.y * layout.vortex.frame.side.y + towardIncomingRoute.z * layout.vortex.frame.side.z, towardIncomingRoute.x * layout.vortex.frame.tangent.x + towardIncomingRoute.y * layout.vortex.frame.tangent.y + towardIncomingRoute.z * layout.vortex.frame.tangent.z);
  const startThroat = channelThroat(layout.start.frame, 7.5, 3.4, 4.2, 0.72); const branchResources = branch(track, layout);
  return Object.freeze({
    shell: buildTrackShell(track), startBowl: walledBowl(layout.start.frame, layout.start.radius, 1.55, 0.72, 6.05, layout.start.wallHeight), startThroat,
    pegHallSurface: wideHall(layout.pegHall.frame, layout.pegHall.width, 10), pusherHallSurface: wideHall(layout.pushers.frame, layout.pushers.hallWidth, 9), pegs: layout.pegs,
    branchFloors: branchResources.floors, branchRails: branchResources.rails, vortex: walledBowl(layout.vortex.frame, layout.vortex.radius, outletRadius, layout.vortex.verticalDrop, outletAlong, 1.85, vortexEntryAngle),
    catchChannel: catchChannel(track.samples, layout.vortex.frame, outletAlong, outletRadius), layout,
  });
};
