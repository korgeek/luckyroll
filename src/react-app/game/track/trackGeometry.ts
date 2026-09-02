import type { TrackFeatureLayout, TrackGeometry, TrackSample, Vec3 } from "./trackTypes";
import { DEFAULT_TRACK_FEATURE_LAYOUT } from "./trackSpec";

const add = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

const scale = (vector: Vec3, amount: number): Vec3 => ({
  x: vector.x * amount,
  y: vector.y * amount,
  z: vector.z * amount,
});

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
  return length === 0 ? { x: 0, y: 0, z: 0 } : scale(vector, 1 / length);
};

const calculateNormals = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array(positions.length);

  for (let index = 0; index < indices.length; index += 3) {
    const first = indices[index];
    const second = indices[index + 1];
    const third = indices[index + 2];
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    const thirdOffset = third * 3;
    const firstPosition = { x: positions[firstOffset], y: positions[firstOffset + 1], z: positions[firstOffset + 2] };
    const secondPosition = { x: positions[secondOffset], y: positions[secondOffset + 1], z: positions[secondOffset + 2] };
    const thirdPosition = { x: positions[thirdOffset], y: positions[thirdOffset + 1], z: positions[thirdOffset + 2] };
    const normal = normalize(cross(subtract(secondPosition, firstPosition), subtract(thirdPosition, firstPosition)));

    for (const vertex of [first, second, third]) {
      const offset = vertex * 3;
      normals[offset] += normal.x;
      normals[offset + 1] += normal.y;
      normals[offset + 2] += normal.z;
    }
  }

  for (let offset = 0; offset < normals.length; offset += 3) {
    const normal = normalize({ x: normals[offset], y: normals[offset + 1], z: normals[offset + 2] });
    normals[offset] = normal.x;
    normals[offset + 1] = normal.y;
    normals[offset + 2] = normal.z;
  }

  return normals;
};

const emptyFeatureGeometry = (): Readonly<{ featurePositions: Float32Array; featureNormals: Float32Array; featureIndices: Uint32Array }> => ({
  featurePositions: new Float32Array(),
  featureNormals: new Float32Array(),
  featureIndices: new Uint32Array(),
});

export const generateTrackFeatureGeometry = (
  samples: readonly TrackSample[],
  layout: TrackFeatureLayout = DEFAULT_TRACK_FEATURE_LAYOUT,
): Readonly<{ featurePositions: Float32Array; featureNormals: Float32Array; featureIndices: Uint32Array }> => {
  const splitterSamples = samples.filter((sample) => sample.zone === "splitter");
  if (splitterSamples.length < 6) return emptyFeatureGeometry();

  const coreLength = Math.max(0.5, layout.dividerLength - 2 * layout.dividerRadius);
  const halfSpanSamples = Math.max(1, Math.round(coreLength / 2 / 0.5));
  const centerIndex = Math.floor(splitterSamples.length / 2);
  const nose = splitterSamples[Math.max(1, centerIndex - halfSpanSamples)];
  const tail = splitterSamples[Math.min(splitterSamples.length - 2, centerIndex + halfSpanSamples)];
  const direction = normalize({ x: tail.position.x - nose.position.x, y: 0, z: tail.position.z - nose.position.z });
  const side = { x: -direction.z, y: 0, z: direction.x };
  const radius = layout.dividerRadius;
  const height = layout.dividerHeight;
  const arcSegments = 6;
  const outline: Array<{ x: number; y: number; z: number }> = [];
  const addArc = (center: TrackSample, start: number): void => {
    for (let index = 0; index <= arcSegments; index += 1) {
      const angle = start + Math.PI * index / arcSegments;
      const x = center.position.x + direction.x * Math.cos(angle) * radius + side.x * (layout.dividerOffset + Math.sin(angle) * radius);
      const z = center.position.z + direction.z * Math.cos(angle) * radius + side.z * (layout.dividerOffset + Math.sin(angle) * radius);
      const along = clamp((x - nose.position.x) * direction.x + (z - nose.position.z) * direction.z, 0, Math.hypot(tail.position.x - nose.position.x, tail.position.z - nose.position.z));
      const length = Math.hypot(tail.position.x - nose.position.x, tail.position.z - nose.position.z);
      outline.push({ x, y: nose.position.y + (tail.position.y - nose.position.y) * along / length + 0.04, z });
    }
  };
  addArc(nose, Math.PI / 2);
  addArc(tail, -Math.PI / 2);

  const positions = new Float32Array((outline.length * 2 + 2) * 3);
  outline.forEach((position, index) => {
    const bottomOffset = index * 3;
    const topOffset = (outline.length + index) * 3;
    positions[bottomOffset] = position.x;
    positions[bottomOffset + 1] = position.y;
    positions[bottomOffset + 2] = position.z;
    positions[topOffset] = position.x;
    positions[topOffset + 1] = position.y + height;
    positions[topOffset + 2] = position.z;
  });
  const bottomCenter = outline.length * 2;
  const topCenter = bottomCenter + 1;
  const center = outline.reduce((total, position) => add(total, position), { x: 0, y: 0, z: 0 });
  positions.set([center.x / outline.length, center.y / outline.length, center.z / outline.length], bottomCenter * 3);
  positions.set([center.x / outline.length, center.y / outline.length + height, center.z / outline.length], topCenter * 3);

  const indices: number[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    indices.push(bottomCenter, next, index);
    indices.push(topCenter, outline.length + index, outline.length + next);
    indices.push(index, next, outline.length + index);
    indices.push(next, outline.length + next, outline.length + index);
  }
  const featureIndices = new Uint32Array(indices);
  return Object.freeze({
    featurePositions: positions,
    featureNormals: calculateNormals(positions, featureIndices),
    featureIndices,
  });
};

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

