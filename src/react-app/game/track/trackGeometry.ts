import type { TrackGeometry, TrackSample, Vec3 } from "./trackTypes";

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

export const generateTrackGeometry = (
  samples: readonly TrackSample[],
  profileSegments: number,
): TrackGeometry => {
  const rowSize = profileSegments + 1;
  const positions = new Float32Array(samples.length * rowSize * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array(Math.max(0, samples.length - 1) * profileSegments * 6);

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex];
    for (let column = 0; column <= profileSegments; column += 1) {
      const t = column / profileSegments;
      const angle = -Math.PI / 2 + Math.PI * t;
      const lateral = Math.sin(angle) * sample.width / 2;
      const lift = sample.channelDepth * (1 - Math.cos(angle));
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

  return Object.freeze({
    positions,
    normals,
    indices,
    samples,
    profileSegments,
    triangleCount: indices.length / 3,
  });
};
