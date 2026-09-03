import * as THREE from "three";
import { resolvePusherPose } from "./obstacleLayout";
import type { ObstacleGeometryResources, IndexedGeometry } from "./obstacleGeometry";
import type { DevicePose } from "./obstaclePhysics";
import type { ResolvedPusherPose, Vec3 } from "./trackTypes";

type PusherRefs = Readonly<{ root: THREE.Group; shaft: THREE.Mesh; firstCap: THREE.Mesh; secondCap: THREE.Mesh }>;
type DeviceRefs = Readonly<{ left: PusherRefs; right: PusherRefs; agitator: THREE.Group; gate: THREE.Mesh }>;
const DEVICE_REFS = "neonDeviceRefs";
const geometry = (resource: IndexedGeometry): THREE.BufferGeometry => {
  const result = new THREE.BufferGeometry(); result.setAttribute("position", new THREE.BufferAttribute(resource.positions, 3)); result.setAttribute("normal", new THREE.BufferAttribute(resource.normals, 3)); result.setIndex(new THREE.BufferAttribute(resource.indices, 1)); result.computeBoundingSphere(); return result;
};
const writePosition = (target: THREE.Object3D, source: Vec3): void => { target.position.set(source.x, source.y, source.z); };
const frameQuaternion = (axis: Vec3): THREE.Quaternion => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(axis.x, axis.y, axis.z));

export const createObstacleRenderGroup = (resources: ObstacleGeometryResources): THREE.Group => {
  const group = new THREE.Group(); group.name = "neon-obstacle-course";
  const dark = new THREE.MeshStandardMaterial({ color: "#090b12", roughness: 0.6, metalness: 0.55 }); const charcoal = new THREE.MeshStandardMaterial({ color: "#171b25", roughness: 0.62, metalness: 0.35 });
  const magenta = new THREE.MeshStandardMaterial({ color: "#e73da7", emissive: "#5f0a40", roughness: 0.4, metalness: 0.3 }); const cyan = new THREE.MeshStandardMaterial({ color: "#19d7e7", emissive: "#064b57", roughness: 0.38, metalness: 0.3 }); const orange = new THREE.MeshStandardMaterial({ color: "#ff8a32", emissive: "#6d2700", roughness: 0.38, metalness: 0.25 });
  const add = (name: string, resource: IndexedGeometry, material: THREE.Material): THREE.Mesh => { const mesh = new THREE.Mesh(geometry(resource), material); mesh.name = name; group.add(mesh); return mesh; };
  add("start-bowl", resources.startBowl, charcoal); add("start-outlet-throat", resources.startThroat, dark); add("peg-hall-surface", resources.pegHallSurface, charcoal); add("pusher-hall-surface", resources.pusherHallSurface, charcoal); add("branch-path-floor-left", resources.branchFloors[0], charcoal); add("branch-path-floor-right", resources.branchFloors[1], charcoal); add("branch-rails", resources.branchRails, dark); add("vortex-bowl", resources.vortex, charcoal); add("vortex-catch-channel", resources.catchChannel, dark);

  const pegGeometry = new THREE.CylinderGeometry(resources.pegs[0]?.radius ?? 0.42, resources.pegs[0]?.radius ?? 0.42, 1.15, 12); const pegs = new THREE.InstancedMesh(pegGeometry, cyan, resources.pegs.length); pegs.name = "peg-shuffler";
  const transform = new THREE.Object3D(); transform.quaternion.copy(frameQuaternion(resources.layout.pegHall.frame.up));
  resources.pegs.forEach((peg, index) => { writePosition(transform, peg.center); transform.position.addScaledVector(new THREE.Vector3(resources.layout.pegHall.frame.up.x, resources.layout.pegHall.frame.up.y, resources.layout.pegHall.frame.up.z), 0.575); transform.updateMatrix(); pegs.setMatrixAt(index, transform.matrix); pegs.setColorAt(index, new THREE.Color(index % 2 === 0 ? "#19d7e7" : "#ff8a32")); });
  pegs.instanceMatrix.needsUpdate = true; if (pegs.instanceColor !== null) pegs.instanceColor.needsUpdate = true; group.add(pegs);

  const pusherRoot = new THREE.Group(); pusherRoot.name = "alternating-pushers"; const shaftGeometry = new THREE.CylinderGeometry(resources.layout.pushers.radius, resources.layout.pushers.radius, 1, 10); const capGeometry = new THREE.SphereGeometry(resources.layout.pushers.radius, 10, 8); const pusherQuaternion = frameQuaternion(resources.layout.pushers.frame.side);
  const createPusher = (name: string): PusherRefs => { const root = new THREE.Group(); root.name = name; root.quaternion.copy(pusherQuaternion); const shaft = new THREE.Mesh(shaftGeometry, magenta); shaft.name = `${name}-shaft`; const firstCap = new THREE.Mesh(capGeometry, magenta); firstCap.name = `${name}-front-cap`; const secondCap = new THREE.Mesh(capGeometry, magenta); secondCap.name = `${name}-rear-cap`; root.add(shaft, firstCap, secondCap); pusherRoot.add(root); return Object.freeze({ root, shaft, firstCap, secondCap }); };
  const left = createPusher("pusher-left-mesh"); const right = createPusher("pusher-right-mesh"); group.add(pusherRoot);

  const agitator = new THREE.Group(); agitator.name = "start-agitator"; const armGeometry = new THREE.BoxGeometry(4.7, 0.24, 0.32);
  for (let arm = 0; arm < 3; arm += 1) { const angle = arm / 3 * Math.PI * 2; const mesh = new THREE.Mesh(armGeometry, magenta); mesh.position.set(Math.cos(angle) * 2.35, 0, Math.sin(angle) * 2.35); mesh.rotation.y = -angle; agitator.add(mesh); }
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.24, 8.2), dark); gate.name = "release-gate"; group.add(agitator, gate);
  group.userData[DEVICE_REFS] = Object.freeze({ left, right, agitator, gate } satisfies DeviceRefs);

  const accents = new THREE.Group(); accents.name = "neon-rim-accents"; const accentGeometry = new THREE.BoxGeometry(0.65, 0.14, 1.8);
  resources.pegs.forEach((peg, index) => { const accent = new THREE.Mesh(accentGeometry, index % 2 === 0 ? cyan : orange); writePosition(accent, peg.center); accent.position.addScaledVector(new THREE.Vector3(resources.layout.pegHall.frame.side.x, resources.layout.pegHall.frame.side.y, resources.layout.pegHall.frame.side.z), index % 2 === 0 ? 1 : -1); accent.position.addScaledVector(new THREE.Vector3(resources.layout.pegHall.frame.up.x, resources.layout.pegHall.frame.up.y, resources.layout.pegHall.frame.up.z), 0.12); accents.add(accent); }); group.add(accents);
  setDeviceRenderPose(group, resolvePusherPose(resources.layout.pushers, 0)); return group;
};

