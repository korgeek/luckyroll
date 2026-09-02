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
// The canonical right-edge taper's maximum adjacent local rail-height step is 0.70825.
// 1.00 leaves a 0.29175-unit safety margin while rejecting a discontinuous raised vertex.
const MAX_RAIL_HEIGHT_STEP = 1;
const CROSSING_CANDIDATE_WIDTHS = 3;

const distance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

const horizontalDistance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left.x - right.x, left.z - right.z);

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
): TrackValidationFailure => ({ code, message, ...(sampleIndex === undefined ? {} : { sampleIndex }) });

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
  const invalid = (message: string, sampleIndex?: number): readonly TrackValidationFailure[] => [failure("feature-geometry", message, sampleIndex)];
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

  for (let offset = 0; offset < featureIndices.length; offset += 3) {
    const first = featureIndices[offset];
    const second = featureIndices[offset + 1];
    const third = featureIndices[offset + 2];
    if (triangleArea(position(first), position(second), position(third)) <= MIN_TRIANGLE_AREA) {
      return invalid("Divider triangles must be non-degenerate.");
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

  for (const sampleIndex of splitterSampleIndices) {
    if (samples[sampleIndex].width < 16) {
      return invalid("Every splitter-zone sample must remain at least 16 world units wide.", sampleIndex);
    }
  }

  const rowSize = geometry.profileSegments + 1;
  const nearestSampleIndex = (position: Vec3): number =>
    samples.reduce((nearest, _sample, index) =>
      Math.min(...Array.from({ length: rowSize }, (_, column) => distance(position, outerVertex(index, column)))) <
      Math.min(...Array.from({ length: rowSize }, (_, column) => distance(position, outerVertex(nearest, column))) )
        ? index
        : nearest,
    0);
  const outerVertex = (sampleIndex: number, column: number): Vec3 => {
    const offset = (sampleIndex * rowSize + column) * 3;
    return { x: geometry.positions[offset], y: geometry.positions[offset + 1], z: geometry.positions[offset + 2] };
  };
  const featureVertices = Array.from({ length: vertexCount }, (_, vertex) => position(vertex));
  const nearestIndices = featureVertices.map(nearestSampleIndex);
  for (let vertex = 0; vertex < featureVertices.length; vertex += 1) {
    const divider = featureVertices[vertex];
    const sampleIndex = nearestIndices[vertex];
    const sample = samples[sampleIndex];
    const delta = {
      x: divider.x - sample.position.x,
      y: divider.y - sample.position.y,
      z: divider.z - sample.position.z,
    };
    if (sample.zone !== "splitter" || sample.width < 16) {
      return invalid("Divider nose and tail must remain fully inside the full-width splitter zone.", sampleIndex);
    }
    const lateral = delta.x * sample.side.x + delta.y * sample.side.y + delta.z * sample.side.z;
    if (Math.abs(lateral) > sample.width / 2) {
      return invalid("Divider must remain inside the channel between its outer rims.", sampleIndex);
    }
    const nearbyRows = [sampleIndex - 1, sampleIndex, sampleIndex + 1]
      .filter((index) => index >= 0 && index < samples.length);
    const rimClearance = Math.min(...nearbyRows.flatMap((index) => [0, rowSize - 1].map((column) =>
      distance(divider, outerVertex(index, column)),
    )));
    if (rimClearance < MIN_DIVIDER_HEIGHT) {
      return invalid(`Divider rim clearance must be at least ${MIN_DIVIDER_HEIGHT.toFixed(2)} world units.`, sampleIndex);
    }
  }

  const verticalSpans = new Map<string, { position: Vec3; minimum: number; maximum: number }>();
  for (const divider of featureVertices) {
    const key = `${divider.x}:${divider.z}`;
    const span = verticalSpans.get(key) ?? { position: divider, minimum: divider.y, maximum: divider.y };
    span.minimum = Math.min(span.minimum, divider.y);
    span.maximum = Math.max(span.maximum, divider.y);
    verticalSpans.set(key, span);
  }
  for (const span of verticalSpans.values()) {
    const sampleIndex = nearestSampleIndex(span.position);
    const floor = outerVertex(sampleIndex, Math.floor(geometry.profileSegments / 2));
    if (span.minimum < floor.y - 0.1) {
      return invalid("Divider must not intersect the channel floor.", sampleIndex);
    }
    if (
      span.maximum - span.minimum < MIN_DIVIDER_HEIGHT ||
      span.maximum - floor.y < MIN_DIVIDER_HEIGHT
    ) {
      return invalid(`Divider height above its local channel floor must be at least ${MIN_DIVIDER_HEIGHT.toFixed(2)} world units.`, sampleIndex);
    }
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
