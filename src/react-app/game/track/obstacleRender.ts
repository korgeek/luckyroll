import * as THREE from "three";
import type { ResolvedPusherPose, Vec3 } from "./trackTypes";
import type { IndexedGeometry, ObstacleGeometryResources } from "./obstacleGeometry";

const vector = (value: Vec3): THREE.Vector3 => new THREE.Vector3(value.x, value.y, value.z);

const meshGeometry = (resource: IndexedGeometry): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(resource.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(resource.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(resource.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

export const createObstacleRenderGroup = (resources: ObstacleGeometryResources): THREE.Group => {
  const group = new THREE.Group();
  group.name = "neon-obstacle-course";
  const dark = new THREE.MeshStandardMaterial({ color: "#090b12", roughness: 0.6, metalness: 0.55 });
  const charcoal = new THREE.MeshStandardMaterial({ color: "#171b25", roughness: 0.62, metalness: 0.35 });
  const magenta = new THREE.MeshStandardMaterial({ color: "#e73da7", emissive: "#5f0a40", roughness: 0.4, metalness: 0.3 });
  const cyan = new THREE.MeshStandardMaterial({ color: "#19d7e7", emissive: "#064b57", roughness: 0.38, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: "#ff8a32", emissive: "#6d2700", roughness: 0.38, metalness: 0.25 });

  const addStatic = (name: string, resource: IndexedGeometry, material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(meshGeometry(resource), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  addStatic("start-bowl", resources.startBowl, charcoal);
  addStatic("peg-hall-surface", resources.pegHallSurface, charcoal);
  addStatic("pusher-hall-surface", resources.pusherHallSurface, charcoal);
  addStatic("branch-rails", resources.branchRails, dark);
  addStatic("vortex-bowl", resources.vortex, charcoal);
  addStatic("vortex-catch-channel", resources.catchChannel, dark);

  const pegGeometry = new THREE.CylinderGeometry(resources.layout.pegs[0]?.radius ?? 0.42, resources.layout.pegs[0]?.radius ?? 0.42, 1.15, 12, 1, false);
  const pegs = new THREE.InstancedMesh(pegGeometry, cyan, resources.pegs.length);
  pegs.name = "peg-shuffler";
  const transform = new THREE.Object3D();
  resources.pegs.forEach((peg, index) => {
    transform.position.copy(vector(peg.center)); transform.position.y += 0.575; transform.updateMatrix(); pegs.setMatrixAt(index, transform.matrix);
    pegs.setColorAt(index, new THREE.Color(index % 2 === 0 ? "#19d7e7" : "#ff8a32"));
  });
  pegs.instanceMatrix.needsUpdate = true;
  if (pegs.instanceColor !== null) pegs.instanceColor.needsUpdate = true;
  group.add(pegs);

  const pusherRoot = new THREE.Group();
  pusherRoot.name = "alternating-pushers";
  const pusherGeometry = new THREE.CapsuleGeometry(resources.layout.pushers.radius, 1.3, 5, 10);
  for (const side of ["left", "right"] as const) {
    const pusher = new THREE.Mesh(pusherGeometry, magenta);
    pusher.name = `pusher-${side}-mesh`;
    pusherRoot.add(pusher);
  }
  group.add(pusherRoot);

  const accents = new THREE.Group();
  accents.name = "neon-rim-accents";
  const accentGeometry = new THREE.BoxGeometry(0.65, 0.14, 1.8);
  for (const [index, peg] of resources.pegs.entries()) {
    const accent = new THREE.Mesh(accentGeometry, index % 2 === 0 ? cyan : orange);
    accent.position.copy(vector(peg.center)).addScaledVector(vector(resources.layout.pegHall.frame.side), index % 2 === 0 ? 1 : -1).addScaledVector(vector(resources.layout.pegHall.frame.up), 0.12);
    accents.add(accent);
  }
  group.add(accents);
  setDeviceRenderPose(group, {
    phase: 0,
    left: { center: resources.layout.pushers.frame.position, depth: resources.layout.pushers.reach },
    right: { center: resources.layout.pushers.frame.position, depth: resources.layout.pushers.reach },
    passage: resources.layout.pushers.hallWidth - resources.layout.pushers.reach * 2,
  });
  return group;
};

export const setDeviceRenderPose = (group: THREE.Object3D, pose: ResolvedPusherPose): void => {
  const left = group.getObjectByName("pusher-left-mesh");
  const right = group.getObjectByName("pusher-right-mesh");
  if (left !== undefined) left.position.copy(vector(pose.left.center));
  if (right !== undefined) right.position.copy(vector(pose.right.center));
};

export const disposeObstacleRenderGroup = (group: THREE.Object3D): void => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Line;
    if ("geometry" in renderable && renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
    if ("material" in renderable) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
};
