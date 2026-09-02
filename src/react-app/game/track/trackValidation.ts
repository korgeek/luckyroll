import type {
  TrackGeometry,
  TrackSample,
  TrackSpec,
  TrackValidationFailure,
  Vec3,
} from "./trackTypes";

const CHECKPOINT_SEQUENCE = ["A", ...Array.from({ length: 12 }, (_, index) => `${index + 1}`)];
const MIN_DESCENT = 0.0001;
const MAX_HEADING_DELTA = 0.16;
const MIN_TRIANGLE_AREA = 0.000001;
const MIN_CLEARANCE = 5;
const MIN_RAIL_HEIGHT = 2.5 * 0.68;
const MIN_DIVIDER_HEIGHT = 4 * 0.34;
// The canonical divider rests within 0.079486 of the low-poly shoulder facets; 0.100 preserves that contact.
const MAX_DIVIDER_SURFACE_PENETRATION = 0.1;
const MAX_DIVIDER_LONGITUDINAL_OFFSET = 2;
const MAX_DIVIDER_SPLITTER_DISTANCE = 12;
// The canonical right-edge taper's maximum adjacent local rail-height step is 0.70825.
// 1.00 leaves a 0.29175-unit safety margin while rejecting a discontinuous raised vertex.
const MAX_RAIL_HEIGHT_STEP = 1;
const CROSSING_CANDIDATE_WIDTHS = 3;

const distance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const horizontalDistance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left.x - right.x, left.z - right.z);

const subtract = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const dot = (left: Vec3, right: Vec3): number => left.x * right.x + left.y * right.y + left.z * right.z;

const cross = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const scale = (vector: Vec3, amount: number): Vec3 => ({ x: vector.x * amount, y: vector.y * amount, z: vector.z * amount });

const vectorLength = (vector: Vec3): number => Math.hypot(vector.x, vector.y, vector.z);

const normalize = (vector: Vec3): Vec3 => scale(vector, 1 / vectorLength(vector));

const pointToTriangleDistance = (point: Vec3, first: Vec3, second: Vec3, third: Vec3): number => {
  const ab = subtract(second, first);
  const ac = subtract(third, first);
  const ap = subtract(point, first);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return distance(point, first);

  const bp = subtract(point, second);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return distance(point, second);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return distance(point, {
    x: first.x + ab.x * d1 / (d1 - d3),
    y: first.y + ab.y * d1 / (d1 - d3),
    z: first.z + ab.z * d1 / (d1 - d3),
  });

  const cp = subtract(point, third);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return distance(point, third);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return distance(point, {
    x: first.x + ac.x * d2 / (d2 - d6),
    y: first.y + ac.y * d2 / (d2 - d6),
    z: first.z + ac.z * d2 / (d2 - d6),
  });

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc = subtract(third, second);
    const weight = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return distance(point, { x: second.x + bc.x * weight, y: second.y + bc.y * weight, z: second.z + bc.z * weight });
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return distance(point, {
    x: first.x + ab.x * v + ac.x * w,
    y: first.y + ab.y * v + ac.y * w,
    z: first.z + ab.z * v + ac.z * w,
  });
};

const triangleArea = (first: Vec3, second: Vec3, third: Vec3): number => {
  const secondOffset = {
    x: second.x - first.x,
    y: second.y - first.y,
    z: second.z - first.z,
  };
  const thirdOffset = {
    x: third.x - first.x,
    y: third.y - first.y,
    z: third.z - first.z,
  };
  const cross = {
    x: secondOffset.y * thirdOffset.z - secondOffset.z * thirdOffset.y,
    y: secondOffset.z * thirdOffset.x - secondOffset.x * thirdOffset.z,
    z: secondOffset.x * thirdOffset.y - secondOffset.y * thirdOffset.x,
  };

  return Math.hypot(cross.x, cross.y, cross.z) / 2;
};

const headingDelta = (previous: Vec3, next: Vec3): number => {
  const raw = Math.atan2(next.z, next.x) - Math.atan2(previous.z, previous.x);
  return Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw)));
};

const positionAt = (geometry: TrackGeometry, vertex: number): Vec3 | undefined => {
  const offset = vertex * 3;
  if (offset + 2 >= geometry.positions.length) {
    return undefined;
  }

  return {
    x: geometry.positions[offset],
    y: geometry.positions[offset + 1],
    z: geometry.positions[offset + 2],
  };
};

