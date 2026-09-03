import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import { MARBLE_DIAMETER, MARBLE_RADIUS } from "./obstacleLayout";
import type { ObstacleGeometryResources } from "./obstacleGeometry";
import { resolvePusherPose } from "./obstacleLayout";
import { getInitializedTrackPhysicsRapier } from "./trackPhysics";
import type { PhysicalLaunchPosition, ResolvedFrame, ResolvedStart, ValidResolvedObstacleLayout, Vec3 } from "./trackTypes";

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const SURFACE_CLEARANCE = MARBLE_RADIUS + 0.01;
const MAX_BOWL_MARBLES = 100;
const BOWL_RING_INCREMENT = 0.8;
const BOWL_MIN_RING_RADIUS = 2.1;
const BOWL_SLOT_SPACING = MARBLE_DIAMETER + 0.14;
const PUSHER_CYCLE_MS = 2_400;
const FRICTION = 0.24;
const RESTITUTION = 0.08;

type RapierModule = typeof RAPIER_TYPE;
type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export type DeviceQuaternion = Readonly<{ x: number; y: number; z: number; w: number }>;
export type DeviceTransform = Readonly<{ translation: Vec3; rotation: DeviceQuaternion }>;
export type DevicePose = Readonly<{
  elapsedMs: number;
  gateOpen: boolean;
  raceClockStarted: boolean;
  agitator: DeviceTransform;
  gate: DeviceTransform;
  pushers: ReturnType<typeof resolvePusherPose>;
  pusherTransforms: Readonly<{ left: DeviceTransform; right: DeviceTransform }>;
}>;

export type DeviceController = Readonly<{
  step: (seconds: number) => DevicePose;
  advanceMs: (milliseconds: number) => DevicePose;
  pose: () => DevicePose;
  initialPose: () => DevicePose;
  reset: (options?: Readonly<{ gateOpen?: boolean }>) => DevicePose;
  raceClockStarted: () => boolean;
}>;

export type ObstaclePhysicsResources = Readonly<{
  fixedColliders: readonly RapierCollider[];
  pegColliders: readonly RapierCollider[];
  agitator: RapierBody;
  gate: RapierBody;
  pushers: readonly [RapierBody, RapierBody];
  controller: DeviceController;
  stepFixed: (seconds?: number) => DevicePose;
  reset: (options?: Readonly<{ gateOpen?: boolean }>) => DevicePose;
  dispose: () => void;
}>;

export class BowlLaunchError extends Error {
  readonly code: "invalid-count" | "invalid-seed" | "capacity";

  constructor(code: BowlLaunchError["code"], message: string) {
    super(message);
    this.name = "BowlLaunchError";
    this.code = code;
  }
}

const add = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
const scale = (vector: Vec3, amount: number): Vec3 => ({ x: vector.x * amount, y: vector.y * amount, z: vector.z * amount });
const cross = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});
const dot = (left: Vec3, right: Vec3): number => left.x * right.x + left.y * right.y + left.z * right.z;
const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length === 0 ? { x: 0, y: 1, z: 0 } : scale(vector, 1 / length);
};
const inFrame = (frame: ResolvedFrame, along: number, lateral: number, vertical = 0): Vec3 =>
  add(frame.position, add(scale(frame.tangent, along), add(scale(frame.side, lateral), scale(frame.up, vertical))));
const freezeVector = (vector: Vec3): Vec3 => Object.freeze({ ...vector });
const freezeQuaternion = (quaternion: DeviceQuaternion): DeviceQuaternion => Object.freeze({ ...quaternion });
const freezeTransform = (translation: Vec3, rotation: DeviceQuaternion): DeviceTransform => Object.freeze({ translation: freezeVector(translation), rotation: freezeQuaternion(rotation) });

const multiplyQuaternion = (left: DeviceQuaternion, right: DeviceQuaternion): DeviceQuaternion => freezeQuaternion({
  x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
  y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
  z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
});

const rotationAround = (axis: Vec3, radians: number): DeviceQuaternion => {
  const half = radians / 2;
  const unit = normalize(axis);
  return freezeQuaternion({ x: unit.x * Math.sin(half), y: unit.y * Math.sin(half), z: unit.z * Math.sin(half), w: Math.cos(half) });
};

