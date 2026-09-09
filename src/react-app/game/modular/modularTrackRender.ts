import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { IndexedGeometry } from "../track/obstacleGeometry";
import type { Vec3 } from "../track/trackTypes";
import type { BuiltModularTrack } from "./modularTrackBuild";
import { profileAt } from "./moduleGeometry";
import {
  PINWHEEL_ARM_COUNT,
  resolveModuleDevices,
  createPusherVertices,
  createWaveVertices,
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
const createChannelShell = (resource: IndexedGeometry, group: THREE.Group, channel: THREE.Material): void => {
  const positions = resource.positions.map((value, index) => value - resource.normals[index] * 0.26);
  const normals = resource.normals.map(value => -value);
  const indices = resource.indices.slice();
  const boundary = new Map<string, [number, number]>();
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]];
    indices[index + 1] = c; indices[index + 2] = b;
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
      if (boundary.has(key)) boundary.delete(key); else boundary.set(key, [from, to]);
    }
  }
  const shell = new THREE.Mesh(toGeometry({ positions, normals, indices }), channel);
  shell.name = "modular-channel-shell"; shell.userData.collider = false; group.add(shell);
  const rimPositions: number[] = [];
  for (const [a, b] of boundary.values()) {
    for (const [buffer, vertex] of [[resource.positions, b], [resource.positions, a], [positions, a], [resource.positions, b], [positions, a], [positions, b]] as const) {
      rimPositions.push(buffer[vertex * 3], buffer[vertex * 3 + 1], buffer[vertex * 3 + 2]);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(rimPositions, 3)); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const rim = new THREE.Mesh(geometry, material("#7c8590")); rim.name = "modular-channel-rims"; rim.userData.collider = false; group.add(rim);
};
const orient = (object: THREE.Object3D, axis: Vec3): void => { object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toVector(axis).normalize()); };
const frameQuaternion = (frame: { tangent: Vec3; side: Vec3; up: Vec3 }): THREE.Quaternion => {
  const basis = new THREE.Matrix4().makeBasis(toVector(frame.side), toVector(frame.up), toVector(frame.tangent).negate());
  return new THREE.Quaternion().setFromRotationMatrix(basis);
};
const planeQuaternion = (frame: { tangent: Vec3; side: Vec3; up: Vec3 }): THREE.Quaternion => {
  const basis = new THREE.Matrix4().makeBasis(toVector(frame.side), toVector(frame.tangent), toVector(frame.up));
  return new THREE.Quaternion().setFromRotationMatrix(basis);
};
const material = (color: string, emissive?: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, ...(emissive === undefined ? {} : { emissive }), roughness: 0.48, metalness: 0.3 });
const chevronGeometry = (): THREE.ShapeGeometry => {
  const shape = new THREE.Shape(); shape.moveTo(-0.45, -0.7); shape.lineTo(0.45, -0.7); shape.lineTo(0, 0.7); shape.closePath();
  return new THREE.ShapeGeometry(shape);
};

const createBumpers = (devices: ModuleDevices, group: THREE.Group, bumperMaterial: THREE.Material): void => {
  if (devices.bumpers.length === 0) return;
  const cylinders = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 16), bumperMaterial, devices.bumpers.length);
  cylinders.name = "round-bumpers";
  const transform = new THREE.Object3D();
  devices.bumpers.forEach((bumper, index) => {
    transform.position.copy(toVector(bumper.center)); orient(transform, bumper.up); transform.scale.set(bumper.radius, bumper.height, bumper.radius); transform.updateMatrix(); cylinders.setMatrixAt(index, transform.matrix);
  });
  cylinders.instanceMatrix.needsUpdate = true;
  group.add(cylinders);
};

const createPinwheels = (devices: ModuleDevices, group: THREE.Group, pinwheelMaterial: THREE.Material, refs: ModularDeviceRefs): void => {
  if (devices.pinwheels.length === 0) return;
  devices.pinwheels.forEach((layout) => {
    const rotor = new THREE.Group(); rotor.name = `pinwheel-${layout.cellIndex}`; rotor.position.copy(toVector(layout.center)); orient(rotor, layout.axis);
    rotor.userData.baseQuaternion = rotor.quaternion.clone();
    const armGeometry = new THREE.CapsuleGeometry(layout.armThickness / 2, layout.radius - layout.armThickness, 4, 8);
    const arms = new THREE.InstancedMesh(armGeometry, pinwheelMaterial, PINWHEEL_ARM_COUNT); arms.name = "pinwheel-arms";
    const transform = new THREE.Object3D();
    for (let arm = 0; arm < PINWHEEL_ARM_COUNT; arm += 1) {
      const angle = arm * Math.PI * 2 / PINWHEEL_ARM_COUNT; const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      transform.position.copy(radial).multiplyScalar(layout.radius / 2); transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial); transform.scale.setScalar(1); transform.updateMatrix(); arms.setMatrixAt(arm, transform.matrix);
    }
    arms.instanceMatrix.needsUpdate = true; rotor.add(arms);
    refs.pinwheels.push(rotor); group.add(rotor);
  });
};