const sampleIndexForVertex = (geometry: TrackGeometry, vertex: number): number =>
  Math.floor(vertex / (geometry.profileSegments + 1));

const failure = (
  code: TrackValidationFailure["code"],
  message: string,
  sampleIndex?: number,
  vertexIndex?: number,
): TrackValidationFailure => ({
  code,
  message,
  ...(sampleIndex === undefined ? {} : { sampleIndex }),
  ...(vertexIndex === undefined ? {} : { vertexIndex }),
});

const isFiniteVector = (vector: Vec3): boolean =>
  Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);

const validateFiniteData = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
  geometry: TrackGeometry,
): readonly TrackValidationFailure[] => {
  if (
    !Number.isFinite(spec.sampleSpacing) ||
    !Number.isFinite(spec.profileSegments) ||
    spec.nodes.some(
      (node) =>
        !isFiniteVector(node.position) ||
        !Number.isFinite(node.width) ||
        !Number.isFinite(node.channelDepth) ||
        !Number.isFinite(node.bankRadians) ||
        (node.level !== undefined && !Number.isFinite(node.level)),
    )
  ) {
    return [failure("non-finite", "Track specification contains a non-finite numeric value.")];
  }

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (
      !Number.isFinite(sample.index) ||
      !Number.isFinite(sample.distance) ||
      !isFiniteVector(sample.position) ||
      !isFiniteVector(sample.tangent) ||
      !isFiniteVector(sample.side) ||
      !isFiniteVector(sample.up) ||
      !Number.isFinite(sample.width) ||
      !Number.isFinite(sample.channelDepth) ||
      !Number.isFinite(sample.bankRadians)
    ) {
      return [failure("non-finite", "Track sample contains a non-finite numeric value.", index)];
    }
  }

  if (
    !Number.isFinite(geometry.profileSegments) ||
    !Number.isFinite(geometry.triangleCount) ||
    Array.from(geometry.positions).some((value) => !Number.isFinite(value)) ||
    Array.from(geometry.normals).some((value) => !Number.isFinite(value))
  ) {
    return [failure("non-finite", "Track geometry contains a non-finite numeric value.")];
  }

  for (let index = 0; index < geometry.samples.length; index += 1) {
    const sample = geometry.samples[index];
    if (
      !Number.isFinite(sample.index) ||
      !Number.isFinite(sample.distance) ||
      !isFiniteVector(sample.position) ||
      !isFiniteVector(sample.tangent) ||
      !isFiniteVector(sample.side) ||
      !isFiniteVector(sample.up) ||
      !Number.isFinite(sample.width) ||
      !Number.isFinite(sample.channelDepth) ||
      !Number.isFinite(sample.bankRadians)
    ) {
      return [failure("non-finite", "Geometry sample frame contains a non-finite numeric value.", index)];
    }
  }

  return [];
};

const validateLevelDomains = (spec: TrackSpec): readonly TrackValidationFailure[] => {
  const invalidNodeIndex = spec.nodes.findIndex(
    (node) =>
      node.level !== undefined &&
      (!Number.isInteger(node.level) || node.level < 1 || node.level > 3),
  );

  return invalidNodeIndex === -1
    ? []
    : [failure("invalid-level", "Defined track levels must be integer tiers 1, 2, or 3.")];
};

const validateGeometryStructure = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
  geometry: TrackGeometry,
): readonly TrackValidationFailure[] => {
  const rowSize = spec.profileSegments + 1;
  const expectedVertices = samples.length * rowSize;
  const expectedIndices = Math.max(0, samples.length - 1) * spec.profileSegments * 6;
  const vertexCount = geometry.positions.length / 3;
  const valid =
    Number.isInteger(spec.profileSegments) &&
    spec.profileSegments > 0 &&
    geometry.profileSegments === spec.profileSegments &&
    geometry.samples.length === samples.length &&
    geometry.positions.length === expectedVertices * 3 &&
    geometry.positions.length % 3 === 0 &&
    geometry.normals.length === geometry.positions.length &&
    geometry.indices.length === expectedIndices &&
    geometry.indices.length > 0 &&
    geometry.triangleCount === geometry.indices.length / 3 &&
    Array.from(geometry.indices).every((index) => index < vertexCount);

  return valid
    ? []
    : [failure("geometry-structure", "Geometry buffers do not match the expected connected U-channel structure.")];
};

