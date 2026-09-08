import { CatmullRomCurve3, Vector3 } from "three";
import type { TrackSample, TrackSpec, Vec3 } from "./trackTypes";

const SAMPLES_PER_NODE_INTERVAL = 64;

const subtract = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const cross = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) {
    throw new Error("Cannot normalize a zero-length vector.");
  }

  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

const rotateAroundAxis = (vector: Vec3, axis: Vec3, angle: number): Vec3 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const projection = vector.x * axis.x + vector.y * axis.y + vector.z * axis.z;
  const perpendicular = cross(axis, vector);

  return {
    x: vector.x * cosine + perpendicular.x * sine + axis.x * projection * (1 - cosine),
    y: vector.y * cosine + perpendicular.y * sine + axis.y * projection * (1 - cosine),
    z: vector.z * cosine + perpendicular.z * sine + axis.z * projection * (1 - cosine),
  };
};

const horizontalDistance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left.x - right.x, left.z - right.z);

const cumulativeDistances = (positions: readonly Vec3[]): readonly number[] => {
  const distances = [0];

  for (let index = 1; index < positions.length; index += 1) {
    distances.push(distances[index - 1] + horizontalDistance(positions[index], positions[index - 1]));
  }

  return distances;
};

const enclosingInterval = (progress: number, nodeProgress: readonly number[]): number => {
  for (let index = 0; index < nodeProgress.length - 1; index += 1) {
    if (progress <= nodeProgress[index + 1]) {
      return index;
    }
  }

  return nodeProgress.length - 2;
};

const interpolate = (start: number, end: number, amount: number): number =>
  start + (end - start) * amount;

const interpolateCurvePosition = (
  distance: number,
  curvePositions: readonly Vec3[],
  curveDistances: readonly number[],
): Vec3 => {
  const lastIndex = curvePositions.length - 1;
  if (distance === curveDistances[lastIndex]) {
    return curvePositions[lastIndex];
  }

  for (let index = 0; index < lastIndex; index += 1) {
    const startDistance = curveDistances[index];
    const endDistance = curveDistances[index + 1];
    if (distance <= endDistance) {
      const amount = (distance - startDistance) / (endDistance - startDistance);
      const start = curvePositions[index];
      const end = curvePositions[index + 1];
      return {
        x: interpolate(start.x, end.x, amount),
        y: 0,
        z: interpolate(start.z, end.z, amount),
      };
    }
  }

  return curvePositions[lastIndex];
};

