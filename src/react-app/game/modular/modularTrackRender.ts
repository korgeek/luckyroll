import * as THREE from "three";
import type { IndexedGeometry } from "../track/obstacleGeometry";
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
  pusher: THREE.Object3D;
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
const orientBasis = (object: THREE.Object3D, up: Vec3, axis: Vec3): void => {
  const x = toVector(up).normalize(); const y = toVector(axis).normalize(); const z = new THREE.Vector3().crossVectors(x, y).normalize();
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};
const frameQuaternion = (frame: { tangent: Vec3; side: Vec3; up: Vec3 }): THREE.Quaternion => {
  const basis = new THREE.Matrix4().makeBasis(toVector(frame.side), toVector(frame.up), toVector(frame.tangent).negate());
  return new THREE.Quaternion().setFromRotationMatrix(basis);
};
const planeQuaternion = (frame: { tangent: Vec3; side: Vec3; up: Vec3 }): THREE.Quaternion => {
  const basis = new THREE.Matrix4().makeBasis(toVector(frame.side), toVector(frame.tangent), toVector(frame.up));
  return new THREE.Quaternion().setFromRotationMatrix(basis);
};
const material = (color: string, emissive?: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, ...(emissive === undefined ? {} : { emissive }), roughness: 0.48, metalness: 0.3 });

const createBumpers = (devices: ModuleDevices, group: THREE.Group, bumperMaterial: THREE.Material): void => {
  if (devices.bumpers.length === 0) return;
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), bumperMaterial, devices.bumpers.length);
  shafts.name = "bumper-shafts";
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), bumperMaterial, devices.bumpers.length * 2);
  caps.name = "bumper-caps";
  const transform = new THREE.Object3D();
  devices.bumpers.forEach((bar, index) => {
    const coreLength = bar.length - bar.thickness;
    transform.position.copy(toVector(bar.center)); orientBasis(transform, bar.up, bar.axis); transform.scale.set(bar.height, coreLength, bar.thickness); transform.updateMatrix(); shafts.setMatrixAt(index, transform.matrix);
    for (const [capIndex, sign] of [-1, 1].entries()) {
      transform.position.copy(toVector(bar.center)).addScaledVector(toVector(bar.axis), sign * coreLength / 2);
      transform.scale.set(bar.height, bar.thickness, bar.thickness); transform.updateMatrix(); caps.setMatrixAt(index * 2 + capIndex, transform.matrix);
    }
  });
  shafts.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  group.add(shafts, caps);
};

const createPinwheels = (devices: ModuleDevices, group: THREE.Group, pinwheelMaterial: THREE.Material, refs: ModularDeviceRefs): void => {
  if (devices.pinwheels.length === 0) return;
  devices.pinwheels.forEach((layout) => {
    const rotor = new THREE.Group(); rotor.name = `pinwheel-${layout.cellIndex}`; rotor.position.copy(toVector(layout.center)); orient(rotor, layout.axis);
    rotor.userData.baseQuaternion = rotor.quaternion.clone();
    const armGeometry = new THREE.CapsuleGeometry(layout.armThickness / 2, layout.radius - layout.armThickness, 4, 8);
    const arms = new THREE.InstancedMesh(armGeometry, pinwheelMaterial, 3); arms.name = "pinwheel-arms";
    const transform = new THREE.Object3D();
    for (let arm = 0; arm < 3; arm += 1) {
      const angle = arm * Math.PI * 2 / 3; const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      transform.position.copy(radial).multiplyScalar(layout.radius / 2); transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial); transform.scale.setScalar(1); transform.updateMatrix(); arms.setMatrixAt(arm, transform.matrix);
    }
    arms.instanceMatrix.needsUpdate = true; rotor.add(arms);
    refs.pinwheels.push(rotor); group.add(rotor);
  });
};