const validateCheckpointOrder = (spec: TrackSpec): readonly TrackValidationFailure[] => {
  const checkpoints = spec.nodes.flatMap((node) =>
    node.checkpoint === undefined ? [] : [node.checkpoint],
  );
  const matches =
    checkpoints.length === CHECKPOINT_SEQUENCE.length &&
    checkpoints.every((checkpoint, index) => checkpoint === CHECKPOINT_SEQUENCE[index]);

  return matches
    ? []
    : [failure("checkpoint-order", `Expected checkpoints ${CHECKPOINT_SEQUENCE.join(", ")}.`, 0)];
};

const validateSamples = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
): readonly TrackValidationFailure[] => {
  const failures: TrackValidationFailure[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const sampleDistance = distance(previous.position, current.position);

    if (sampleDistance <= 0 || sampleDistance > spec.sampleSpacing * 1.1) {
      failures.push(
        failure(
          "sample-gap",
          `Sample spacing is ${sampleDistance.toFixed(3)}; expected a positive distance at most ${(spec.sampleSpacing * 1.1).toFixed(3)}.`,
          index,
        ),
      );
    }

    if (current.position.y > previous.position.y - MIN_DESCENT) {
      failures.push(failure("uphill", "Each sample must descend by at least 0.0001 world units.", index));
    }

    if (headingDelta(previous.tangent, current.tangent) >= MAX_HEADING_DELTA) {
      failures.push(failure("tight-turn", "Adjacent horizontal headings must differ by less than 0.16 radians.", index));
    }
  }

  return failures;
};

const validateGeometry = (geometry: TrackGeometry): readonly TrackValidationFailure[] => {
  const failures: TrackValidationFailure[] = [];
  const edgeDirections = new Map<string, Array<readonly [number, number]>>();
  const referenced = new Set<number>();
  const adjacency = new Map<number, Set<number>>();

  const connect = (first: number, second: number): void => {
    const firstNeighbors = adjacency.get(first) ?? new Set<number>();
    firstNeighbors.add(second);
    adjacency.set(first, firstNeighbors);

    const secondNeighbors = adjacency.get(second) ?? new Set<number>();
    secondNeighbors.add(first);
    adjacency.set(second, secondNeighbors);
  };

  const addEdge = (first: number, second: number): void => {
    const key = first < second ? `${first}:${second}` : `${second}:${first}`;
    const directions = edgeDirections.get(key) ?? [];
    directions.push([first, second]);
    edgeDirections.set(key, directions);
  };

  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const vertices = [
      geometry.indices[offset],
      geometry.indices[offset + 1],
      geometry.indices[offset + 2],
    ] as const;
    const positions = vertices.map((vertex) => positionAt(geometry, vertex));

    if (positions.some((position) => position === undefined)) {
      failures.push(failure("degenerate-triangle", "Triangle references a vertex outside the position buffer."));
      continue;
    }

    const [first, second, third] = positions as [Vec3, Vec3, Vec3];
    if (triangleArea(first, second, third) <= MIN_TRIANGLE_AREA) {
      failures.push(
        failure(
          "degenerate-triangle",
          "Triangle area must be greater than 0.000001.",
          sampleIndexForVertex(geometry, vertices[0]),
        ),
      );
    }

    for (const vertex of vertices) {
      referenced.add(vertex);
    }
    connect(vertices[0], vertices[1]);
    connect(vertices[1], vertices[2]);
    connect(vertices[2], vertices[0]);
    addEdge(vertices[0], vertices[1]);
    addEdge(vertices[1], vertices[2]);
    addEdge(vertices[2], vertices[0]);
  }

  for (const directions of edgeDirections.values()) {
    if (directions.length !== 2) {
      continue;
    }
    const [first, second] = directions;
    if (first[0] !== second[1] || first[1] !== second[0]) {
      failures.push(failure("winding", "Adjacent strip triangles must traverse their shared edge in opposite directions."));
      break;
    }
  }

  const firstVertex = referenced.values().next().value as number | undefined;
  if (firstVertex !== undefined) {
    const visited = new Set<number>([firstVertex]);
    const pending = [firstVertex];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }

    if (visited.size !== referenced.size) {
      failures.push(failure("disconnected", "Index adjacency does not reach every referenced vertex."));
    }
  }

  const rowSize = geometry.profileSegments + 1;
  for (let sampleIndex = 0; sampleIndex < geometry.samples.length; sampleIndex += 1) {
    const center = positionAt(geometry, sampleIndex * rowSize + Math.floor(rowSize / 2));
    const leftEdge = positionAt(geometry, sampleIndex * rowSize);
    const rightEdge = positionAt(geometry, sampleIndex * rowSize + rowSize - 1);
    if (
      center === undefined ||
      leftEdge === undefined ||
      rightEdge === undefined ||
      leftEdge.y - center.y < MIN_RAIL_HEIGHT ||
      rightEdge.y - center.y < MIN_RAIL_HEIGHT
    ) {
      failures.push(
        failure(
          "rail-gap",
          `Both channel edges must remain at least ${MIN_RAIL_HEIGHT.toFixed(2)} world units above the profile center.`,
          sampleIndex,
        ),
      );
      break;
    }
  }

  return failures;
};