const createBoosters = (devices: ModuleDevices, group: THREE.Group, boosterMaterial: THREE.Material): void => {
  if (devices.boosters.length === 0) return;
  const chevrons = new THREE.Group(); chevrons.name = "booster-chevrons"; chevrons.userData.collider = false;
  const geometry = chevronGeometry();
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

const createCurveSafetyChevrons = (built: BuiltModularTrack, group: THREE.Group): void => {
  const samples = new Map<number, (typeof built.samples)[number]>();
  for (const sample of built.samples) {
    if (built.track.cells[sample.cellIndex]?.kind !== "curve" || sample.localU <= 0.4 || sample.localU >= 0.6) continue;
    const previous = samples.get(sample.cellIndex);
    if (previous === undefined || Math.abs(sample.localU - 0.5) < Math.abs(previous.localU - 0.5)) samples.set(sample.cellIndex, sample);
  }
  if (samples.size === 0) return;
  const chevrons = new THREE.Group(); chevrons.name = "curve-safety-chevrons"; chevrons.userData.collider = false;
  const geometry = chevronGeometry(); const marker = material("#ff9d28", "#6f2a00");
  samples.forEach((sample) => {
    for (const offset of [-1.6, 0, 1.6]) {
      const frame = built.samples.reduce((nearest, candidate) => Math.abs(candidate.distance - sample.distance - offset) < Math.abs(nearest.distance - sample.distance - offset) ? candidate : nearest, sample);
      const mesh = new THREE.Mesh(geometry, marker);
      mesh.position.copy(toVector(frame.position)).addScaledVector(toVector(frame.up), 0.08);
      mesh.quaternion.copy(planeQuaternion(frame)); chevrons.add(mesh);
    }
  });
  group.add(chevrons);
};

const createStart = (devices: ModuleDevices, group: THREE.Group, dark: THREE.Material, refs: ModularDeviceRefs): void => {
  const gate = new THREE.Mesh(new THREE.BoxGeometry(devices.start.gate.width, devices.start.gate.height, devices.start.gate.depth), dark); gate.name = "modular-release-gate"; gate.position.copy(toVector(devices.start.gate.center)); gate.quaternion.copy(frameQuaternion(devices.start.gate)); group.add(gate);
  const vertices = createPusherVertices(devices.start.pusher);
  const pusher = new THREE.Mesh(new ConvexGeometry(Array.from({ length: vertices.length / 3 }, (_, index) => new THREE.Vector3().fromArray(vertices, index * 3))), dark); pusher.name = "modular-start-pusher"; pusher.position.copy(toVector(devices.start.pusher.center)); pusher.quaternion.copy(frameQuaternion(devices.start.pusher)); group.add(pusher);
  refs.gate = gate; refs.pusher = pusher;
};

const createFinishDecoration = (built: BuiltModularTrack, group: THREE.Group): void => {
  const finish = built.samples[built.samples.length - 1];
  if (finish === undefined) return;
  const decoration = new THREE.Group(); decoration.name = "modular-finish-decoration"; decoration.userData.collider = false;
  const positions: number[] = []; const colors: number[] = [];
  const profile = profileAt(finish.width); const black = new THREE.Color("#101018"); const white = new THREE.Color("#f5f4dd");
  let across = 0;
  for (let column = 1; column < profile.length; column += 1) {
    const left = profile[column - 1]; const right = profile[column];
    const length = Math.hypot(right.lateral - left.lateral, right.height - left.height);
    for (let row = 0; row < 2; row += 1) {
      const color = (Math.floor(across + length / 2) + row) % 2 ? black : white;
      for (const [point, along] of [[left, -row], [right, -row], [right, -row - 1], [left, -row], [right, -row - 1], [left, -row - 1]] as const) {
        const vertex = toVector(finish.position).addScaledVector(toVector(finish.side), point.lateral).addScaledVector(toVector(finish.up), point.height).addScaledVector(toVector(finish.tangent), along);
        positions.push(vertex.x, vertex.y, vertex.z); colors.push(color.r, color.g, color.b);
      }
    }
    across += length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const checker = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  checker.name = "finish-checker-strip";
  decoration.add(checker); group.add(decoration);
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
  createChannelShell(built.geometry, group, channel);
  const refs: ModularDeviceRefs = { gate: new THREE.Object3D(), pusher: new THREE.Object3D(), pinwheels: [] };
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  createStart(devices, group, dark, refs); createBumpers(devices, group, device); createPinwheels(devices, group, device, refs);
  for (const wave of devices.waves) {
    const vertices = createWaveVertices(wave);
    const mesh = new THREE.Mesh(new ConvexGeometry(Array.from({ length: vertices.length / 3 }, (_, index) => new THREE.Vector3().fromArray(vertices, index * 3))), channel);
    mesh.name = `wave-semicircle-${wave.cellIndex}-${wave.localU}`; mesh.position.copy(toVector(wave.center)); mesh.quaternion.copy(frameQuaternion(wave)); group.add(mesh);
  }
  if (devices.boosters.length > 0) createBoosters(devices, group, material("#ffe25a", "#6d5900"));
  createCurveSafetyChevrons(built, group);
  createFinishDecoration(built, group);
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
