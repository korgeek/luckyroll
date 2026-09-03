import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { createObstacleRenderGroup, disposeObstacleRenderGroup, setDeviceRenderPose } from "./obstacleRender";
import { resolvePusherPose } from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";

describe("neon obstacle renderer", () => {
  const track = buildValidatedTrack({ features: true });
  const resources = buildObstacleGeometry(track.geometry, track.obstacleLayout);

  it("renders every static obstacle and names dynamic meshes deterministically", () => {
    const group = createObstacleRenderGroup(resources);

    for (const name of [
      "start-bowl", "peg-shuffler", "alternating-pushers", "pusher-left-mesh", "pusher-right-mesh",
      "branch-rails", "vortex-bowl", "vortex-catch-channel",
    ]) expect(group.getObjectByName(name)).toBeDefined();
    const pegs = group.getObjectByName("peg-shuffler") as THREE.InstancedMesh;
    expect(pegs).toBeInstanceOf(THREE.InstancedMesh);
    expect(pegs.instanceColor).toBeDefined();
    expect(pegs.instanceColor!.getX(0)).not.toBeCloseTo(pegs.instanceColor!.getX(1));
  });

  it("writes the shared Task 1 pusher pose to the matching dynamic render roots", () => {
    const group = createObstacleRenderGroup(resources);
    const pose = resolvePusherPose(track.obstacleLayout.pushers, 0.25);
    setDeviceRenderPose(group, pose);

    const left = group.getObjectByName("pusher-left-mesh")!;
    const right = group.getObjectByName("pusher-right-mesh")!;
    expect(left.position.toArray()).toEqual([pose.left.center.x, pose.left.center.y, pose.left.center.z]);
    expect(right.position.toArray()).toEqual([pose.right.center.x, pose.right.center.y, pose.right.center.z]);
  });

  it("uses shared standard materials and disposes each unique geometry and material once", () => {
    const group = createObstacleRenderGroup(resources);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
      if ("material" in renderable) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, "dispose"));

    disposeObstacleRenderGroup(group);

    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(group.children).toHaveLength(0);
  });
});
