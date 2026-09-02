import { describe, expect, it } from "vitest";
import { generateTrackGeometry } from "./trackGeometry";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec } from "./trackSpec";
import type { TrackGeometry, TrackSample, TrackSpec, Vec3 } from "./trackTypes";
import { buildValidatedTrack } from "./trackBuild";
import { assertValidTrack, validateTrack } from "./trackValidation";

type TrackFixture = {
  spec: TrackSpec;
  samples: TrackSample[];
  geometry: TrackGeometry;
};

const cloneVector = (vector: Vec3): { x: number; y: number; z: number } => ({ ...vector });

const buildTrackFixture = (): TrackFixture => {
  const spec = createLuckyRollTrackSpec();
  const samples = sampleTrack(spec);
  const geometry = generateTrackGeometry(samples, spec.profileSegments);

  return {
    spec: {
      ...spec,
      nodes: spec.nodes.map((node) => ({ ...node, position: cloneVector(node.position) })),
    },
    samples: samples.map((sample) => ({
      ...sample,
      position: cloneVector(sample.position),
      tangent: cloneVector(sample.tangent),
      side: cloneVector(sample.side),
      up: cloneVector(sample.up),
    })),
    geometry: {
      ...geometry,
      positions: new Float32Array(geometry.positions),
      normals: new Float32Array(geometry.normals),
      indices: new Uint32Array(geometry.indices),
      samples: geometry.samples.map((sample) => ({
        ...sample,
        position: cloneVector(sample.position),
        tangent: cloneVector(sample.tangent),
        side: cloneVector(sample.side),
        up: cloneVector(sample.up),
      })),
    },
  };
};

const reverseCheckpoints = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const checkpoints = broken.spec.nodes
    .map((node) => node.checkpoint)
    .filter((checkpoint): checkpoint is NonNullable<typeof checkpoint> => checkpoint !== undefined)
    .reverse();
  let checkpointIndex = 0;

  broken.spec = {
    ...broken.spec,
    nodes: broken.spec.nodes.map((node) =>
      node.checkpoint === undefined ? node : { ...node, checkpoint: checkpoints[checkpointIndex++] },
    ),
  };
  void fixture;
  return broken;
};

const insertSampleGap = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const index = 20;
  broken.samples[index] = {
    ...broken.samples[index],
    position: { ...broken.samples[index].position, x: broken.samples[index].position.x + fixture.spec.sampleSpacing * 2 },
  };
  return broken;
};

const insertUphillSample = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const index = 20;
  broken.samples[index] = {
    ...broken.samples[index],
    position: { ...broken.samples[index].position, y: broken.samples[index - 1].position.y + 0.1 },
  };
  void fixture;
  return broken;
};

const insertHairpin = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const index = 20;
  const tangent = broken.samples[index].tangent;
  const angle = 0.5;
  broken.samples[index] = {
    ...broken.samples[index],
    tangent: {
      x: tangent.x * Math.cos(angle) - tangent.z * Math.sin(angle),
      y: tangent.y,
      z: tangent.x * Math.sin(angle) + tangent.z * Math.cos(angle),
    },
  };
  void fixture;
  return broken;
};

const duplicateTriangleVertex = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry.indices[1] = broken.geometry.indices[0];
  void fixture;
  return broken;
};

const flipTriangle = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const second = broken.geometry.indices[1];
  broken.geometry.indices[1] = broken.geometry.indices[2];
  broken.geometry.indices[2] = second;
  void fixture;
  return broken;
};

const detachProfileRow = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const triangleStart = Math.floor(broken.geometry.indices.length / 2 / 3) * 3;
  const detachedVertex = broken.geometry.positions.length / 3 - 3;
  const detachedVertices = new Set([detachedVertex, detachedVertex + 1, detachedVertex + 2]);

  for (let index = 0; index < broken.geometry.indices.length; index += 1) {
    if (detachedVertices.has(broken.geometry.indices[index])) {
      broken.geometry.indices[index] = 0;
    }
  }
  broken.geometry.indices[triangleStart] = detachedVertex;
  broken.geometry.indices[triangleStart + 1] = detachedVertex + 1;
  broken.geometry.indices[triangleStart + 2] = detachedVertex + 2;
  void fixture;
  return broken;
};