const createBoosters = (devices: ModuleDevices, group: THREE.Group, boosterMaterial: THREE.Material): void => {
  if (devices.boosters.length === 0) return;
  const chevrons = new THREE.Group(); chevrons.name = "booster-chevrons"; chevrons.userData.collider = false;
  const shape = new THREE.Shape(); shape.moveTo(-0.7, -0.45); shape.lineTo(0.7, 0); shape.lineTo(-0.7, 0.45); shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  devices.boosters.forEach((booster) => {
    const midpointDistance = (booster.startDistance + booster.endDistance) / 2;
    for (const [index, offset] of [-2, 0, 2].entries()) {
      const mesh = new THREE.Mesh(geometry, boosterMaterial);
      const distance = booster.startDistance + (index + 1) * (booster.endDistance - booster.startDistance) / 4;
      mesh.position.copy(toVector(booster.center)).addScaledVector(toVector(booster.forward), distance - midpointDistance).addScaledVector(toVector(booster.up), 0.03).addScaledVector(toVector(booster.side), offset);
      mesh.quaternion.copy(planeQuaternion({ tangent: booster.forward, side: booster.side, up: booster.up }));
      chevrons.add(mesh);
    }
  });
  group.add(chevrons);
};

const createStart = (devices: ModuleDevices, group: THREE.Group, dark: THREE.Material, refs: ModularDeviceRefs): void => {
  const gate = new THREE.Mesh(new THREE.BoxGeometry(devices.start.gate.width, devices.start.gate.height, devices.start.gate.depth), dark); gate.name = "modular-release-gate"; gate.position.copy(toVector(devices.start.gate.center)); gate.quaternion.copy(frameQuaternion(devices.start.gate)); group.add(gate);
  const pusher = new THREE.Mesh(new THREE.BoxGeometry(devices.start.pusher.width, devices.start.pusher.height, devices.start.pusher.depth), dark); pusher.name = "modular-start-pusher"; pusher.position.copy(toVector(devices.start.pusher.center)); pusher.quaternion.copy(frameQuaternion(devices.start.pusher)); group.add(pusher);
  refs.gate = gate; refs.pusher = pusher;
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
  void _options;
  const group = new THREE.Group(); group.name = "modular-track";
  const dark = material("#090b12"); const channel = new THREE.MeshStandardMaterial({ color: "#3f4650", roughness: 0.34, metalness: 0.62 }); const device = material("#e73da7", "#5f0a40");
  const surface = new THREE.Mesh(toGeometry(built.geometry), channel); surface.name = "modular-channel"; surface.userData.surfaceColor = "#3f4650"; group.add(surface);
  const refs: ModularDeviceRefs = { gate: new THREE.Object3D(), pusher: new THREE.Object3D(), pinwheels: [] };
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  createStart(devices, group, dark, refs); createBumpers(devices, group, device); createPinwheels(devices, group, device, refs);
  if (devices.boosters.length > 0) createBoosters(devices, group, material("#ffe25a", "#6d5900"));
  group.userData[REFS] = refs;
  let disposed = false;
  const resources: ModularRenderResources = { group, devices, dispose: () => { if (disposed) return; disposed = true; disposeGroup(group); delete group.userData[REFS]; } };
  return resources;
};

export const setModularDevicePose = (resources: ModularRenderResources, pose: ModularDevicePose): void => {
  if (resources.group.userData[REFS] === undefined) return;
  const refs = resources.group.userData[REFS] as ModularDeviceRefs;
  refs.gate.visible = !pose.gateOpen; refs.pusher.position.copy(toVector(pose.pusherCenter));
  refs.pinwheels.forEach((pinwheel, index) => {
    const angle = pose.pinwheelAngles[index] ?? pose.elapsedSeconds * (resources.devices.pinwheels[index]?.angularSpeed ?? 0);
    pinwheel.quaternion.copy(pinwheel.userData.baseQuaternion as THREE.Quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle));
  });
  resources.group.userData.pinwheelAngles = [...pose.pinwheelAngles]; resources.group.userData.elapsedSeconds = pose.elapsedSeconds;
};

export const disposeModularTrackRender = (resources: ModularRenderResources): void => resources.dispose();