const rotationFromUp = (up: Vec3): DeviceQuaternion => {
  const source = { x: 0, y: 1, z: 0 };
  const target = normalize(up);
  const product = dot(source, target);
  if (product < -0.999_999) return freezeQuaternion({ x: 1, y: 0, z: 0, w: 0 });
  const axis = cross(source, target);
  return normalizeQuaternion({ x: axis.x, y: axis.y, z: axis.z, w: 1 + product });
};

const normalizeQuaternion = (quaternion: DeviceQuaternion): DeviceQuaternion => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  return freezeQuaternion({ x: quaternion.x / length, y: quaternion.y / length, z: quaternion.z / length, w: quaternion.w / length });
};

const rotationFromFrame = (frame: ResolvedFrame): DeviceQuaternion => {
  const x = frame.tangent;
  const y = frame.up;
  const z = normalize(cross(x, y));
  const m00 = x.x; const m01 = y.x; const m02 = z.x;
  const m10 = x.y; const m11 = y.y; const m12 = z.y;
  const m20 = x.z; const m21 = y.z; const m22 = z.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const factor = 0.5 / Math.sqrt(trace + 1);
    return normalizeQuaternion({ w: 0.25 / factor, x: (m21 - m12) * factor, y: (m02 - m20) * factor, z: (m10 - m01) * factor });
  }
  if (m00 > m11 && m00 > m22) {
    const factor = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return normalizeQuaternion({ w: (m21 - m12) / factor, x: 0.25 * factor, y: (m01 + m10) / factor, z: (m02 + m20) / factor });
  }
  if (m11 > m22) {
    const factor = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return normalizeQuaternion({ w: (m02 - m20) / factor, x: (m01 + m10) / factor, y: 0.25 * factor, z: (m12 + m21) / factor });
  }
  const factor = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return normalizeQuaternion({ w: (m10 - m01) / factor, x: (m02 + m20) / factor, y: (m12 + m21) / factor, z: 0.25 * factor });
};

const bowlSurface = (start: ResolvedStart, radius: number): Readonly<{ height: number; slope: number }> => {
  const normalized = Math.max(0, Math.min(1, radius / start.radius));
  return Object.freeze({ height: -0.72 * (1 - normalized), slope: 0.72 / start.radius });
};