const validateFeatureGeometry = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
  geometry: TrackGeometry,
): readonly TrackValidationFailure[] => {
  const { featurePositions, featureNormals, featureIndices } = geometry;
  const anyFeatureBuffer = featurePositions.length > 0 || featureNormals.length > 0 || featureIndices.length > 0;
  const splitterSampleIndices = samples.flatMap((sample, index) => sample.zone === "splitter" ? [index] : []);
  const expectsFeature = splitterSampleIndices.length > 0 || spec.nodes.some((node) => node.zone === "splitter");
  const invalid = (
    message: string,
    sampleIndex?: number,
    vertexIndex?: number,
  ): readonly TrackValidationFailure[] => [failure("feature-geometry", message, sampleIndex, vertexIndex)];
  if (!anyFeatureBuffer) {
    return expectsFeature
      ? invalid("Splitter samples expect non-empty divider position, normal, and index buffers.", splitterSampleIndices[0])
      : [];
  }
  const vertexCount = featurePositions.length / 3;
  if (
    featurePositions.length === 0 ||
    featurePositions.length % 3 !== 0 ||
    featureNormals.length !== featurePositions.length ||
    featureIndices.length === 0 ||
    featureIndices.length % 3 !== 0 ||
    Array.from(featurePositions).some((value) => !Number.isFinite(value)) ||
    Array.from(featureNormals).some((value) => !Number.isFinite(value)) ||
    Array.from(featureIndices).some((index) => index >= vertexCount)
  ) {
    return invalid("Divider buffers must be finite, exact-sized, non-empty triangles with in-range indices.");
  }
  if (geometry.triangleCount + featureIndices.length / 3 >= 150_000) {
    return invalid("Outer channel and divider triangles must remain below the mobile triangle budget.");
  }

  const edgeDirections = new Map<string, Array<readonly [number, number]>>();
  const adjacency = new Map<number, Set<number>>();
  const referenced = new Set<number>();
  const connect = (first: number, second: number): void => {
    (adjacency.get(first) ?? new Set<number>()).add(second);
    (adjacency.get(second) ?? new Set<number>()).add(first);
    if (!adjacency.has(first)) adjacency.set(first, new Set([second]));
    if (!adjacency.has(second)) adjacency.set(second, new Set([first]));
  };
  const addEdge = (first: number, second: number): void => {
    const key = first < second ? `${first}:${second}` : `${second}:${first}`;
    const directions = edgeDirections.get(key) ?? [];
    directions.push([first, second]);
    edgeDirections.set(key, directions);
  };
  const position = (vertex: number): Vec3 => {
    const offset = vertex * 3;
    return { x: featurePositions[offset], y: featurePositions[offset + 1], z: featurePositions[offset + 2] };
  };
  const normal = (vertex: number): Vec3 => {
    const offset = vertex * 3;
    return { x: featureNormals[offset], y: featureNormals[offset + 1], z: featureNormals[offset + 2] };
  };
  const faceNormalTotals = Array.from({ length: vertexCount }, () => ({ x: 0, y: 0, z: 0 }));

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const length = vectorLength(normal(vertex));
    if (length < 0.95 || length > 1.05) {
      return invalid("Divider normals must be non-zero unit vectors.", undefined, vertex);
    }
  }

  for (let offset = 0; offset < featureIndices.length; offset += 3) {
    const first = featureIndices[offset];
    const second = featureIndices[offset + 1];
    const third = featureIndices[offset + 2];
    if (triangleArea(position(first), position(second), position(third)) <= MIN_TRIANGLE_AREA) {
      return invalid("Divider triangles must be non-degenerate.");
    }
    const faceNormal = normalize(cross(subtract(position(second), position(first)), subtract(position(third), position(first))));
    for (const vertex of [first, second, third]) {
      faceNormalTotals[vertex].x += faceNormal.x;
      faceNormalTotals[vertex].y += faceNormal.y;
      faceNormalTotals[vertex].z += faceNormal.z;
    }
    referenced.add(first); referenced.add(second); referenced.add(third);
    connect(first, second); connect(second, third); connect(third, first);
    addEdge(first, second); addEdge(second, third); addEdge(third, first);
  }

  for (const directions of edgeDirections.values()) {
    if (directions.length !== 2 || directions[0][0] !== directions[1][1] || directions[0][1] !== directions[1][0]) {
      return invalid("Divider must be one closed component with consistently wound triangles.");
    }
  }
  const firstVertex = referenced.values().next().value as number | undefined;
  if (firstVertex === undefined) return invalid("Divider requires referenced closed geometry.");
  const visited = new Set<number>([firstVertex]);
  const pending = [firstVertex];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  if (visited.size !== referenced.size) return invalid("Divider indices must form one connected obstacle component.");
  if (referenced.size !== vertexCount) {
    const vertex = Array.from({ length: vertexCount }, (_, index) => index).find((index) => !referenced.has(index));
    return invalid("Every divider position and normal vertex must be referenced by divider indices.", undefined, vertex);
  }
  for (const vertex of referenced) {
    const expected = normalize(faceNormalTotals[vertex]);
    if (dot(normal(vertex), expected) < 0.5) {
      return invalid("Divider normals must align with their referenced face normals.", undefined, vertex);
    }
  }

  const rowSize = geometry.profileSegments + 1;
  const semanticPrerequisites =
    samples.length >= 2 &&
    splitterSampleIndices.length >= 2 &&
    geometry.samples.length === samples.length &&
    geometry.positions.length === samples.length * rowSize * 3;
  if (!semanticPrerequisites) {
    return invalid("Divider semantic validation requires matching outer profile rows and at least two splitter samples.");
  }

  for (const sampleIndex of splitterSampleIndices) {
    if (samples[sampleIndex].width < 16) {
      return invalid("Every splitter-zone sample must remain at least 16 world units wide.", sampleIndex);
    }
  }

  const outerVertex = (sampleIndex: number, column: number): Vec3 => {
    const offset = (sampleIndex * rowSize + column) * 3;
    return { x: geometry.positions[offset], y: geometry.positions[offset + 1], z: geometry.positions[offset + 2] };
  };
  const splitterStrips = splitterSampleIndices.slice(0, -1)
    .filter((sampleIndex) => samples[sampleIndex + 1]?.zone === "splitter");
  const splitterProjection = (position: Vec3): Readonly<{
    strip: number;
    fraction: number;
    point: Vec3;
    tangent: Vec3;
    side: Vec3;
    up: Vec3;
    distance: number;
  }> => splitterStrips.reduce((nearest, strip) => {
    const first = samples[strip].position;
    const second = samples[strip + 1].position;
    const span = subtract(second, first);
    const spanLengthSquared = dot(span, span);
    const fraction = spanLengthSquared === 0 ? 0 : Math.max(0, Math.min(1, dot(subtract(position, first), span) / spanLengthSquared));
    const point = { x: first.x + span.x * fraction, y: first.y + span.y * fraction, z: first.z + span.z * fraction };
    const candidateDistance = distance(position, point);
    if (candidateDistance >= nearest.distance) return nearest;
    const interpolateFrame = (field: "tangent" | "side" | "up"): Vec3 => normalize({
      x: samples[strip][field].x + (samples[strip + 1][field].x - samples[strip][field].x) * fraction,
      y: samples[strip][field].y + (samples[strip + 1][field].y - samples[strip][field].y) * fraction,
      z: samples[strip][field].z + (samples[strip + 1][field].z - samples[strip][field].z) * fraction,
    });
    return {
      strip,
      fraction,
      point,
      tangent: interpolateFrame("tangent"),
      side: interpolateFrame("side"),
      up: interpolateFrame("up"),
      distance: candidateDistance,
    };
  }, {
    strip: splitterStrips[0],
    fraction: 0,
    point: samples[splitterStrips[0]].position,
    tangent: samples[splitterStrips[0]].tangent,
    side: samples[splitterStrips[0]].side,
    up: samples[splitterStrips[0]].up,
    distance: Number.POSITIVE_INFINITY,
  });
  const profileCoordinatesForLateral = (
    projection: ReturnType<typeof splitterProjection>,
    lateral: number,
  ): Readonly<{ column: number; fraction: number }> => {
    for (let column = 0; column < geometry.profileSegments; column += 1) {
      const firstVertex = outerVertex(projection.strip, column);
      const secondVertex = outerVertex(projection.strip + 1, column);
      const first = dot(subtract({
        x: firstVertex.x + (secondVertex.x - firstVertex.x) * projection.fraction,
        y: firstVertex.y + (secondVertex.y - firstVertex.y) * projection.fraction,
        z: firstVertex.z + (secondVertex.z - firstVertex.z) * projection.fraction,
      }, projection.point), projection.side);
      const firstNextVertex = outerVertex(projection.strip, column + 1);
      const secondNextVertex = outerVertex(projection.strip + 1, column + 1);
      const second = dot(subtract({
        x: firstNextVertex.x + (secondNextVertex.x - firstNextVertex.x) * projection.fraction,
        y: firstNextVertex.y + (secondNextVertex.y - firstNextVertex.y) * projection.fraction,
        z: firstNextVertex.z + (secondNextVertex.z - firstNextVertex.z) * projection.fraction,
      }, projection.point), projection.side);
      if (lateral >= Math.min(first, second) && lateral <= Math.max(first, second)) {
        return { column, fraction: (lateral - first) / (second - first) };
      }
    }
    const column = Math.max(0, Math.min(geometry.profileSegments - 1, Math.round(
      (lateral / samples[projection.strip].width + 0.5) * geometry.profileSegments,
    )));
    return { column, fraction: 0 };
  };
  const facetedSurfaceOffset = (
    divider: Vec3,
    projection: ReturnType<typeof splitterProjection>,
    lateral: number,
  ): number | undefined => {
    const { column, fraction } = profileCoordinatesForLateral(projection, lateral);
    const current = outerVertex(projection.strip, column);
    const currentNext = outerVertex(projection.strip, column + 1);
    const next = outerVertex(projection.strip + 1, column);
    const nextNext = outerVertex(projection.strip + 1, column + 1);
    const longitudinal = projection.fraction;
    const surface = longitudinal + fraction <= 1
      ? {
        x: current.x * (1 - longitudinal - fraction) + currentNext.x * fraction + next.x * longitudinal,
        y: current.y * (1 - longitudinal - fraction) + currentNext.y * fraction + next.y * longitudinal,
        z: current.z * (1 - longitudinal - fraction) + currentNext.z * fraction + next.z * longitudinal,
      }
      : {
        x: nextNext.x * (longitudinal + fraction - 1) + currentNext.x * (1 - longitudinal) + next.x * (1 - fraction),
        y: nextNext.y * (longitudinal + fraction - 1) + currentNext.y * (1 - longitudinal) + next.y * (1 - fraction),
        z: nextNext.z * (longitudinal + fraction - 1) + currentNext.z * (1 - longitudinal) + next.z * (1 - fraction),
      };
    return dot(subtract(surface, divider), projection.up);
  };
  const wallTriangles = splitterStrips.map((row) => [0, geometry.profileSegments - 1]
    .flatMap((column) => {
      const current = outerVertex(row, column);
      const currentNext = outerVertex(row, column + 1);
      const next = outerVertex(row + 1, column);
      const nextNext = outerVertex(row + 1, column + 1);
      return [[current, currentNext, next], [next, currentNext, nextNext]] as const;
    })).flat();
  const featureVertices = Array.from({ length: vertexCount }, (_, vertex) => position(vertex));
  for (let vertex = 0; vertex < featureVertices.length; vertex += 1) {
    const divider = featureVertices[vertex];
    const projection = splitterProjection(divider);
    const sampleIndex = projection.strip;
    const sample = samples[sampleIndex];
    const delta = {
      x: divider.x - projection.point.x,
      y: divider.y - projection.point.y,
      z: divider.z - projection.point.z,
    };
    if (
      sample.zone !== "splitter" ||
      sample.width < 16 ||
      projection.distance > MAX_DIVIDER_SPLITTER_DISTANCE ||
      Math.abs(dot(delta, projection.tangent)) > MAX_DIVIDER_LONGITUDINAL_OFFSET
    ) {
      return invalid("Divider nose and tail must remain fully inside the full-width splitter zone.", sampleIndex);
    }
    const lateral = dot(delta, projection.side);
    if (Math.abs(lateral) > sample.width / 2) {
      return invalid("Divider must remain inside the channel between its outer rims.", sampleIndex);
    }
    const rimClearance = Math.min(...wallTriangles.map((triangle) => pointToTriangleDistance(divider, ...triangle)));
    if (rimClearance < MIN_DIVIDER_HEIGHT) {
      return invalid(`Divider rim clearance must be at least ${MIN_DIVIDER_HEIGHT.toFixed(2)} world units on the faceted outer U surface.`, sampleIndex, vertex);
    }
  }

  const verticalSpans = new Map<string, { position: Vec3; minimum: number; maximum: number; bottomVertex: number }>();
  for (let vertex = 0; vertex < featureVertices.length; vertex += 1) {
    const divider = featureVertices[vertex];
    const key = `${divider.x}:${divider.z}`;
    const span = verticalSpans.get(key) ?? {
      position: divider,
      minimum: divider.y,
      maximum: divider.y,
      bottomVertex: vertex,
    };
    if (divider.y < span.minimum) {
      span.minimum = divider.y;
      span.position = divider;
      span.bottomVertex = vertex;
    }
    span.maximum = Math.max(span.maximum, divider.y);
    verticalSpans.set(key, span);
  }
  let deepestPenetration: Readonly<{ amount: number; sampleIndex: number; vertexIndex: number }> | undefined;
  let insufficientHeight: Readonly<{ sampleIndex: number; vertexIndex: number }> | undefined;
  for (const span of verticalSpans.values()) {
    const projection = splitterProjection(span.position);
    const sampleIndex = projection.strip;
    const lateral = dot(subtract(span.position, projection.point), projection.side);
    const surfaceOffset = facetedSurfaceOffset(span.position, projection, lateral);
    if (surfaceOffset === undefined) {
      return invalid("Divider footprint must map to a local faceted U-surface triangle.", sampleIndex, span.bottomVertex);
    }
    if (surfaceOffset > MAX_DIVIDER_SURFACE_PENETRATION && (
      deepestPenetration === undefined || surfaceOffset > deepestPenetration.amount
    )) {
      deepestPenetration = { amount: surfaceOffset, sampleIndex, vertexIndex: span.bottomVertex };
    }
    if (span.maximum - span.minimum < MIN_DIVIDER_HEIGHT) {
      insufficientHeight ??= { sampleIndex, vertexIndex: span.bottomVertex };
    }
    const surfaceY = span.position.y + projection.up.y * surfaceOffset;
    if (span.maximum - surfaceY < MIN_DIVIDER_HEIGHT) {
      insufficientHeight ??= { sampleIndex, vertexIndex: span.bottomVertex };
    }
  }
  if (deepestPenetration !== undefined) {
    return invalid(
      `Divider footprint penetrates the faceted U surface by ${deepestPenetration.amount.toFixed(6)} world units; the tolerance is ${MAX_DIVIDER_SURFACE_PENETRATION.toFixed(3)}.`,
      deepestPenetration.sampleIndex,
      deepestPenetration.vertexIndex,
    );
  }
  if (insufficientHeight !== undefined) {
    return invalid(
      `Divider height above its faceted local channel surface must be at least ${MIN_DIVIDER_HEIGHT.toFixed(2)} world units.`,
      insufficientHeight.sampleIndex,
      insufficientHeight.vertexIndex,
    );
  }

  return [];
};