const overlapCrossingLevels = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const lowerIndex = 20;
  const upperIndex = broken.samples.length - 20;
  const minimumCrossingCandidateDistance =
    3 * Math.max(broken.samples[lowerIndex].width, broken.samples[upperIndex].width);
  if (
    Math.abs(broken.samples[upperIndex].distance - broken.samples[lowerIndex].distance) <
    minimumCrossingCandidateDistance
  ) {
    throw new Error("Clearance mutation requires samples that qualify as a crossing candidate.");
  }
  broken.samples[upperIndex] = {
    ...broken.samples[upperIndex],
    position: {
      x: broken.samples[lowerIndex].position.x,
      y: broken.samples[lowerIndex].position.y + 2,
      z: broken.samples[lowerIndex].position.z,
    },
  };
  void fixture;
  return broken;
};

const lowerOneChannelEdge = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const rowSize = broken.geometry.profileSegments + 1;
  const sampleIndex = 20;
  const edgeOffset = sampleIndex * rowSize * 3;
  const centerOffset = (sampleIndex * rowSize + Math.floor(rowSize / 2)) * 3;
  broken.geometry.positions[edgeOffset + 1] = broken.geometry.positions[centerOffset + 1];
  void fixture;
  return broken;
};

const moveFinishBesideStart = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const start = broken.spec.nodes[0].position;
  const finishIndex = broken.spec.nodes.length - 1;
  broken.spec = {
    ...broken.spec,
    nodes: broken.spec.nodes.map((node, index) =>
      index === finishIndex ? { ...node, position: cloneVector(start) } : node,
    ),
  };
  void fixture;
  return broken;
};

const removeIndexBuffer = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry = { ...broken.geometry, indices: new Uint32Array() };
  void fixture;
  return broken;
};

const desynchronizeNormalBuffer = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry = { ...broken.geometry, normals: new Float32Array(broken.geometry.normals.length - 3) };
  void fixture;
  return broken;
};

const referenceVertexOutsidePositionBuffer = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry.indices[0] = broken.geometry.positions.length / 3;
  void fixture;
  return broken;
};

const insertNonFiniteSample = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const index = 20;
  broken.samples[index] = {
    ...broken.samples[index],
    position: { ...broken.samples[index].position, x: Number.NaN },
  };
  void fixture;
  return broken;
};

const insertNonFiniteGeometryPosition = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry.positions[0] = Number.POSITIVE_INFINITY;
  void fixture;
  return broken;
};

const insertNonFiniteGeometrySample = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.geometry = {
    ...broken.geometry,
    samples: broken.geometry.samples.map((sample, index) =>
      index === 0 ? { ...sample, width: Number.NaN } : sample,
    ),
  };
  void fixture;
  return broken;
};

const insertNonFiniteNodeLevel = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.spec = {
    ...broken.spec,
    nodes: broken.spec.nodes.map((node, index) =>
      index === 1 ? { ...node, level: Number.NaN as unknown as 1 } : node,
    ),
  };
  void fixture;
  return broken;
};

const insertOutOfDomainNodeLevel = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  broken.spec = {
    ...broken.spec,
    nodes: broken.spec.nodes.map((node, index) =>
      index === 1 ? { ...node, level: 4 as unknown as 1 } : node,
    ),
  };
  void fixture;
  return broken;
};

const moveEarlierApproachIntoFinish = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const finish = broken.spec.nodes[broken.spec.nodes.length - 1].position;
  const index = 20;
  broken.samples[index] = { ...broken.samples[index], position: cloneVector(finish) };
  void fixture;
  return broken;
};

const appendGuideAfterFinish = (fixture: TrackFixture): TrackFixture => {
  const broken = buildTrackFixture();
  const finish = broken.spec.nodes[broken.spec.nodes.length - 1];
  broken.spec = {
    ...broken.spec,
    nodes: [
      ...broken.spec.nodes,
      {
        ...finish,
        id: "after-finish",
        checkpoint: undefined,
        position: { ...finish.position, y: finish.position.y - 0.1 },
      },
    ],
  };
  void fixture;
  return broken;
};

const qualifyingCrossingsBelow = (
  samples: readonly TrackSample[],
  minimumClearance: number,
): Array<{ firstIndex: number; secondIndex: number; clearance: number }> => {
  const crossings: Array<{ firstIndex: number; secondIndex: number; clearance: number }> = [];

  for (let firstIndex = 0; firstIndex < samples.length; firstIndex += 1) {
    const first = samples[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < samples.length; secondIndex += 1) {
      const second = samples[secondIndex];
      const trackWidth = Math.max(first.width, second.width);
      const alongTrackDistance = Math.abs(first.distance - second.distance);
      const horizontalDistance = Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z);
      const clearance = Math.abs(first.position.y - second.position.y);
      if (
        alongTrackDistance >= 3 * trackWidth &&
        horizontalDistance <= trackWidth &&
        clearance < minimumClearance
      ) {
        crossings.push({ firstIndex, secondIndex, clearance });
      }
    }
  }

  return crossings;
};