const deterministicAngle = (seed: number, ring: number): number => {
  let value = (seed >>> 0) ^ Math.imul(ring + 1, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff * Math.PI * 2;
};

export const createBowlLaunchPositions = (
  count: number,
  start: ResolvedStart,
  seed: number,
): readonly PhysicalLaunchPosition[] => {
  if (!Number.isInteger(count) || count <= 0) throw new BowlLaunchError("invalid-count", "Bowl launch count must be a positive integer.");
  if (!Number.isFinite(seed)) throw new BowlLaunchError("invalid-seed", "Bowl launch seed must be finite.");
  if (count > MAX_BOWL_MARBLES) throw new BowlLaunchError("capacity", `Bowl launch capacity is ${MAX_BOWL_MARBLES} marbles.`);

  const positions: PhysicalLaunchPosition[] = [];
  for (let ring = 0; positions.length < count; ring += 1) {
    const radius = BOWL_MIN_RING_RADIUS + ring * BOWL_RING_INCREMENT;
    if (radius > start.radius - MARBLE_RADIUS - 0.2) throw new BowlLaunchError("capacity", `Bowl cannot place ${count} marbles with safe wall clearance.`);
    const slots = Math.max(1, Math.floor(Math.PI * 2 * radius / BOWL_SLOT_SPACING));
    const angleOffset = deterministicAngle(seed, ring);
    for (let slot = 0; slot < slots && positions.length < count; slot += 1) {
      const angle = angleOffset + slot / slots * Math.PI * 2;
      const surface = bowlSurface(start, radius);
      const radial = add(scale(start.frame.tangent, Math.cos(angle)), scale(start.frame.side, Math.sin(angle)));
      const normal = normalize(add(start.frame.up, scale(radial, -surface.slope)));
      const point = add(inFrame(start.frame, Math.cos(angle) * radius, Math.sin(angle) * radius, surface.height), scale(normal, SURFACE_CLEARANCE));
      positions.push(Object.freeze({
        x: point.x,
        y: point.y,
        z: point.z,
        crossOffset: Math.sin(angle) * radius,
        row: ring,
        column: slot,
        physicalLaunchPosition: true,
      }));
    }
  }
  return Object.freeze(positions);
};

const poseAt = (layout: ValidResolvedObstacleLayout, elapsedMs: number, forceGateOpen = false): DevicePose => {
  const gateOpen = forceGateOpen || elapsedMs >= layout.start.shuffleMs;
  const localPhase = (elapsedMs % PUSHER_CYCLE_MS) / PUSHER_CYCLE_MS;
  const pushers = resolvePusherPose(layout.pushers, localPhase);
  const startRotation = rotationFromFrame(layout.start.frame);
  const pusherRotation = rotationAround(layout.pushers.frame.side, Math.PI / 2);
  const agitator = freezeTransform(
    inFrame(layout.start.frame, 0, 0, -0.14),
    multiplyQuaternion(startRotation, rotationAround({ x: 0, y: 1, z: 0 }, elapsedMs / layout.start.shuffleMs * Math.PI * 6)),
  );
  const gate = freezeTransform(
    inFrame(layout.start.frame, 6.8, 0, gateOpen ? 3.4 : 0.65),
    startRotation,
  );
  return Object.freeze({
    elapsedMs,
    gateOpen,
    raceClockStarted: gateOpen,
    agitator,
    gate,
    pushers,
    pusherTransforms: Object.freeze({
      left: freezeTransform(pushers.left.center, pusherRotation),
      right: freezeTransform(pushers.right.center, pusherRotation),
    }),
  });
};

export const createDeviceController = (layout: ValidResolvedObstacleLayout): DeviceController => {
  let elapsedMs = 0;
  let forceGateOpen = false;
  const initialPose = (): DevicePose => poseAt(layout, 0, false);
  const current = (): DevicePose => poseAt(layout, elapsedMs, forceGateOpen);
  const advanceMs = (milliseconds: number): DevicePose => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Device time must be a finite non-negative duration.");
    elapsedMs += milliseconds;
    return current();
  };
  return Object.freeze({
    step: (seconds: number): DevicePose => {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Device step must be a finite non-negative duration.");
      return advanceMs(seconds * 1_000);
    },
    advanceMs,
    pose: current,
    initialPose,
    reset: (options: Readonly<{ gateOpen?: boolean }> = {}): DevicePose => {
      elapsedMs = 0;
      forceGateOpen = options.gateOpen === true;
      return current();
    },
    raceClockStarted: (): boolean => current().raceClockStarted,
  });
};

const colliderSettings = <T extends { setFriction: (value: number) => T; setRestitution: (value: number) => T }>(descriptor: T): T =>
  descriptor.setFriction(FRICTION).setRestitution(RESTITUTION);

const createFixedTrimesh = (world: RapierWorld, module: RapierModule, geometry: ObstacleGeometryResources["startBowl"]): Readonly<{ body: RapierBody; collider: RapierCollider }> => {
  const body = world.createRigidBody(module.RigidBodyDesc.fixed());
  const collider = world.createCollider(colliderSettings(module.ColliderDesc.trimesh(geometry.positions, geometry.indices)), body);
  return Object.freeze({ body, collider });
};

const setBodyPose = (body: RapierBody, transform: DeviceTransform): void => {
  body.setTranslation(transform.translation, false);
  body.setRotation(transform.rotation, false);
};

const writeKinematicPose = (body: RapierBody, transform: DeviceTransform): void => {
  body.setNextKinematicTranslation(transform.translation);
  body.setNextKinematicRotation(transform.rotation);
};