const validateRailSeams = (geometry: TrackGeometry): readonly TrackValidationFailure[] => {
  const rowSize = geometry.profileSegments + 1;
  const columns = [...new Set([0, 1, rowSize - 2, rowSize - 1])];
  const railHeight = (sampleIndex: number, column: number): number => {
    const center = positionAt(geometry, sampleIndex * rowSize + Math.floor(geometry.profileSegments / 2));
    const rail = positionAt(geometry, sampleIndex * rowSize + column);
    return (rail?.y ?? Number.NaN) - (center?.y ?? Number.NaN);
  };

  for (let sampleIndex = 1; sampleIndex < geometry.samples.length; sampleIndex += 1) {
    for (const column of columns) {
      if (Math.abs(railHeight(sampleIndex, column) - railHeight(sampleIndex - 1, column)) > MAX_RAIL_HEIGHT_STEP) {
        return [failure(
          "rail-seam",
          `Outer edge and shoulder rail-height steps must not exceed ${MAX_RAIL_HEIGHT_STEP.toFixed(2)} world units.`,
          sampleIndex,
        )];
      }
    }
  }
  return [];
};

const validateClearance = (samples: readonly TrackSample[]): readonly TrackValidationFailure[] => {
  for (let firstIndex = 0; firstIndex < samples.length; firstIndex += 1) {
    const first = samples[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < samples.length; secondIndex += 1) {
      const second = samples[secondIndex];
      const trackWidth = Math.max(first.width, second.width);
      if (
        Math.abs(first.distance - second.distance) <
        CROSSING_CANDIDATE_WIDTHS * trackWidth
      ) {
        continue;
      }
      if (
        horizontalDistance(first.position, second.position) <= trackWidth &&
        Math.abs(first.position.y - second.position.y) < MIN_CLEARANCE
      ) {
        return [
          failure(
            "clearance",
            "Non-neighbor samples within one track width require at least 5 world units of vertical clearance.",
            secondIndex,
          ),
        ];
      }
    }
  }

  return [];
};

