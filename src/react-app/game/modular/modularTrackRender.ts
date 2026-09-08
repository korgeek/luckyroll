import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { IndexedGeometry } from "../track/obstacleGeometry";
import type { Vec3 } from "../track/trackTypes";
import { MODULE_SIZE, type ModulePathSample } from "./modularTypes";
import type { BuiltModularTrack } from "./modularTrackBuild";
import {
  resolveModuleDevices,
  createPusherVertices,
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

// Close the empty space behind each inner rail without changing the racing surface.
const createCurveInfill = (built: BuiltModularTrack, group: THREE.Group, capMaterial: THREE.Material): void => {
  const positions: number[] = [];
  const { profileSegments, positions: surface } = built.geometry;
  const samples: readonly ModulePathSample[] = built.geometry.samples;
  for (const step of built.route.route) {
    if (built.track.cells[step.cellIndex]?.kind !== "curve") continue;
    const rows = samples.flatMap((sample, row) => sample.cellIndex === step.cellIndex || sample.ports?.some(port => port.cellIndex === step.cellIndex) ? [row] : []);
    const middle = samples[rows[Math.floor(rows.length / 2)]];
    const inner = toVector(middle.centerlineCurvature).dot(toVector(middle.side)) < 0 ? 0 : profileSegments;
    const rim = rows.map(row => new THREE.Vector3().fromArray(surface, (row * (profileSegments + 1) + inner) * 3));
    const entry = samples[rows[0]].position;
    const exit = samples[rows[rows.length - 1]].position;
    const corner = new THREE.Vector3(
      entry.x + exit.x - ((step.cellIndex % 5 + 0.5) * MODULE_SIZE),
      (rim[0].y + rim[rim.length - 1].y) / 2,
      entry.z + exit.z - ((Math.floor(step.cellIndex / 5) + 0.5) * MODULE_SIZE),
    );
    for (let index = 1; index < rim.length; index++) {
      const a = rim[index - 1]; const b = rim[index];
      const normal = b.clone().sub(a).cross(corner.clone().sub(a));
      positions.push(...a.toArray(), ...(normal.y >= 0 ? b : corner).toArray(), ...(normal.y >= 0 ? corner : b).toArray());
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, capMaterial); mesh.name = "curve-inner-infill"; mesh.userData.collider = false; group.add(mesh);
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
  const checker = new THREE.Group(); checker.name = "finish-checker-strip";
  const black = material("#101018"); const white = material("#f5f4dd", "#444433");
  for (let row = 0; row < 2; row += 1) for (let column = 0; column < 6; column += 1) {
    const square = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (row + column) % 2 ? black : white);
    square.position.copy(toVector(finish.position)).addScaledVector(toVector(finish.side), (column - 2.5) * 1).addScaledVector(toVector(finish.tangent), -(row + 0.5)).addScaledVector(toVector(finish.up), 0.05);
    square.quaternion.copy(planeQuaternion(finish)); checker.add(square);
  }
  const rails = new THREE.Group(); rails.name = "finish-neon-arch"; const neon = material("#ff3ca8", "#8d004c");
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5, 8), neon);
    post.position.copy(toVector(finish.position)).addScaledVector(toVector(finish.side), side * (finish.width / 2 + 1.2)).addScaledVector(toVector(finish.up), 2.5); post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toVector(finish.up)); rails.add(post);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(finish.width / 2 + 1.2, 0.28, 8, 20, Math.PI), neon);
  arch.position.copy(toVector(finish.position)).addScaledVector(toVector(finish.up), 5); arch.quaternion.copy(frameQuaternion(finish)); rails.add(arch);
  decoration.add(checker, rails); group.add(decoration);
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
  createCurveInfill(built, group, channel);
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