export const setDeviceRenderPose = (group: THREE.Object3D, pose: ResolvedPusherPose | DevicePose): void => {
  const refs = group.userData[DEVICE_REFS] as DeviceRefs | undefined; if (refs === undefined) return;
  const isDevicePose = (value: ResolvedPusherPose | DevicePose): value is DevicePose => "pusherTransforms" in value;
  const device: DevicePose | undefined = isDevicePose(pose) ? pose : undefined;
  const pusherPose: ResolvedPusherPose = device === undefined ? pose as ResolvedPusherPose : device.pushers;
  const writeQuaternion = (target: THREE.Object3D, rotation: DevicePose["gate"]["rotation"]): void => { target.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w); };
  const writePusher = (refsForSide: PusherRefs, side: ResolvedPusherPose["left"], transform?: DevicePose["pusherTransforms"]["left"]): void => { const shaftLength = Math.max(0, side.depth - 1.1); writePosition(refsForSide.root, transform?.translation ?? side.center); if (transform !== undefined) writeQuaternion(refsForSide.root, transform.rotation); refsForSide.shaft.scale.set(1, shaftLength, 1); refsForSide.firstCap.position.set(0, -shaftLength / 2, 0); refsForSide.secondCap.position.set(0, shaftLength / 2, 0); };
  writePusher(refs.left, pusherPose.left, device?.pusherTransforms.left); writePusher(refs.right, pusherPose.right, device?.pusherTransforms.right);
  if (device !== undefined) { writePosition(refs.agitator, device.agitator.translation); writeQuaternion(refs.agitator, device.agitator.rotation); writePosition(refs.gate, device.gate.translation); writeQuaternion(refs.gate, device.gate.rotation); }
};

export const disposeObstacleRenderGroup = (group: THREE.Object3D): void => {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); group.traverse((object) => { const renderable = object as THREE.Mesh; if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry); if ("material" in renderable) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material); }); geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); group.clear();
};