const validateFinish = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
): readonly TrackValidationFailure[] => {
  const start = spec.nodes[0]?.position;
  const finishNode = spec.nodes.find((node) => node.checkpoint === "12");
  const finish = finishNode?.position;
  const lastSample = samples[samples.length - 1]?.position;
  if (
    start === undefined ||
    finish === undefined ||
    lastSample === undefined ||
    spec.nodes[spec.nodes.length - 1]?.checkpoint !== "12"
  ) {
    return [failure("finish-entry", "Track requires start, finish, and final sample positions.")];
  }

  const courseLength = samples[samples.length - 1]?.distance ?? 0;
  const finishEntryRadius = spec.sampleSpacing * 2;
  const arrivesAtFinish = distance(finish, lastSample) <= finishEntryRadius;
  const separatesFromStart =
    distance(finish, start) >= courseLength * 0.25 || Math.abs(finish.y - start.y) >= 5;
  const finalApproachStart = courseLength - finishEntryRadius;
  const intrusionIndex = samples.findIndex(
    (sample) =>
      sample.distance < finalApproachStart &&
      distance(sample.position, finish) <= finishEntryRadius,
  );

  return arrivesAtFinish && separatesFromStart && intrusionIndex === -1
    ? []
    : [
        failure(
          "finish-entry",
          "Finish must be reachable from the final approach only.",
          intrusionIndex === -1 ? samples.length - 1 : intrusionIndex,
        ),
      ];
};