export const sampleTrack = (spec: TrackSpec): readonly TrackSample[] => {
  if (spec.nodes.length < 2) {
    throw new Error("A track requires at least two nodes.");
  }
  if (!Number.isFinite(spec.sampleSpacing) || spec.sampleSpacing <= 0) {
    throw new Error("Track sample spacing must be a positive finite number.");
  }

  const nodePositions = spec.nodes.map((node) => node.position);
  const curve = new CatmullRomCurve3(
    nodePositions.map((position) => new Vector3(position.x, 0, position.z)),
    false,
    "centripetal",
  );
  const curvePositions = curve
    .getPoints((spec.nodes.length - 1) * SAMPLES_PER_NODE_INTERVAL)
    .map((position) => ({ x: position.x, y: 0, z: position.z }));
  const curveDistances = cumulativeDistances(curvePositions);
  const curveLength = curveDistances[curveDistances.length - 1];
  if (curveLength === 0) {
    throw new Error("A track requires horizontal distance between its nodes.");
  }

  const nodeDistances = cumulativeDistances(nodePositions);
  const nodeLength = nodeDistances[nodeDistances.length - 1];
  if (nodeLength === 0) {
    throw new Error("A track requires horizontal distance between its nodes.");
  }
  const nodeProgress = nodeDistances.map((distance) => distance / nodeLength);

  const sampleDistances = [0];
  for (let distance = spec.sampleSpacing; distance < curveLength; distance += spec.sampleSpacing) {
    sampleDistances.push(distance);
  }
  sampleDistances.push(curveLength);

  const positions = sampleDistances.map((distance) => {
    const progress = distance / curveLength;
    const nodeIndex = enclosingInterval(progress, nodeProgress);
    const intervalStart = nodeProgress[nodeIndex];
    const intervalEnd = nodeProgress[nodeIndex + 1];
    const amount = (progress - intervalStart) / (intervalEnd - intervalStart);
    const horizontal = interpolateCurvePosition(distance, curvePositions, curveDistances);

    return {
      x: horizontal.x,
      y: interpolate(spec.nodes[nodeIndex].position.y, spec.nodes[nodeIndex + 1].position.y, amount),
      z: horizontal.z,
    };
  });

  return Object.freeze(positions.map((position, index) => {
    const previous = positions[Math.max(0, index - 1)];
    const next = positions[Math.min(positions.length - 1, index + 1)];
    const tangent = normalize(subtract(next, previous));
    const horizontalSide = normalize({ x: -tangent.z, y: 0, z: tangent.x });
    const progress = sampleDistances[index] / curveLength;
    const nodeIndex = enclosingInterval(progress, nodeProgress);
    const intervalStart = nodeProgress[nodeIndex];
    const intervalEnd = nodeProgress[nodeIndex + 1];
    const amount = (progress - intervalStart) / (intervalEnd - intervalStart);
    const bankRadians = interpolate(spec.nodes[nodeIndex].bankRadians, spec.nodes[nodeIndex + 1].bankRadians, amount);
    const bankedSide = normalize(rotateAroundAxis(horizontalSide, tangent, bankRadians));

    return Object.freeze({
      index,
      distance: sampleDistances[index],
      position: Object.freeze(position),
      tangent: Object.freeze(tangent),
      side: Object.freeze(bankedSide),
      up: Object.freeze(normalize(cross(bankedSide, tangent))),
      width: interpolate(spec.nodes[nodeIndex].width, spec.nodes[nodeIndex + 1].width, amount),
      channelDepth: interpolate(spec.nodes[nodeIndex].channelDepth, spec.nodes[nodeIndex + 1].channelDepth, amount),
      bankRadians,
      zone: progress === 1 ? spec.nodes[spec.nodes.length - 1].zone : spec.nodes[nodeIndex].zone,
    });
  }));
};

export const projectToTrack = (
  position: Vec3,
  samples: readonly TrackSample[],
): { sampleIndex: number; progress: number; distanceSquared: number } => {
  if (samples.length === 0) {
    throw new Error("Cannot project to an empty track sample list.");
  }

  let sampleIndex = 0;
  let distanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < samples.length; index += 1) {
    const offset = subtract(position, samples[index].position);
    const candidate = offset.x ** 2 + offset.y ** 2 + offset.z ** 2;
    if (candidate < distanceSquared) {
      sampleIndex = index;
      distanceSquared = candidate;
    }
  }

  return {
    sampleIndex,
    progress: sampleIndex / (samples.length - 1),
    distanceSquared,
  };
};

// Immutable track samples: skip blocks whose bounds cannot contain a nearer sample.
// This preserves exhaustive-search distance arithmetic and first-index tie breaking.
export const createTrackProjector = (samples: readonly TrackSample[]): ((position: Vec3) => ReturnType<typeof projectToTrack>) => {
  const blocks: Array<{ start: number; end: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = [];
  for (let start = 0; start < samples.length; start += 32) {
    const end = Math.min(start + 32, samples.length);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = start; i < end; i++) {
      const p = samples[i].position;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
    }
    blocks.push({ start, end, minX, minY, minZ, maxX, maxY, maxZ });
  }
  return position => {
    if (!samples.length) throw new Error("Cannot project to an empty track sample list.");
    let sampleIndex = 0; let distanceSquared = Infinity;
    for (const block of blocks) {
      const dx = Math.max(block.minX - position.x, 0, position.x - block.maxX);
      const dy = Math.max(block.minY - position.y, 0, position.y - block.maxY);
      const dz = Math.max(block.minZ - position.z, 0, position.z - block.maxZ);
      if (dx ** 2 + dy ** 2 + dz ** 2 > distanceSquared) continue;
      for (let index = block.start; index < block.end; index++) {
        const p = samples[index].position;
        const candidate = (position.x - p.x) ** 2 + (position.y - p.y) ** 2 + (position.z - p.z) ** 2;
        if (candidate < distanceSquared) { sampleIndex = index; distanceSquared = candidate; }
      }
    }
    return { sampleIndex, progress: sampleIndex / (samples.length - 1), distanceSquared };
  };
};
