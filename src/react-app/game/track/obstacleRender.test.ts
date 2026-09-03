import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { createObstacleRenderGroup, disposeObstacleRenderGroup, setDeviceRenderPose } from "./obstacleRender";
import { resolvePusherPose } from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";

describe("neon obstacle renderer", () => {
  const track = buildValidatedTrack({ features: true }); const resources = buildObstacleGeometry(track.geometry, track.obstacleLayout);
  it("renders obstacle roots, frame-aligned lifted pegs, and emissive mesh rim accents", () => {
    const group = createObstacleRenderGroup(resources); for (const name of ["start-bowl", "start-outlet-throat", "peg-shuffler", "alternating-pushers", "pusher-left-mesh", "pusher-right-mesh", "branch-rails", "vortex-bowl", "vortex-catch-channel", "neon-rim-accents"]) expect(group.getObjectByName(name)).toBeDefined();
    const pegs = group.getObjectByName("peg-shuffler") as THREE.InstancedMesh; const matrix = new THREE.Matrix4(); pegs.getMatrixAt(0, matrix);
    const up = new THREE.Vector3(resources.layout.pegHall.frame.up.x, resources.layout.pegHall.frame.up.y, resources.layout.pegHall.frame.up.z); const lifted = new THREE.Vector3().setFromMatrixPosition(matrix).sub(new THREE.Vector3(resources.pegs[0].center.x, resources.pegs[0].center.y, resources.pegs[0].center.z));
    expect(lifted.dot(up)).toBeCloseTo(0.575, 5); expect(new THREE.Vector3(0, 1, 0).transformDirection(matrix).dot(up)).toBeCloseTo(1, 5);
    group.getObjectByName("neon-rim-accents")!.traverse((object) => { if (object instanceof THREE.Mesh) expect(object.material).toBeInstanceOf(THREE.MeshStandardMaterial); });
  });
  it("initializes and updates cached pusher meshes from the full frame-oriented pose", () => {
    const group = createObstacleRenderGroup(resources); const initial = resolvePusherPose(resources.layout.pushers, 0); const left = group.getObjectByName("pusher-left-mesh") as THREE.Mesh; const right = group.getObjectByName("pusher-right-mesh") as THREE.Mesh;
    expect(left.position.toArray()).toEqual([initial.left.center.x, initial.left.center.y, initial.left.center.z]); expect(right.position.toArray()).toEqual([initial.right.center.x, initial.right.center.y, initial.right.center.z]); expect(left.scale.y).toBeCloseTo(initial.left.depth / 1.3, 5); expect(right.scale.y).toBeCloseTo(initial.right.depth / 1.3, 5);
    const side = new THREE.Vector3(resources.layout.pushers.frame.side.x, resources.layout.pushers.frame.side.y, resources.layout.pushers.frame.side.z); expect(Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(left.quaternion).dot(side))).toBeCloseTo(1, 5);
    const search = vi.spyOn(group, "getObjectByName"); const pose = resolvePusherPose(resources.layout.pushers, 0.25); setDeviceRenderPose(group, pose); expect(search).not.toHaveBeenCalled(); expect(left.scale.y).toBeCloseTo(pose.left.depth / 1.3, 5);
  });
  it("uses shared standard materials and disposes each unique geometry and material once", () => {
    const group = createObstacleRenderGroup(resources); const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); group.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.geometry instanceof THREE.BufferGeometry) geometries.add(mesh.geometry); if ("material" in mesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material); });
    const gd = [...geometries].map((g) => vi.spyOn(g, "dispose")); const md = [...materials].map((m) => vi.spyOn(m, "dispose")); disposeObstacleRenderGroup(group); gd.forEach((d) => expect(d).toHaveBeenCalledTimes(1)); md.forEach((d) => expect(d).toHaveBeenCalledTimes(1));
  });
});
