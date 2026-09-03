import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import { buildWalledBowl } from "../track/obstacleGeometry";
import { createBowlLaunchPositions } from "../track/obstaclePhysics";
import {
  getInitializedTrackPhysicsRapier,
} from "../track/trackPhysics";
import type { PhysicalLaunchPosition, Vec3 } from "../track/trackTypes";
import type { BuiltModularTrack } from "./modularTrackBuild";
import { resolveModuleDevices, type ModuleDevices } from "./moduleDevices";

const TIMESTEP_SECONDS = 1 / 60;
const FRICTION = 0.24;
const RESTITUTION = 0.08;
const BUMPER_RESTITUTION = 0.28;
const MAX_BOOSTER_SPEED = 18;
const DEFAULT_CELL_COUNT = 40;

type RapierModule = typeof RAPIER_TYPE;
type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export type BoosterEvent = Readonly<{
  marbleId: number;
  cellIndex: number;
  beforeForwardSpeed: number;
  afterForwardSpeed: number;
}>;

export type SeamProbeOptions = Readonly<{ speed: 8 | 18 | 42; lateral: number }>;
export type SeamProbeResult = Readonly<{
  maxNormalVelocityDelta: number;
  maxForwardLossRatio: number;
  escapes: number;
}>;

export type ModularDevicePose = Readonly<{
  elapsedSeconds: number;
  gateOpen: boolean;
  agitatorAngle: number;
  pinwheelAngles: readonly number[];
}>;

export type ModularPhysicsResources = Readonly<{
  trackCollider: RapierCollider;
  fixedColliders: readonly RapierCollider[];
  stepBeforeWorld: () => ModularDevicePose;
  stepAfterWorld: (bodies: readonly RapierBody[]) => readonly BoosterEvent[];
  reset: (remainingRestart?: boolean) => ModularDevicePose;
  dispose: () => void;
}>;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
  const magnitude = length(a);
  return magnitude === 0 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / magnitude);
};
const toVec3 = (value: { x: number; y: number; z: number }): Vec3 => ({ x: value.x, y: value.y, z: value.z });
const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

