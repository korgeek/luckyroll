import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./trackBuild";
import { createTrackRenderGroup } from "./trackRender";

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

  it("keeps debug helpers disabled by default", () => {
    const group = createTrackRenderGroup(buildValidatedTrack().geometry);

    expect(group.getObjectByName("track-debug")).toBeUndefined();
  });
});
