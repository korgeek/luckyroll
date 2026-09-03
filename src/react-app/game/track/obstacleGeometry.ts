import type { ResolvedFrame, ResolvedPeg, ValidResolvedObstacleLayout, TrackGeometry, Vec3 } from "./trackTypes";

export type IndexedGeometry = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}>;

export type ObstacleGeometryResources = Readonly<{
  shell: IndexedGeometry & Readonly<{ thickness: number }>;
  startBowl: IndexedGeometry;
  pegHallSurface: IndexedGeometry;
  pusherHallSurface: IndexedGeometry;
  pegs: readonly ResolvedPeg[];
  branchRails: IndexedGeometry & Readonly<{ roundedEnds: boolean; mergeOpening: number }>;
  vortex: IndexedGeometry & Readonly<{ outletDiameter: number; rimDrop: number; openBoundaries: readonly ["entry", "outlet"] }>;
  catchChannel: IndexedGeometry & Readonly<{ overlap: number }>;
  layout: ValidResolvedObstacleLayout;
}>;

const add = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
const scale = (value: Vec3, amount: number): Vec3 => ({ x: value.x * amount, y: value.y * amount, z: value.z * amount });

const pointInFrame = (frame: ResolvedFrame, along: number, lateral: number, vertical = 0): Vec3 =>
  add(frame.position, add(scale(frame.tangent, along), add(scale(frame.side, lateral), scale(frame.up, vertical))));

const normalise = (value: Vec3): Vec3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  return length === 0 ? { x: 0, y: 1, z: 0 } : scale(value, 1 / length);
};

const normalsFor = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index] * 3; const b = indices[index + 1] * 3; const c = indices[index + 2] * 3;
    const ab = { x: positions[b] - positions[a], y: positions[b + 1] - positions[a + 1], z: positions[b + 2] - positions[a + 2] };
    const ac = { x: positions[c] - positions[a], y: positions[c + 1] - positions[a + 1], z: positions[c + 2] - positions[a + 2] };
    const face = normalise({ x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x });
    for (const vertex of [a, b, c]) { normals[vertex] += face.x; normals[vertex + 1] += face.y; normals[vertex + 2] += face.z; }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const unit = normalise({ x: normals[index], y: normals[index + 1], z: normals[index + 2] });
    normals[index] = unit.x; normals[index + 1] = unit.y; normals[index + 2] = unit.z;
  }
  return normals;
};

const indexed = (positions: number[], indices: number[]): IndexedGeometry => {
  const vertices = new Float32Array(positions);
  const triangles = new Uint32Array(indices);
  return Object.freeze({ positions: vertices, normals: normalsFor(vertices, triangles), indices: triangles });
};

const quadSurface = (frame: ResolvedFrame, width: number, length: number): IndexedGeometry => {
  const points = [
    pointInFrame(frame, -length / 2, -width / 2), pointInFrame(frame, -length / 2, width / 2),
    pointInFrame(frame, length / 2, -width / 2), pointInFrame(frame, length / 2, width / 2),
  ];
  const wallHeight = 1.5;
  const wallTops = [points[0], points[1], points[2], points[3]].map((point) => add(point, scale(frame.up, wallHeight)));
  return indexed([...points, ...wallTops].flatMap((point) => [point.x, point.y, point.z]), [
    0, 2, 1, 1, 2, 3,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
  ]);
};

export const buildTrackShell = (track: TrackGeometry): IndexedGeometry & Readonly<{ thickness: number }> => {
  const positions: number[] = [];
  const indices: number[] = [];
  const rowSize = track.profileSegments + 1;
  const left = 0; const right = track.profileSegments;
  for (let sampleIndex = 0; sampleIndex < track.samples.length; sampleIndex += 1) {
    const sample = track.samples[sampleIndex];
    for (const column of [left, right]) {
      const offset = (sampleIndex * rowSize + column) * 3;
      const edge = { x: track.positions[offset], y: track.positions[offset + 1], z: track.positions[offset + 2] };
      const lower = add(edge, scale(sample.up, -0.7));
      positions.push(edge.x, edge.y, edge.z, lower.x, lower.y, lower.z);
    }
  }
  for (let sampleIndex = 0; sampleIndex < track.samples.length - 1; sampleIndex += 1) {
    for (const side of [0, 1]) {
      const current = sampleIndex * 4 + side * 2;
      const next = current + 4;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
    const current = sampleIndex * 4;
    const next = current + 4;
    indices.push(current + 1, next + 1, current + 3, current + 3, next + 1, next + 3);
  }
  return Object.freeze({ ...indexed(positions, indices), thickness: 0.7 });
};

const bowl = (frame: ResolvedFrame, radius: number, innerRadius: number, drop: number, segments = 32, innerAlongOffset = 0): IndexedGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const radial of [innerRadius, radius]) {
    const height = radial === innerRadius ? -drop : 0;
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const point = pointInFrame(frame, Math.cos(angle) * radial + (radial === innerRadius ? innerAlongOffset : 0), Math.sin(angle) * radial, height);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(index, next, segments + index, next, segments + next, segments + index);
  }
  return indexed(positions, indices);
};

const startBowl = (frame: ResolvedFrame, radius: number): IndexedGeometry => {
  const rim = bowl(frame, radius, radius * 0.12, 0.75);
  const positions = [...rim.positions];
  const indices = [...rim.indices];
  const center = pointInFrame(frame, 0, 0, -0.75);
  const centerIndex = positions.length / 3;
  positions.push(center.x, center.y, center.z);
  const innerSegments = 32;
  for (let index = 0; index < innerSegments; index += 1) indices.push(centerIndex, (index + 1) % innerSegments, index);
  return indexed(positions, indices);
};

