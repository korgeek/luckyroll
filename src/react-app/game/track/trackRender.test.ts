import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./trackBuild";
import { createTrackRenderGroup } from "./trackRender";
import { projectToTrack } from "./trackSampler";

describe("track renderer", () => {
  it("uses the exact validated buffers for one primary track mesh", () => {
    const built = buildValidatedTrack();
    const group = createTrackRenderGroup(built.geometry, { debug: false });
    const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const trackMesh = meshes.find((mesh) => mesh.name === "continuous-u-channel");

    expect(trackMesh).toBeDefined();
    expect(trackMesh!.geometry.getAttribute("position").array).toBe(built.geometry.positions);
    expect(trackMesh!.geometry.index!.array).toBe(built.geometry.indices);
  });

  it("uses one instanced support mesh instead of a mesh per support", () => {
    const group = createTrackRenderGroup(buildValidatedTrack().geometry);
    const supports = group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);

    expect(supports).toHaveLength(1);
    expect(supports[0].count).toBeGreaterThan(1);
    expect(group.children.filter((child) => child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh))).toHaveLength(1);
  });

  it("renders readable striped dark rim accents without adding another track mesh", () => {
    const group = createTrackRenderGroup(buildValidatedTrack().geometry);
    const rims = group.getObjectByName("u-channel-dark-rims") as THREE.LineSegments;

    expect(rims.geometry.getAttribute("color")).toBeDefined();
    expect(rims.geometry.getAttribute("color").count).toBeGreaterThan(2);
  });

  it("renders the rounded divider from the exact validated feature buffers", () => {
    const built = buildValidatedTrack({ features: true });
    const group = createTrackRenderGroup(built.geometry);
    const divider = group.getObjectByName("rounded-mixing-divider") as THREE.Mesh;

    expect(divider).toBeDefined();
    expect(divider.geometry.getAttribute("position").array).toBe(built.geometry.featurePositions);
    expect(divider.geometry.getAttribute("normal").array).toBe(built.geometry.featureNormals);
    expect(divider.geometry.index!.array).toBe(built.geometry.featureIndices);
  });

  it("keeps debug helpers disabled by default", () => {
    const group = createTrackRenderGroup(buildValidatedTrack().geometry);

    expect(group.getObjectByName("track-debug")).toBeUndefined();
  });

  it("adds named centerline, checkpoint, splitter, and frame helpers only when debug is enabled", () => {
    const built = buildValidatedTrack({ features: true });
    const group = createTrackRenderGroup(built.geometry, { debug: true, checkpointNodes: built.spec.nodes });

    expect(group.getObjectByName("track-debug-centerline")).toBeDefined();
    expect(group.getObjectByName("track-debug-frames")).toBeDefined();
    expect(group.getObjectByName("track-debug-checkpoint-markers")).toBeDefined();
    expect(group.getObjectByName("track-debug-checkpoint-labels")).toBeDefined();
    expect(group.getObjectByName("track-debug-splitter-clearance")).toBeDefined();
  });

  it("anchors every checkpoint helper to its canonical node's nearest sampled position instead of uniform route fractions", () => {
    const built = buildValidatedTrack({ features: true });
    const group = createTrackRenderGroup(built.geometry, { debug: true, checkpointNodes: built.spec.nodes });
    const checkpoints = built.spec.nodes.filter((node) => node.checkpoint !== undefined);

    checkpoints.forEach((node) => {
      const marker = group.getObjectByName(`track-debug-checkpoint-${node.checkpoint}`)!;
      const expected = projectToTrack(node.position, built.samples).sampleIndex;
      expect(marker.userData.sampleIndex).toBe(expected);
      expect(marker.position.y).toBeCloseTo(built.samples[expected].position.y + 1.2);
    });
  });
});
