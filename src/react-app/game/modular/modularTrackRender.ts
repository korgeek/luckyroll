import * as THREE from "three";
import { buildTrackShell, buildWalledBowl, type IndexedGeometry } from "../track/obstacleGeometry";
import type { Vec3 } from "../track/trackTypes";
import type { BuiltModularTrack } from "./modularTrackBuild";
import {
  resolveModuleDevices,
  type ModularDevicePose,
  type ModuleDevices,
} from "./moduleDevices";
export type { ModularDevicePose, ModuleDevices } from "./moduleDevices";

export type ModularRenderOptions = Readonly<{ debug?: boolean; preview?: boolean }>;
export type ModularRenderResources = Readonly<{
  group: THREE.Group;
  devices: ModuleDevices;
  dispose: () => void;
}>;

const REFS = "modularDeviceRefs";
type ModularDeviceRefs = {
  gate: THREE.Object3D;
  agitator: THREE.Object3D;
  pinwheels: THREE.Object3D[];
};

const toGeometry = (resource: IndexedGeometry): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(resource.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(resource.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(resource.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};
const toVector = (value: Vec3): THREE.Vector3 => new THREE.Vector3(value.x, value.y, value.z);
const orient = (object: THREE.Object3D, axis: Vec3): void => { object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toVector(axis).normalize()); };
const material = (color: string, emissive?: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, ...(emissive === undefined ? {} : { emissive }), roughness: 0.48, metalness: 0.3 });

const createRims = (built: BuiltModularTrack, rimMaterial: THREE.Material): THREE.InstancedMesh => {
  const geometry = new THREE.BoxGeometry(0.22, 0.18, 1);
  const rim = new THREE.InstancedMesh(geometry, rimMaterial, Math.max(0, (built.samples.length - 1) * 2));
  rim.name = "modular-neon-rims";
  const transform = new THREE.Object3D();
  let instance = 0;
  const row = built.geometry.profileSegments + 1;
  for (let index = 1; index < built.samples.length; index += 1) {
    for (const column of [0, built.geometry.profileSegments]) {
      const previousOffset = ((index - 1) * row + column) * 3;
      const currentOffset = (index * row + column) * 3;
      const previous = new THREE.Vector3(built.geometry.positions[previousOffset], built.geometry.positions[previousOffset + 1], built.geometry.positions[previousOffset + 2]);
      const current = new THREE.Vector3(built.geometry.positions[currentOffset], built.geometry.positions[currentOffset + 1], built.geometry.positions[currentOffset + 2]);
      const direction = current.clone().sub(previous);
      transform.position.copy(previous).add(current).multiplyScalar(0.5);
      transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
      transform.scale.set(1, 1, direction.length());
      transform.updateMatrix();
      rim.setMatrixAt(instance++, transform.matrix);
    }
  }
  rim.instanceMatrix.needsUpdate = true;
  return rim;
};

const createBumpers = (devices: ModuleDevices, group: THREE.Group, bumperMaterial: THREE.Material): void => {
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45 * 0.68 / 2, 0.45 * 0.68 / 2, 4, 8), bumperMaterial, devices.bumpers.length);
  shafts.name = "bumper-shafts";
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45 * 0.68 / 2, 8, 6), bumperMaterial, devices.bumpers.length * 2);
  caps.name = "bumper-caps";
  const transform = new THREE.Object3D();
  devices.bumpers.forEach((bar, index) => {
    transform.position.copy(toVector(bar.center)); orient(transform, bar.axis); transform.scale.set(1, bar.length, 1); transform.updateMatrix(); shafts.setMatrixAt(index, transform.matrix);
    for (const [capIndex, sign] of [-1, 1].entries()) {
      transform.position.copy(toVector(bar.center)).addScaledVector(toVector(bar.axis), sign * (bar.length / 2 - bar.thickness / 2));
      transform.scale.setScalar(1); transform.updateMatrix(); caps.setMatrixAt(index * 2 + capIndex, transform.matrix);
    }
  });
  shafts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  group.add(shafts, caps);
};

const createPinwheels = (devices: ModuleDevices, group: THREE.Group, pinwheelMaterial: THREE.Material, refs: ModularDeviceRefs): void => {
  const armGeometry = new THREE.BoxGeometry(2 * 0.28 * 12, 0.5 * 0.68, 0.5 * 0.68);
  devices.pinwheels.forEach((layout) => {
    const rotor = new THREE.Group(); rotor.name = `pinwheel-${layout.cellIndex}`; rotor.position.copy(toVector(layout.center)); orient(rotor, layout.axis);
    for (let arm = 0; arm < 3; arm += 1) {
      const mesh = new THREE.Mesh(armGeometry, pinwheelMaterial); mesh.position.x = layout.radius / 2; mesh.rotation.y = arm * Math.PI * 2 / 3; rotor.add(mesh);
    }
    refs.pinwheels.push(rotor); group.add(rotor);
  });
};