const beam = (points: readonly Vec3[], halfWidth: number, height: number, frame: ResolvedFrame): IndexedGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const point of points) {
    for (const lateral of [-halfWidth, halfWidth]) {
      for (const vertical of [0, height]) {
        const vertex = add(point, add(scale(frame.side, lateral), scale(frame.up, vertical)));
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = index * 4; const next = current + 4;
    indices.push(current, next, current + 1, current + 1, next, next + 1);
    indices.push(current + 2, current + 3, next + 2, current + 3, next + 3, next + 2);
    indices.push(current, current + 2, next, current + 2, next + 2, next);
    indices.push(current + 1, next + 1, current + 3, current + 3, next + 1, next + 3);
  }
  indices.push(0, 1, 2, 1, 3, 2);
  const end = (points.length - 1) * 4;
  indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3);
  return indexed(positions, indices);
};

const joined = (geometries: readonly IndexedGeometry[]): IndexedGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const geometry of geometries) {
    positions.push(...geometry.positions);
    indices.push(...geometry.indices.map((index) => index + offset));
    offset += geometry.positions.length / 3;
  }
  return indexed(positions, indices);
};

const roundedCap = (center: Vec3, radius: number, frame: ResolvedFrame): IndexedGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  const latitudes = 6; const longitudes = 12;
  for (let latitude = 0; latitude <= latitudes; latitude += 1) {
    const elevation = -Math.PI / 2 + Math.PI * latitude / latitudes;
    const ring = Math.cos(elevation) * radius;
    for (let longitude = 0; longitude <= longitudes; longitude += 1) {
      const angle = longitude / longitudes * Math.PI * 2;
      const point = add(center, add(scale(frame.tangent, Math.sin(angle) * ring), add(scale(frame.side, Math.cos(angle) * ring), scale(frame.up, Math.sin(elevation) * radius))));
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let latitude = 0; latitude < latitudes; latitude += 1) {
    for (let longitude = 0; longitude < longitudes; longitude += 1) {
      const current = latitude * (longitudes + 1) + longitude;
      const next = current + longitudes + 1;
      indices.push(current, next, current + 1, current + 1, next, next + 1);
    }
  }
  return indexed(positions, indices);
};

const branchRails = (layout: ValidResolvedObstacleLayout): IndexedGeometry & Readonly<{ roundedEnds: boolean; mergeOpening: number }> => {
  const start = layout.branch.start;
  const merge = layout.branch.merge;
  const point = (fraction: number, lateral: number): Vec3 => pointInFrame(start,
    (merge.position.x - start.position.x) * start.tangent.x * fraction + (merge.position.y - start.position.y) * start.tangent.y * fraction + (merge.position.z - start.position.z) * start.tangent.z * fraction,
    lateral,
  );
  const rails: IndexedGeometry[] = [];
  [-4.4, -1.4, 1.4, 4.4].forEach((lateral, index) => {
    const path = [
      point(0, lateral), point(0.38, lateral + (index < 2 ? -0.8 : 0.8)), point(0.78, lateral * 0.62),
      point(1, index < 2 ? -1.35 : 1.35),
    ];
    rails.push(beam(path, 0.23, 0.82, start), roundedCap(add(path[0], scale(start.up, 0.41)), 0.23, start), roundedCap(add(path[path.length - 1], scale(start.up, 0.41)), 0.23, start));
  });
  return Object.freeze({ ...joined(rails), roundedEnds: true, mergeOpening: 2.7 });
};

const catchChannel = (frame: ResolvedFrame, outletRadius: number): IndexedGeometry & Readonly<{ overlap: number }> => {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 10; const length = 4.2;
  for (const along of [0, length]) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = Math.PI + index / segments * Math.PI;
      const point = pointInFrame(frame, along, Math.cos(angle) * outletRadius, -1.36 + Math.sin(angle) * outletRadius);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const next = index + 1; const row = segments + 1;
    indices.push(index, row + index, next, next, row + index, row + next);
  }
  return Object.freeze({ ...indexed(positions, indices), overlap: 0.32 });
};

export const buildObstacleGeometry = (track: TrackGeometry, layout: ValidResolvedObstacleLayout): ObstacleGeometryResources => {
  const outletRadius = layout.vortex.outletDiameter / 2;
  const vortexSurface = bowl(layout.vortex.frame, layout.vortex.radius, outletRadius, layout.vortex.verticalDrop, 32, 0.28);
  return Object.freeze({
    shell: buildTrackShell(track),
    startBowl: startBowl(layout.start.frame, layout.start.radius),
    pegHallSurface: quadSurface(layout.pegHall.frame, layout.pegHall.width, 10),
    pusherHallSurface: quadSurface(layout.pushers.frame, layout.pushers.hallWidth, 9),
    pegs: layout.pegs,
    branchRails: branchRails(layout),
    vortex: Object.freeze({ ...vortexSurface, outletDiameter: layout.vortex.outletDiameter, rimDrop: layout.vortex.verticalDrop, openBoundaries: ["entry", "outlet"] as const }),
    catchChannel: catchChannel(layout.vortex.frame, outletRadius),
    layout,
  });
};