export const validateTrack = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
  geometry: TrackGeometry,
): readonly TrackValidationFailure[] => {
  const finiteFailures = validateFiniteData(spec, samples, geometry);
  if (finiteFailures.length > 0) {
    return finiteFailures;
  }

  const levelFailures = validateLevelDomains(spec);
  if (levelFailures.length > 0) {
    return levelFailures;
  }

  const structureFailures = validateGeometryStructure(spec, samples, geometry);
  return [
    ...validateCheckpointOrder(spec),
    ...validateSamples(spec, samples),
    ...structureFailures,
    ...(structureFailures.length === 0 ? validateGeometry(geometry) : []),
    ...validateRailSeams(geometry),
    ...validateFeatureGeometry(spec, samples, geometry),
    ...validateClearance(samples),
    ...validateFinish(spec, samples),
  ];
};

export const assertValidTrack = (
  spec: TrackSpec,
  samples: readonly TrackSample[],
  geometry: TrackGeometry,
): void => {
  const failures = validateTrack(spec, samples, geometry);
  if (failures.length === 0) {
    return;
  }

  throw new Error(
    failures
      .map(({ code, message, sampleIndex }) =>
        `[${code}]${sampleIndex === undefined ? "" : ` sample ${sampleIndex}`}: ${message}`,
      )
      .join("\n"),
  );
};