export const createObstaclePhysics = (world: RapierWorld, resources: ObstacleGeometryResources): ObstaclePhysicsResources => {
  const module = getInitializedTrackPhysicsRapier();
  const fixed: ReadonlyArray<Readonly<{ body: RapierBody; collider: RapierCollider }>> = [
    resources.startBowl, resources.startThroat, resources.pegHallSurface, resources.pusherHallSurface,
    ...resources.branchFloors, resources.branchRails, resources.vortex, resources.catchChannel,
  ].map((geometry) => createFixedTrimesh(world, module, geometry));
  const pegBodies: RapierBody[] = [];
  const pegColliders: RapierCollider[] = [];
  const pegRotation = rotationFromUp(resources.layout.pegHall.frame.up);
  for (const peg of resources.pegs) {
    const body = world.createRigidBody(module.RigidBodyDesc.fixed().setTranslation(peg.center.x, peg.center.y, peg.center.z).setRotation(pegRotation));
    const collider = world.createCollider(colliderSettings(module.ColliderDesc.cylinder(0.575, peg.radius)), body);
    pegBodies.push(body);
    pegColliders.push(collider);
  }
  const controller = createDeviceController(resources.layout);
  const initial = controller.initialPose();
  const agitator = world.createRigidBody(module.RigidBodyDesc.kinematicPositionBased());
  const gate = world.createRigidBody(module.RigidBodyDesc.kinematicPositionBased());
  const leftPusher = world.createRigidBody(module.RigidBodyDesc.kinematicPositionBased());
  const rightPusher = world.createRigidBody(module.RigidBodyDesc.kinematicPositionBased());
  setBodyPose(agitator, initial.agitator);
  setBodyPose(gate, initial.gate);
  setBodyPose(leftPusher, initial.pusherTransforms.left);
  setBodyPose(rightPusher, initial.pusherTransforms.right);
  for (let arm = 0; arm < 3; arm += 1) {
    const angle = arm / 3 * Math.PI * 2;
    const descriptor = colliderSettings(module.ColliderDesc.cuboid(2.35, 0.12, 0.16));
    descriptor.setTranslation(Math.cos(angle) * 2.35, 0, Math.sin(angle) * 2.35);
    descriptor.setRotation(rotationAround({ x: 0, y: 1, z: 0 }, angle));
    world.createCollider(descriptor, agitator);
  }
  world.createCollider(colliderSettings(module.ColliderDesc.cuboid(0.18, 0.62, 4.1)), gate);
  world.createCollider(colliderSettings(module.ColliderDesc.capsule(0.8, resources.layout.pushers.radius)), leftPusher);
  world.createCollider(colliderSettings(module.ColliderDesc.capsule(0.8, resources.layout.pushers.radius)), rightPusher);

  const kinematicBodies: readonly [RapierBody, RapierBody, RapierBody, RapierBody] = [agitator, gate, leftPusher, rightPusher];
  let disposed = false;
  const ensureLive = (): void => { if (disposed) throw new Error("Obstacle physics resources have been disposed."); };
  const apply = (pose: DevicePose, next: boolean): DevicePose => {
    const setter = next ? writeKinematicPose : setBodyPose;
    setter(agitator, pose.agitator);
    setter(gate, pose.gate);
    setter(leftPusher, pose.pusherTransforms.left);
    setter(rightPusher, pose.pusherTransforms.right);
    return pose;
  };
  return Object.freeze({
    fixedColliders: Object.freeze(fixed.map(({ collider }) => collider)),
    pegColliders: Object.freeze(pegColliders),
    agitator,
    gate,
    pushers: Object.freeze([leftPusher, rightPusher]) as readonly [RapierBody, RapierBody],
    controller,
    stepFixed: (seconds = FIXED_TIMESTEP_SECONDS): DevicePose => {
      ensureLive();
      if (Math.abs(seconds - FIXED_TIMESTEP_SECONDS) > Number.EPSILON) throw new Error("Obstacle devices require the fixed timestep.");
      return apply(controller.step(seconds), true);
    },
    reset: (options: Readonly<{ gateOpen?: boolean }> = {}): DevicePose => {
      ensureLive();
      return apply(controller.reset(options), false);
    },
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      for (const { body } of fixed) world.removeRigidBody(body);
      for (const body of pegBodies) world.removeRigidBody(body);
      for (const body of kinematicBodies) world.removeRigidBody(body);
    },
  });
};