describe("static track validation", () => {
  const valid = buildTrackFixture();

  it("accepts the canonical A-to-12 U-channel", () => {
    expect(validateTrack(valid.spec, valid.samples, valid.geometry)).toEqual([]);
  });

  it("keeps every qualifying crossing at least 5.1 units apart", () => {
    expect(qualifyingCrossingsBelow(valid.samples, 5.1)).toEqual([]);
  });

  it.each([
    ["empty indices", removeIndexBuffer],
    ["inconsistent buffers", desynchronizeNormalBuffer],
    ["an out-of-range index", referenceVertexOutsidePositionBuffer],
  ])("reports geometry-structure for %s", (_description, mutate) => {
    const broken = mutate(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "geometry-structure" })]),
    );
  });

  it.each([
    ["a sample coordinate", insertNonFiniteSample],
    ["a geometry position", insertNonFiniteGeometryPosition],
    ["geometry sample metadata", insertNonFiniteGeometrySample],
    ["a defined node level", insertNonFiniteNodeLevel],
  ])("reports non-finite for %s", (_description, mutate) => {
    const broken = mutate(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "non-finite" })]),
    );
  });

  it("reports invalid-level for an out-of-domain node level", () => {
    const broken = insertOutOfDomainNodeLevel(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid-level" })]),
    );
  });

  it("rejects an earlier approach that intrudes into the finish region", () => {
    const broken = moveEarlierApproachIntoFinish(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "finish-entry", sampleIndex: 20 })]),
    );
  });

  it("requires checkpoint 12 to be the final node", () => {
    const broken = appendGuideAfterFinish(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "finish-entry" })]),
    );
  });

  it.each([
    ["checkpoint-order", reverseCheckpoints],
    ["sample-gap", insertSampleGap],
    ["uphill", insertUphillSample],
    ["tight-turn", insertHairpin],
    ["degenerate-triangle", duplicateTriangleVertex],
    ["winding", flipTriangle],
    ["disconnected", detachProfileRow],
    ["clearance", overlapCrossingLevels],
    ["rail-gap", lowerOneChannelEdge],
    ["finish-entry", moveFinishBesideStart],
  ])("reports %s with a sample location", (code, mutate) => {
    const broken = mutate(valid);
    expect(validateTrack(broken.spec, broken.samples, broken.geometry)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, message: expect.any(String) })]),
    );
  });

  it("throws every failure message when validation fails", () => {
    const broken = insertSampleGap(valid);
    expect(() => assertValidTrack(broken.spec, broken.samples, broken.geometry)).toThrow(/sample-gap/i);
  });

  it("builds one canonical set of validated track buffers", () => {
    const built = buildValidatedTrack();
    expect(validateTrack(built.spec, built.samples, built.geometry)).toEqual([]);
    expect(built.geometry.samples).toBe(built.samples);
  });

  it.each([
    ["a non-finite divider vertex", (geometry: TrackGeometry) => {
      const featurePositions = new Float32Array(geometry.featurePositions);
      featurePositions[0] = Number.NaN;
      return { ...geometry, featurePositions };
    }],
    ["a mismatched divider normal buffer", (geometry: TrackGeometry) => ({
      ...geometry,
      featureNormals: new Float32Array(geometry.featureNormals.length - 3),
    })],
    ["an empty divider index buffer", (geometry: TrackGeometry) => ({
      ...geometry,
      featureIndices: new Uint32Array(),
    })],
    ["an out-of-range divider index", (geometry: TrackGeometry) => {
      const featureIndices = new Uint32Array(geometry.featureIndices);
      featureIndices[0] = geometry.featurePositions.length / 3;
      return { ...geometry, featureIndices };
    }],
    ["a degenerate divider triangle", (geometry: TrackGeometry) => {
      const featureIndices = new Uint32Array(geometry.featureIndices);
      featureIndices[1] = featureIndices[0];
      return { ...geometry, featureIndices };
    }],
    ["an open divider edge", (geometry: TrackGeometry) => ({
      ...geometry,
      featureIndices: geometry.featureIndices.slice(0, -3),
    })],
  ])("fails closed for %s", (_description, mutate) => {
    const featured = buildValidatedTrack({ features: true });
    const broken = mutate(featured.geometry);

    expect(validateTrack(featured.spec, featured.samples, broken)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-geometry" })]),
    );
  });

});