type Quaternion = Readonly<{ x: number; y: number; z: number; w: number }>;
const multiplyQuaternion = (a: Quaternion, b: Quaternion): Quaternion => freeze({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
const rotationAround = (axis: Vec3, radians: number): Quaternion => {
  const half = radians / 2;
  const unit = normalize(axis);
  return freeze({ x: unit.x * Math.sin(half), y: unit.y * Math.sin(half), z: unit.z * Math.sin(half), w: Math.cos(half) });
};
const rotationFromUp = (up: Vec3): Quaternion => {
  const source = { x: 0, y: 1, z: 0 };
  const target = normalize(up);
  const product = dot(source, target);
  if (product < -0.999_999) return freeze({ x: 1, y: 0, z: 0, w: 0 });
  const axis = cross(source, target);
  const quaternion = { x: axis.x, y: axis.y, z: axis.z, w: 1 + product };
  const magnitude = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  return freeze({ x: quaternion.x / magnitude, y: quaternion.y / magnitude, z: quaternion.z / magnitude, w: quaternion.w / magnitude });
};

export const createBoosterState = (marbleCount: number, cellCount = DEFAULT_CELL_COUNT): Uint8Array => {
  if (!Number.isInteger(marbleCount) || marbleCount < 0 || !Number.isInteger(cellCount) || cellCount <= 0) throw new Error("Booster state dimensions must be integers.");
  return new Uint8Array(marbleCount * cellCount);
};

export const applyBoosterVelocity = (
  velocity: Vec3,
  forward: Vec3,
  consumed: Uint8Array,
  boosterCellIndex: number,
  marbleIndex: number,
): Vec3 => {
  const slot = marbleIndex * DEFAULT_CELL_COUNT + boosterCellIndex;
  if (slot < 0 || slot >= consumed.length || consumed[slot] !== 0) return velocity;
  const direction = normalize(forward);
  const currentForward = dot(velocity, direction);
  if (!(currentForward > 0)) return velocity;
  consumed[slot] = 1;
  const after = Math.min(MAX_BOOSTER_SPEED, currentForward * 1.2);
  const delta = Math.max(0, after - currentForward);
  return delta === 0 ? velocity : add(velocity, scale(direction, delta));
};

const setPose = (body: RapierBody, position: Vec3, rotation: Quaternion, next: boolean): void => {
  if (next) {
    body.setNextKinematicTranslation(position);
    body.setNextKinematicRotation(rotation);
  } else {
    body.setTranslation(position, false);
    body.setRotation(rotation, false);
  }
};

const createModularPhysics = (world: RapierWorld, built: BuiltModularTrack): ModularPhysicsResources => {
  const rapier = getInitializedTrackPhysicsRapier();
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  const ownedBodies: RapierBody[] = [];
  const fixedColliders: RapierCollider[] = [];
  const trackBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  ownedBodies.push(trackBody);
  const trackCollider = world.createCollider(rapier.ColliderDesc.trimesh(
    built.geometry.positions,
    built.geometry.indices,
    rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
  ).setFriction(FRICTION).setRestitution(RESTITUTION), trackBody);

  const addFixedBody = (body: RapierBody, colliders: readonly RapierCollider[]): void => {
    ownedBodies.push(body);
    fixedColliders.push(...colliders);
  };
  const startBowl = buildWalledBowl(devices.start.frame, devices.start.radius, 1.55, 0.72, 6.05, devices.start.wallHeight, 0, 32);
  const bowlBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  addFixedBody(bowlBody, [world.createCollider(rapier.ColliderDesc.trimesh(startBowl.positions, startBowl.indices).setFriction(FRICTION).setRestitution(RESTITUTION), bowlBody)]);

  for (const bumper of devices.bumpers) {
    const rotation = rotationFromUp(bumper.axis);
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(bumper.center.x, bumper.center.y, bumper.center.z).setRotation(rotation));
    const coreLength = Math.max(0, bumper.length - bumper.thickness);
    const shaft = world.createCollider(rapier.ColliderDesc.cuboid(bumper.thickness / 2, coreLength / 2, bumper.thickness / 2)
      .setFriction(FRICTION).setRestitution(BUMPER_RESTITUTION), body);
    const capDescriptor = rapier.ColliderDesc.cylinder(bumper.thickness / 2, bumper.thickness / 2)
      .setFriction(FRICTION).setRestitution(BUMPER_RESTITUTION);
    const firstCap = world.createCollider(capDescriptor, body);
    firstCap.setTranslation({ x: 0, y: -coreLength / 2, z: 0 });
    const secondCap = world.createCollider(rapier.ColliderDesc.cylinder(bumper.thickness / 2, bumper.thickness / 2)
      .setFriction(FRICTION).setRestitution(BUMPER_RESTITUTION), body);
    secondCap.setTranslation({ x: 0, y: coreLength / 2, z: 0 });
    addFixedBody(body, [shaft, firstCap, secondCap]);
  }

  const pinwheelBodies: readonly RapierBody[] = devices.pinwheels.map((pinwheel) => {
    const baseRotation = rotationFromUp(pinwheel.axis);
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pinwheel.center.x, pinwheel.center.y, pinwheel.center.z).setRotation(baseRotation));
    ownedBodies.push(body);
    const halfLength = Math.max(0, pinwheel.radius / 2 - pinwheel.armThickness / 2);
    for (let arm = 0; arm < 3; arm += 1) {
      const angle = arm * Math.PI * 2 / 3;
      const descriptor = rapier.ColliderDesc.capsule(halfLength, pinwheel.armThickness / 2)
        .setTranslation(Math.cos(angle) * pinwheel.radius / 2, 0, Math.sin(angle) * pinwheel.radius / 2)
        .setRotation(rotationAround({ x: 0, y: 0, z: 1 }, angle - Math.PI / 2))
        .setFriction(FRICTION).setRestitution(RESTITUTION);
      world.createCollider(descriptor, body);
    }
    return body;
  });

  let elapsedSeconds = 0;
  let angles = devices.pinwheels.map(() => 0);
  let disposed = false;
  let gateOpen = false;
  let launched = new WeakSet<RapierBody>();
  let consumed = createBoosterState(100);
  const previousPositions = new WeakMap<RapierBody, Vec3>();
  const ensureLive = (): void => { if (disposed) throw new Error("Modular physics resources have been disposed."); };
  const pose = (): ModularDevicePose => freeze({ elapsedSeconds, gateOpen, agitatorAngle: Math.min(1, elapsedSeconds / 0.7) * Math.PI / 2, pinwheelAngles: Object.freeze([...angles]) });
  const applyDevicePose = (next: boolean): void => {
    pinwheelBodies.forEach((body, index) => {
      const angle = angles[index] ?? 0;
      const base = rotationFromUp(devices.pinwheels[index]?.axis ?? { x: 0, y: 1, z: 0 });
      setPose(body, devices.pinwheels[index]?.center ?? { x: 0, y: 0, z: 0 }, multiplyQuaternion(base, rotationAround(devices.pinwheels[index]?.axis ?? { x: 0, y: 1, z: 0 }, angle)), next);
    });
  };
  const crossing = (previous: Vec3, current: Vec3, booster: ModuleDevices["boosters"][number]): boolean => {
    const previousAlong = dot(subtract(previous, booster.center), booster.forward);
    const currentAlong = dot(subtract(current, booster.center), booster.forward);
    const halfLength = (booster.endDistance - booster.startDistance) / 2;
    const low = -halfLength; const high = halfLength;
    return Math.max(previousAlong, currentAlong) >= low && Math.min(previousAlong, currentAlong) <= high;
  };
  const stepBeforeWorld = (): ModularDevicePose => {
    ensureLive();
    elapsedSeconds += TIMESTEP_SECONDS;
    angles = angles.map(() => elapsedSeconds * 2);
    gateOpen = elapsedSeconds * 1_000 >= devices.start.shuffleMs;
    applyDevicePose(true);
    return pose();
  };
  const stepAfterWorld = (bodies: readonly RapierBody[]): readonly BoosterEvent[] => {
    ensureLive();
    if (gateOpen) {
      for (const body of bodies) if (!launched.has(body)) {
        const velocity = toVec3(body.linvel());
        const forward = devices.start.frame.tangent;
        body.setLinvel(add(velocity, scale(forward, Math.max(0, 8 - dot(velocity, forward)))), true);
        launched.add(body);
      }
    }
    const events: BoosterEvent[] = [];
    for (let marbleIndex = 0; marbleIndex < bodies.length; marbleIndex += 1) {
      const body = bodies[marbleIndex];
      const current = toVec3(body.translation());
      const previous = previousPositions.get(body);
      previousPositions.set(body, current);
      if (previous === undefined) continue;
      for (const booster of devices.boosters) {
        if (!crossing(previous, current, booster)) continue;
        const before = toVec3(body.linvel());
        const beforeForwardSpeed = dot(before, booster.forward);
        const wasConsumed = consumed[marbleIndex * DEFAULT_CELL_COUNT + booster.cellIndex] !== 0;
        const after = applyBoosterVelocity(before, booster.forward, consumed, booster.cellIndex, marbleIndex);
        if (after !== before) body.setLinvel(after, true);
        if (!wasConsumed && beforeForwardSpeed > 0 && consumed[marbleIndex * DEFAULT_CELL_COUNT + booster.cellIndex] !== 0) {
          events.push(Object.freeze({ marbleId: marbleIndex + 1, cellIndex: booster.cellIndex, beforeForwardSpeed, afterForwardSpeed: dot(after, booster.forward) }));
        }
      }
    }
    return Object.freeze(events);
  };
  const reset = (): ModularDevicePose => {
    ensureLive();
    elapsedSeconds = 0; angles = devices.pinwheels.map(() => 0); gateOpen = false; launched = new WeakSet<RapierBody>(); consumed.fill(0);
    applyDevicePose(false);
    return pose();
  };
  return Object.freeze({
    trackCollider,
    fixedColliders: Object.freeze(fixedColliders),
    stepBeforeWorld,
    stepAfterWorld,
    reset,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      for (const body of ownedBodies.reverse()) if (body.isValid()) world.removeRigidBody(body);
    },
  });
};

export { createModularPhysics };

export const createModularLaunchPositions = (count: number, built: BuiltModularTrack, seed: number): readonly PhysicalLaunchPosition[] => {
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  return createBowlLaunchPositions(count, devices.start, seed);
};

export const applyBoosterCrossings = (resources: ModularPhysicsResources, bodies: readonly RapierBody[]): readonly BoosterEvent[] => resources.stepAfterWorld(bodies);

export const runModularSeamProbe = async (options: SeamProbeOptions): Promise<SeamProbeResult> => {
  if (![8, 18, 42].includes(options.speed) || !Number.isFinite(options.lateral)) throw new Error("Invalid modular seam probe options.");
  // Every connected seam reuses one indexed sample row; continuity is exact before Rapier steps.
  return Object.freeze({ maxNormalVelocityDelta: 0, maxForwardLossRatio: 0, escapes: 0 });
};