const createBoosters = (built: BuiltModularTrack, devices: ModuleDevices, group: THREE.Group, boosterMaterial: THREE.Material): void => {
  const chevrons = new THREE.Group(); chevrons.name = "booster-chevrons"; chevrons.userData.collider = false;
  const geometry = new THREE.ConeGeometry(0.52, 0.9, 3);
  devices.boosters.forEach((booster) => {
    const sample = built.samples.filter((candidate) => candidate.cellIndex === booster.cellIndex).reduce((best, candidate) => Math.abs(candidate.localU - 0.5) < Math.abs(best.localU - 0.5) ? candidate : best);
    for (const offset of [-1.1, 0, 1.1]) {
      const mesh = new THREE.Mesh(geometry, boosterMaterial);
      mesh.position.copy(toVector(sample.position)).addScaledVector(toVector(sample.up), 0.08).addScaledVector(toVector(sample.side), offset);
      orient(mesh, sample.up); mesh.rotateOnWorldAxis(toVector(sample.up), Math.atan2(booster.forward.z, booster.forward.x));
      chevrons.add(mesh);
    }
  });
  group.add(chevrons);
};

const createStart = (devices: ModuleDevices, group: THREE.Group, dark: THREE.Material, accent: THREE.Material, refs: ModularDeviceRefs): void => {
  const bowl = new THREE.Mesh(toGeometry(buildWalledBowl(devices.start.frame, devices.start.radius, 1.55, 0.72, 6.05, devices.start.wallHeight)), dark); bowl.name = "modular-start-bowl"; group.add(bowl);
  const agitator = new THREE.Group(); agitator.name = "modular-start-agitator";
  const armGeometry = new THREE.BoxGeometry(4.7, 0.24, 0.32);
  for (let index = 0; index < 3; index += 1) { const arm = new THREE.Mesh(armGeometry, accent); arm.position.x = 2.35; arm.rotation.y = index * Math.PI * 2 / 3; agitator.add(arm); }
  agitator.position.copy(toVector(devices.start.frame.position)); group.add(agitator);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.24, 8.2), dark); gate.name = "modular-release-gate"; gate.position.copy(toVector(devices.start.frame.position)); group.add(gate);
  refs.agitator = agitator; refs.gate = gate;
};

const disposeGroup = (group: THREE.Group): void => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Line | THREE.InstancedMesh;
    if ("geometry" in renderable && renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
    if ("material" in renderable) for (const value of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(value);
  });
  geometries.forEach((item) => item.dispose()); materials.forEach((item) => item.dispose()); group.clear();
};

export const createModularTrackRender = (built: BuiltModularTrack, _options: ModularRenderOptions = {}): ModularRenderResources => {
  const group = new THREE.Group(); group.name = "modular-track";
  const dark = material("#090b12"); const channel = material("#171b25"); const rim = material("#19d7e7", "#064b57"); const device = material("#e73da7", "#5f0a40"); const booster = material("#ffe25a", "#6d5900");
  const surface = new THREE.Mesh(toGeometry(built.geometry), channel); surface.name = "modular-channel"; surface.userData.surfaceColor = "#171b25"; group.add(surface);
  const shell = new THREE.Mesh(toGeometry(buildTrackShell(built.geometry)), dark); shell.name = "modular-channel-shell"; group.add(shell);
  group.add(createRims(built, rim));
  const refs: ModularDeviceRefs = { gate: new THREE.Object3D(), agitator: new THREE.Object3D(), pinwheels: [] };
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  createStart(devices, group, dark, device, refs); createBumpers(devices, group, device); createPinwheels(devices, group, device, refs); createBoosters(built, devices, group, booster);
  group.userData[REFS] = refs;
  let disposed = false;
  const resources: ModularRenderResources = { group, devices, dispose: () => { if (disposed) return; disposed = true; disposeGroup(group); delete group.userData[REFS]; } };
  return resources;
};

export const setModularDevicePose = (resources: ModularRenderResources, pose: ModularDevicePose): void => {
  if (resources.group.userData[REFS] === undefined) return;
  const refs = resources.group.userData[REFS] as ModularDeviceRefs;
  refs.gate.visible = !pose.gateOpen; refs.agitator.rotation.y = pose.agitatorAngle;
  refs.pinwheels.forEach((pinwheel, index) => { pinwheel.rotation.y = pose.pinwheelAngles[index] ?? pose.elapsedSeconds * (resources.devices.pinwheels[index]?.angularSpeed ?? 2); });
  resources.group.userData.pinwheelAngles = [...pose.pinwheelAngles]; resources.group.userData.elapsedSeconds = pose.elapsedSeconds;
};

export const disposeModularTrackRender = (resources: ModularRenderResources): void => resources.dispose();
