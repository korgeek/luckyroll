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
        !Number.isFinite(node.bankRadians),
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

  const structureFailures = validateGeometryStructure(spec, samples, geometry);
  return [
    ...validateCheckpointOrder(spec),
    ...validateSamples(spec, samples),
    ...structureFailures,
    ...(structureFailures.length === 0 ? validateGeometry(geometry) : []),
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