const smoothstep = (value: number): number => {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const featureEdgeTapers = (
  samples: readonly TrackSample[],
  layout: TrackFeatureLayout,
): readonly number[] => {
  const active = samples
    .map((sample, index) => sample.zone === "mixing-hall" || sample.zone === "splitter" ? index : -1)
    .filter((index) => index >= 0);
  if (active.length === 0) return samples.map(() => 0);

  const transitionSamples = layout.edgeLiftTaperSamples ?? 16;
  const start = layout.edgeLiftStartSample ?? active[0];
  const end = layout.edgeLiftEndSample ?? active[active.length - 1];
  return samples.map((_, index) =>
    smoothstep((index - (start - transitionSamples)) / transitionSamples) *
    smoothstep(((end + transitionSamples) - index) / transitionSamples),
  );
};

export const generateTrackGeometry = (
  samples: readonly TrackSample[],
  profileSegments: number,
  featureLayout?: TrackFeatureLayout,
): TrackGeometry => {
  const rowSize = profileSegments + 1;
  const positions = new Float32Array(samples.length * rowSize * 3);
  const indices = new Uint32Array(Math.max(0, samples.length - 1) * profileSegments * 6);
  const edgeLift = featureLayout?.edgeLift ?? 0;
  const edgeTapers = edgeLift === 0 || featureLayout === undefined
    ? undefined
    : featureEdgeTapers(samples, featureLayout);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex];
    for (let column = 0; column <= profileSegments; column += 1) {
      const t = column / profileSegments;
      const angle = -Math.PI / 2 + Math.PI * t;
      const lateral = Math.sin(angle) * sample.width / 2;
      const edgeWeight = Math.abs(Math.sin(angle)) ** 4 *
        (featureLayout?.edgeLiftSide === "right" ? Math.max(0, Math.sin(angle)) : 1);
      const lift = sample.channelDepth * (1 - Math.cos(angle)) +
        sample.channelDepth * 2 * edgeLift * edgeWeight * (edgeTapers?.[sampleIndex] ?? 0);
      const position = add(sample.position, add(scale(sample.side, lateral), scale(sample.up, lift)));
      const offset = (sampleIndex * rowSize + column) * 3;
      positions[offset] = position.x;
      positions[offset + 1] = position.y;
      positions[offset + 2] = position.z;
    }
  }

  let indexOffset = 0;
  for (let sampleIndex = 0; sampleIndex < samples.length - 1; sampleIndex += 1) {
    for (let column = 0; column < profileSegments; column += 1) {
      const current = sampleIndex * rowSize + column;
      const next = current + rowSize;
      indices[indexOffset] = current;
      indices[indexOffset + 1] = current + 1;
      indices[indexOffset + 2] = next;
      indices[indexOffset + 3] = current + 1;
      indices[indexOffset + 4] = next + 1;
      indices[indexOffset + 5] = next;
      indexOffset += 6;
    }
  }

  const normals = calculateNormals(positions, indices);
  const features = generateTrackFeatureGeometry(samples, featureLayout);

  return Object.freeze({
    positions,
    normals,
    indices,
    ...features,
    samples,
    profileSegments,
    triangleCount: indices.length / 3,
  });
};
