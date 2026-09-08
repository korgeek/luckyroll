import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import { createRandom } from "../../domain/seed";
import type { TrackDesign } from "../../designer/trackDesign";
import {
  createMarbleBodies,
  createTrackPhysicsWorld,
  distanceSquaredToTrackSegments,
  distanceSquaredToSample,
  getInitializedTrackPhysicsRapier,
  insideFinishVolume,
  initializeTrackPhysics,
  speed,
} from "../track/trackPhysics";
import { createTrackProjector, projectToTrack } from "../track/trackSampler";
import type { PhysicalLaunchPosition, Vec3 } from "../track/trackTypes";
import { buildModularTrack, type BuiltModularTrack } from "./modularTrackBuild";
import { createPusherVertices, resolveModuleDevices, type ModularDevicePose, type ModuleDevices } from "./moduleDevices";
import { CHANNEL_WIDTH, MARBLE_DIAMETER } from "./modularTypes";
import { curveBankBlend, effectiveCurveInnerInset, profileAt } from "./moduleGeometry";
import { applyRaceRushPulse, shouldStartRaceRush } from "../raceRush";

const TIMESTEP_SECONDS = 1 / 60;
const TRACK_FRICTION = 0.06;
const FRICTION = 0.24;
const RESTITUTION = 0.08;
const BUMPER_RESTITUTION = 0.65;
const MAX_BOOSTER_SPEED = 42;
const RETURN_ASSIST_SPEED = 18;
const RETURN_ASSIST_COOLDOWN_STEPS = 45;
const CURVE_GUARD_MIN_SPEED = 12;
const STALL_RECOVERY_SPEED = 8;
const STALL_RECOVERY_STEPS = 3 / TIMESTEP_SECONDS;
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

export type CurveProbeOptions = Readonly<{ track: TrackDesign; speed: 8 | 18 | 42; lateral: number }>;
export type CurveProbeResult = Readonly<{ escaped: boolean; exited: boolean; forwardSpeed: number }>;

export type ModularPhysicsResources = Readonly<{
  trackCollider: RapierCollider;
  fixedColliders: readonly RapierCollider[];
  pusherBody: RapierBody;
  pinwheelBodies: readonly RapierBody[];
  stepBeforeWorld: () => ModularDevicePose;
  stepAfterWorld: (bodies: readonly RapierBody[]) => readonly BoosterEvent[];
  reset: (remainingRestart?: boolean) => ModularDevicePose;
  dispose: () => void;
}>;

export type ModularMarbleFailure = Readonly<{
  seed: number;
  marbleId: number;
  elapsedMs: number;
  position: Vec3;
  velocity: Vec3;
  nearestSampleIndex: number;
  category: "escape" | "stall" | "non-finite";
}>;

export type ModularValidationOptions = Readonly<{
  track: TrackDesign;
  seed: number;
  marbleCount: number;
  durationSeconds: number;
  rush?: boolean;
}>;

export type ModularValidationResult = Readonly<{
  seed: number;
  finishOrder: readonly number[];
  finishTimesMs: readonly number[];
  rushPulseCount: number;
  escapes: readonly ModularMarbleFailure[];
  stalls: readonly ModularMarbleFailure[];
  nonFinite: readonly ModularMarbleFailure[];
  boosterCapViolations: readonly BoosterEvent[];
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
const rotationFromBasis = (x: Vec3, y: Vec3, z: Vec3): Quaternion => {
  const m00 = x.x; const m01 = y.x; const m02 = z.x;
  const m10 = x.y; const m11 = y.y; const m12 = z.y;
  const m20 = x.z; const m21 = y.z; const m22 = z.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const factor = 0.5 / Math.sqrt(trace + 1);
    return freeze({ w: 0.25 / factor, x: (m21 - m12) * factor, y: (m02 - m20) * factor, z: (m10 - m01) * factor });
  }
  if (m00 > m11 && m00 > m22) {
    const factor = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return freeze({ w: (m21 - m12) / factor, x: 0.25 * factor, y: (m01 + m10) / factor, z: (m02 + m20) / factor });
  }
  if (m11 > m22) {
    const factor = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return freeze({ w: (m02 - m20) / factor, x: (m01 + m10) / factor, y: 0.25 * factor, z: (m12 + m21) / factor });
  }
  const factor = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return freeze({ w: (m10 - m01) / factor, x: (m02 - m20) / factor, y: (m12 + m21) / factor, z: 0.25 * factor });
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
  cellCount = DEFAULT_CELL_COUNT,
): Vec3 => {
  const slot = marbleIndex * cellCount + boosterCellIndex;
  if (slot < 0 || slot >= consumed.length || consumed[slot] !== 0) return velocity;
  const direction = normalize(forward);
  const currentForward = dot(velocity, direction);
  if (!(currentForward > 0)) return velocity;
  const after = Math.min(MAX_BOOSTER_SPEED, Math.max(18, currentForward * 1.25));
  const delta = Math.max(0, after - currentForward);
  if (delta === 0) return velocity;
  consumed[slot] = 1;
  return add(velocity, scale(direction, delta));
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
  const project = createTrackProjector(built.samples);
  const ownedBodies: RapierBody[] = [];
  const fixedColliders: RapierCollider[] = [];
  const trackBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  ownedBodies.push(trackBody);
  const trackCollider = world.createCollider(rapier.ColliderDesc.trimesh(
    built.geometry.positions,
    built.geometry.indices,
    rapier.TriMeshFlags.FIX_INTERNAL_EDGES,
  ).setFriction(TRACK_FRICTION).setFrictionCombineRule(rapier.CoefficientCombineRule.Min).setRestitution(RESTITUTION), trackBody);

  const addFixedBody = (body: RapierBody, colliders: readonly RapierCollider[]): void => {
    ownedBodies.push(body);
    fixedColliders.push(...colliders);
  };
  const gateRotation = rotationFromBasis(devices.start.gate.side, devices.start.gate.up, scale(devices.start.gate.tangent, -1));
  const gateBody = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(devices.start.gate.center.x, devices.start.gate.center.y, devices.start.gate.center.z)
    .setRotation(gateRotation));
  ownedBodies.push(gateBody);
  world.createCollider(rapier.ColliderDesc.cuboid(devices.start.gate.width / 2, devices.start.gate.height / 2, devices.start.gate.depth / 2)
    .setFriction(FRICTION).setRestitution(RESTITUTION), gateBody);
  const pusherRotation = rotationFromBasis(devices.start.pusher.side, devices.start.pusher.up, scale(devices.start.pusher.tangent, -1));
  const pusherBody = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(devices.start.pusher.center.x, devices.start.pusher.center.y, devices.start.pusher.center.z)
    .setRotation(pusherRotation));
  ownedBodies.push(pusherBody);
  const pusherShape = rapier.ColliderDesc.convexHull(createPusherVertices(devices.start.pusher));
  if (!pusherShape) throw new Error("Start pusher must form a convex prism.");
  world.createCollider(pusherShape.setFriction(FRICTION).setRestitution(RESTITUTION), pusherBody);

  for (const bumper of devices.bumpers) {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed()
      .setTranslation(bumper.center.x, bumper.center.y, bumper.center.z)
      .setRotation(rotationFromUp(bumper.up)));
    const collider = world.createCollider(rapier.ColliderDesc.cylinder(bumper.height / 2, bumper.radius)
      .setFriction(FRICTION).setRestitution(BUMPER_RESTITUTION).setRestitutionCombineRule(rapier.CoefficientCombineRule.Max), body);
    addFixedBody(body, [collider]);
  }

  const pinwheelBodies: readonly RapierBody[] = devices.pinwheels.map((pinwheel) => {
    const baseRotation = rotationFromUp(pinwheel.axis);
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pinwheel.center.x, pinwheel.center.y, pinwheel.center.z).setRotation(baseRotation));
    ownedBodies.push(body);
    const halfLength = Math.max(0, pinwheel.radius / 2 - pinwheel.armThickness / 2);
    for (let arm = 0; arm < 3; arm += 1) {
      const angle = arm * Math.PI * 2 / 3;
      const radial = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      const descriptor = rapier.ColliderDesc.capsule(halfLength, pinwheel.armThickness / 2)
        .setTranslation(radial.x * pinwheel.radius / 2, 0, radial.z * pinwheel.radius / 2)
        .setRotation(rotationFromUp(radial))
        .setFriction(FRICTION).setRestitution(RESTITUTION);
      world.createCollider(descriptor, body);
    }
    return body;
  });

  let elapsedSeconds = 0;
  let angles = devices.pinwheels.map(() => 0);
  let disposed = false;
  let gateOpen = false;
  let forceGateOpen = false;
  let pusherCenter = devices.start.pusher.center;
  const cellCount = built.track.cells.length;
  let consumed = createBoosterState(100, cellCount);
  let returnAssistCooldownUntil = new Uint32Array(100 * cellCount);
  let fixedStep = 0;
  let previousPositions = new WeakMap<RapierBody, Vec3>();
  let recoveryStates = new WeakMap<RapierBody, { anchorDistance: number; stalledSteps: number }>();
  const ensureMarbleCapacity = (marbleCount: number): void => {
    if (consumed.length >= marbleCount * cellCount) return;
    const nextConsumed = createBoosterState(marbleCount, cellCount); nextConsumed.set(consumed); consumed = nextConsumed;
    const nextCooldown = new Uint32Array(marbleCount * cellCount); nextCooldown.set(returnAssistCooldownUntil); returnAssistCooldownUntil = nextCooldown;
  };
  const ensureLive = (): void => { if (disposed) throw new Error("Modular physics resources have been disposed."); };
  const pose = (): ModularDevicePose => freeze({ elapsedSeconds, gateOpen, pusherCenter, pinwheelAngles: Object.freeze([...angles]) });
  const applyDevicePose = (next: boolean): void => {
    const closedGate = devices.start.gate.center;
    const openGate = add(closedGate, scale(devices.start.gate.up, devices.start.gate.height * 2));
    setPose(gateBody, gateOpen ? openGate : closedGate, gateRotation, next);
    setPose(pusherBody, pusherCenter, pusherRotation, next);
    pinwheelBodies.forEach((body, index) => {
      const angle = angles[index] ?? 0;
      const base = rotationFromUp(devices.pinwheels[index]?.axis ?? { x: 0, y: 1, z: 0 });
      setPose(body, devices.pinwheels[index]?.center ?? { x: 0, y: 0, z: 0 }, multiplyQuaternion(base, rotationAround({ x: 0, y: 1, z: 0 }, angle)), next);
    });
  };
  const crossing = (previous: Vec3, current: Vec3, booster: ModuleDevices["boosters"][number]): boolean => {
    const previousOffset = subtract(previous, booster.center); const currentOffset = subtract(current, booster.center);
    const previousAlong = dot(previousOffset, booster.forward); const currentAlong = dot(currentOffset, booster.forward);
    const lateralLimit = CHANNEL_WIDTH / 2 - MARBLE_DIAMETER / 2;
    if (Math.abs(dot(previousOffset, booster.side)) > lateralLimit || Math.abs(dot(currentOffset, booster.side)) > lateralLimit) return false;
    const halfLength = (booster.endDistance - booster.startDistance) / 2;
    const low = -halfLength; const high = halfLength;
    return currentAlong > previousAlong + 1e-7 && previousAlong <= high && currentAlong >= low;
  };
  const reverseCrossing = (previous: Vec3, current: Vec3, booster: ModuleDevices["boosters"][number]): boolean => {
    const previousOffset = subtract(previous, booster.center); const currentOffset = subtract(current, booster.center);
    const previousAlong = dot(previousOffset, booster.forward); const currentAlong = dot(currentOffset, booster.forward);
    const lateralLimit = CHANNEL_WIDTH / 2 - MARBLE_DIAMETER / 2;
    if (Math.abs(dot(previousOffset, booster.side)) > lateralLimit || Math.abs(dot(currentOffset, booster.side)) > lateralLimit) return false;
    const high = (booster.endDistance - booster.startDistance) / 2;
    return currentAlong < previousAlong - 1e-7 && previousAlong >= high && currentAlong <= high;
  };
  const stepBeforeWorld = (): ModularDevicePose => {
    ensureLive();
    fixedStep += 1;
    elapsedSeconds += TIMESTEP_SECONDS;
    angles = angles.map((_angle, index) => elapsedSeconds * (devices.pinwheels[index]?.angularSpeed ?? 0));
    gateOpen = forceGateOpen || elapsedSeconds * 1_000 >= devices.start.shuffleMs;
    const elapsedMs = elapsedSeconds * 1_000;
    const pusherElapsedMs = forceGateOpen ? elapsedMs : Math.max(0, elapsedMs - devices.start.shuffleMs);
    const pusherProgress = Math.min(1, pusherElapsedMs / devices.start.pusher.durationMs);
    pusherCenter = add(devices.start.pusher.center, scale(subtract(devices.start.pusher.endCenter, devices.start.pusher.center), pusherProgress));
    applyDevicePose(true);
    return pose();
  };
  const stepAfterWorld = (bodies: readonly RapierBody[]): readonly BoosterEvent[] => {
    ensureLive();
    ensureMarbleCapacity(bodies.length);
    const events: BoosterEvent[] = [];
    for (let marbleIndex = 0; marbleIndex < bodies.length; marbleIndex += 1) {
      const body = bodies[marbleIndex];
      if (!body.isEnabled()) continue;
      const current = toVec3(body.translation());
      const previous = previousPositions.get(body);
      previousPositions.set(body, current);
      if (![current.x, current.y, current.z].every(Number.isFinite)) continue;
      let velocity = toVec3(body.linvel());
      if (![velocity.x, velocity.y, velocity.z].every(Number.isFinite)) continue;
      if (previous !== undefined) {
        for (const booster of devices.boosters) {
          const beforeForwardSpeed = dot(velocity, booster.forward);
          const slot = marbleIndex * cellCount + booster.cellIndex;
          if (booster.returnAssist && reverseCrossing(previous, current, booster) && beforeForwardSpeed < 0 && fixedStep >= returnAssistCooldownUntil[slot]) {
            const after = add(velocity, scale(booster.forward, RETURN_ASSIST_SPEED - beforeForwardSpeed));
            returnAssistCooldownUntil[slot] = fixedStep + RETURN_ASSIST_COOLDOWN_STEPS;
            velocity = after; body.setLinvel(after, true);
            events.push(Object.freeze({ marbleId: marbleIndex + 1, cellIndex: booster.cellIndex, beforeForwardSpeed, afterForwardSpeed: RETURN_ASSIST_SPEED }));
            continue;
          }
          if (!crossing(previous, current, booster)) continue;
          const wasConsumed = consumed[marbleIndex * cellCount + booster.cellIndex] !== 0;
          const after = applyBoosterVelocity(velocity, booster.forward, consumed, booster.cellIndex, marbleIndex, cellCount);
          if (after !== velocity) { velocity = after; body.setLinvel(after, true); }
          if (!wasConsumed && beforeForwardSpeed > 0 && consumed[marbleIndex * cellCount + booster.cellIndex] !== 0) {
            events.push(Object.freeze({ marbleId: marbleIndex + 1, cellIndex: booster.cellIndex, beforeForwardSpeed, afterForwardSpeed: dot(after, booster.forward) }));
          }
        }
      }

      const sample = built.samples[project(current).sampleIndex];
      const slot = marbleIndex * cellCount + sample.cellIndex;
      const forwardSpeed = dot(velocity, sample.tangent);
      const innerContact = Math.sign(dot(sample.centerlineCurvature, sample.side)) * dot(subtract(current, sample.position), sample.side)
        >= CHANNEL_WIDTH / 2 - effectiveCurveInnerInset(curveBankBlend(sample.side.y)) - MARBLE_DIAMETER;
      if (built.track.cells[sample.cellIndex]?.kind === "curve" && sample.localU > 0.4 && sample.localU < 0.6 && innerContact && consumed[slot] === 0 && forwardSpeed < CURVE_GUARD_MIN_SPEED) {
        const after = add(velocity, scale(sample.tangent, CURVE_GUARD_MIN_SPEED - forwardSpeed));
        consumed[slot] = 1; velocity = after; body.setLinvel(after, true);
        events.push(Object.freeze({ marbleId: marbleIndex + 1, cellIndex: sample.cellIndex, beforeForwardSpeed: forwardSpeed, afterForwardSpeed: CURVE_GUARD_MIN_SPEED }));
      }

      const state = recoveryStates.get(body) ?? { anchorDistance: sample.distance, stalledSteps: 0 };
      if (sample.distance >= state.anchorDistance + MARBLE_DIAMETER / 2 || dot(velocity, sample.tangent) >= 1 || sample.zone !== "run") {
        state.anchorDistance = sample.distance; state.stalledSteps = 0;
      } else if (++state.stalledSteps >= STALL_RECOVERY_STEPS) {
        const currentForward = dot(velocity, sample.tangent);
        body.setLinvel(add(add(velocity, scale(sample.tangent, STALL_RECOVERY_SPEED - currentForward)), scale(sample.up, 1.5)), true);
        state.anchorDistance = sample.distance; state.stalledSteps = 0;
      }
      recoveryStates.set(body, state);
    }
    return Object.freeze(events);
  };
  const reset = (remainingRestart = false): ModularDevicePose => {
    ensureLive();
    elapsedSeconds = 0; fixedStep = 0; angles = devices.pinwheels.map(() => 0); forceGateOpen = remainingRestart; gateOpen = forceGateOpen; pusherCenter = devices.start.pusher.center; consumed = createBoosterState(100, cellCount); returnAssistCooldownUntil = new Uint32Array(100 * cellCount); previousPositions = new WeakMap<RapierBody, Vec3>(); recoveryStates = new WeakMap<RapierBody, { anchorDistance: number; stalledSteps: number }>();
    applyDevicePose(false);
    return pose();
  };
  return Object.freeze({
    trackCollider,
    fixedColliders: Object.freeze(fixedColliders),
    pusherBody,
    pinwheelBodies: Object.freeze(pinwheelBodies),
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
  if (!Number.isInteger(count) || count < 0 || count > 300 || !Number.isFinite(seed)) throw new Error("Modular launch positions require 0 through 300 marbles and a finite seed.");
  const devices = resolveModuleDevices(built.track, built.route, built.samples);
  const layerSize = Math.min(100, count);
  const columns = Math.min(10, layerSize);
  const spacing = MARBLE_DIAMETER + 0.04;
  const slots = Array.from({ length: count }, (_, index) => {
    const layerIndex = index % layerSize;
    return { row: Math.floor(layerIndex / columns), column: layerIndex % columns, layer: Math.floor(index / layerSize) };
  });
  const random = createRandom(seed);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random.next() * (index + 1));
    [slots[index], slots[other]] = [slots[other], slots[index]];
  }
  return Object.freeze(slots.map(({ row, column, layer }) => {
    const rowColumns = Math.min(columns, layerSize - row * columns);
    const along = 0.62 + row * spacing;
    const crossOffset = (column - (rowColumns - 1) / 2) * spacing;
    const height = MARBLE_DIAMETER / 2 + 0.02 + layer * spacing;
    const position = add(devices.start.frame.position, add(scale(devices.start.frame.tangent, along), add(scale(devices.start.frame.side, crossOffset), scale(devices.start.frame.up, height))));
    return Object.freeze({ ...position, crossOffset, row, column, physicalLaunchPosition: true as const });
  }));
};

export const applyBoosterCrossings = (resources: ModularPhysicsResources, bodies: readonly RapierBody[]): readonly BoosterEvent[] => resources.stepAfterWorld(bodies);

export const runModularSeamProbe = async (options: SeamProbeOptions): Promise<SeamProbeResult> => {
  if (![8, 18, 42].includes(options.speed) || !Number.isFinite(options.lateral)) throw new Error("Invalid modular seam probe options.");
  if (Math.abs(options.lateral) > CHANNEL_WIDTH / 2 - 1.5 * MARBLE_DIAMETER) throw new Error("Seam probe lateral offset leaves insufficient marble clearance.");
  await initializeTrackPhysics();
  const rapier = getInitializedTrackPhysicsRapier();
  const profile = profileAt(CHANNEL_WIDTH);
  const makeMesh = (rows: readonly number[]): Readonly<{ positions: Float32Array; indices: Uint32Array }> => {
    const rowValues = rows;
    const positions = new Float32Array(rowValues.length * profile.length * 3);
    rowValues.forEach((along, row) => profile.forEach((point, column) => {
      const offset = (row * profile.length + column) * 3;
      positions[offset] = along; positions[offset + 1] = point.height; positions[offset + 2] = point.lateral;
    }));
    const spans = rowValues.length - 1;
    const indices = new Uint32Array(Math.max(0, spans) * (profile.length - 1) * 6);
    let offset = 0;
    for (let row = 0; row < spans; row += 1) {
      const firstRow = row;
      for (let column = 0; column < profile.length - 1; column += 1) {
      const mappedA = firstRow * profile.length + column; const mappedB = mappedA + 1; const mappedC = (firstRow + 1) * profile.length + column; const mappedD = mappedC + 1;
      indices[offset++] = mappedA; indices[offset++] = mappedB; indices[offset++] = mappedC; indices[offset++] = mappedB; indices[offset++] = mappedD; indices[offset++] = mappedC;
      }
    }
    return Object.freeze({ positions, indices });
  };
  const surface = Math.max(0, profile.findIndex((candidate, index) => index > 0 && options.lateral <= candidate.lateral) - 1);
  const lower = profile[surface]; const upper = profile[Math.min(profile.length - 1, surface + 1)];
  const amount = (options.lateral - lower.lateral) / (upper.lateral - lower.lateral || 1);
  const point = { lateral: lower.lateral + (upper.lateral - lower.lateral) * amount, height: lower.height + (upper.height - lower.height) * amount };
  const normal = normalize({ x: 0, y: upper.lateral - lower.lateral, z: -(upper.height - lower.height) });
  const start = { x: -0.05 * 20, y: point.height + normal.y * MARBLE_DIAMETER / 2 + 0.02, z: point.lateral + normal.z * MARBLE_DIAMETER / 2 };
  const steps = Math.ceil(0.2 * 20 / options.speed / (1 / 240)) + 8;
  const run = (rows: readonly number[], flags = 0): Readonly<{ velocity: Vec3; position: Vec3 }> => {
    const world = createTrackPhysicsWorld({ x: 0, y: -16, z: 0 });
    world.timestep = 1 / 240;
    const mesh = makeMesh(rows);
    const trackBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    world.createCollider(rapier.ColliderDesc.trimesh(mesh.positions, mesh.indices, flags).setFriction(FRICTION).setRestitution(RESTITUTION), trackBody);
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z));
    body.enableCcd(true);
    world.createCollider(rapier.ColliderDesc.ball(MARBLE_DIAMETER / 2).setFriction(FRICTION).setRestitution(RESTITUTION), body);
    body.setLinvel({ x: options.speed, y: 0, z: 0 }, true);
    let seamVelocity: Vec3 | undefined;
    for (let step = 0; step < steps; step += 1) {
      world.step();
      if (seamVelocity === undefined && body.translation().x >= 0) seamVelocity = toVec3(body.linvel());
    }
    const result = Object.freeze({ velocity: seamVelocity ?? toVec3(body.linvel()), position: toVec3(body.translation()) });
    world.free();
    return result;
  };
  // The welded panel shares the middle seam row; the control is a single endpoint-to-endpoint span.
  const welded = run([-10, 0, 10], rapier.TriMeshFlags.FIX_INTERNAL_EDGES);
  const control = run([-10, 10]);
  const normalDelta = Math.abs(dot(subtract(welded.velocity, control.velocity), normal));
  const forwardLoss = Math.max(0, control.velocity.x - welded.velocity.x) / options.speed;
  const escaped = ![welded.position.x, welded.position.y, welded.position.z, welded.velocity.x, welded.velocity.y, welded.velocity.z].every(Number.isFinite)
    || Math.abs(welded.position.z) > CHANNEL_WIDTH / 2 - MARBLE_DIAMETER / 2
    || welded.position.y < -MARBLE_DIAMETER;
  return Object.freeze({ maxNormalVelocityDelta: normalDelta, maxForwardLossRatio: forwardLoss, escapes: escaped ? 1 : 0 });
};

export const runModularCurveProbe = async ({ track, speed, lateral }: CurveProbeOptions): Promise<CurveProbeResult> => {
  await initializeTrackPhysics();
  const built = buildModularTrack(track);
  const curveCell = built.route.route.find((step) => built.track.cells[step.cellIndex]?.kind === "curve")!.cellIndex;
  const rows = built.samples.filter((sample) => sample.cellIndex === curveCell);
  const entry = rows.find((sample) => sample.localU === 0.1)!;
  const exit = rows.find((sample) => sample.localU === 0.9)!;
  const world = createTrackPhysicsWorld();
  const resources = createModularPhysics(world, built);
  try {
    const profile = profileAt(CHANNEL_WIDTH);
    const surface = Math.max(0, profile.findIndex((candidate, index) => index > 0 && lateral <= candidate.lateral) - 1);
    const lower = profile[surface]!; const upper = profile[Math.min(profile.length - 1, surface + 1)]!;
    const amount = (lateral - lower.lateral) / (upper.lateral - lower.lateral || 1);
    const height = lower.height + (upper.height - lower.height) * amount;
    const normal = normalize(add(scale(entry.side, -(upper.height - lower.height)), scale(entry.up, upper.lateral - lower.lateral)));
    const position = add(entry.position, add(scale(entry.side, lateral), add(scale(entry.up, height), scale(normal, MARBLE_DIAMETER / 2 + 0.02))));
    const [body] = createMarbleBodies(world, [{ ...position, crossOffset: lateral, row: 0, column: 0, physicalLaunchPosition: true }]);
    body.setLinvel(scale(entry.tangent, speed), true);
    let escaped = false; let exited = false; let forwardSpeed = 0;
    for (let step = 0; step < 3 / TIMESTEP_SECONDS; step += 1) {
      resources.stepBeforeWorld(); world.step(); resources.stepAfterWorld([body]);
      const current = toVec3(body.translation()); const projection = projectToTrack(current, built.samples);
      if (distanceSquaredToSample(current, built.samples[projection.sampleIndex]) > 15 ** 2 && distanceSquaredToTrackSegments(current, built.samples) > 15 ** 2) { escaped = true; break; }
      if ((built.samples[projection.sampleIndex]?.distance ?? -Infinity) >= exit.distance) {
        exited = true; forwardSpeed = dot(toVec3(body.linvel()), exit.tangent); break;
      }
    }
    return Object.freeze({ escaped, exited, forwardSpeed });
  } finally {
    resources.dispose(); world.free();
  }
};

export const runModularValidationRace = async (
  options: ModularValidationOptions,
): Promise<ModularValidationResult> => {
  if (!Number.isInteger(options.marbleCount) || options.marbleCount < 0 || options.marbleCount > 300) throw new Error("Modular validation supports 0 through 300 marbles.");
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 0) throw new Error("Modular validation duration must be a finite non-negative number.");
  await initializeTrackPhysics();
  const built = buildModularTrack(options.track);
  const world = createTrackPhysicsWorld();
  world.timestep = TIMESTEP_SECONDS;
  let resources: ModularPhysicsResources | undefined;
  try {
    resources = createModularPhysics(world, built);
    const bodies = createMarbleBodies(world, createModularLaunchPositions(options.marbleCount, built, options.seed));
    const stationaryMs = new Array<number>(bodies.length).fill(0);
    const finished = new Set<number>();
    const failed = new Set<number>();
    const finishOrder: number[] = [];
    const finishTimesMs: number[] = [];
    const escapes: ModularMarbleFailure[] = [];
    const stalls: ModularMarbleFailure[] = [];
    const nonFinite: ModularMarbleFailure[] = [];
    const boosterCapViolations: BoosterEvent[] = [];
    const sampleIndexes = new Array<number>(bodies.length).fill(0);
    const targetRaceSteps = Math.floor(options.durationSeconds / TIMESTEP_SECONDS);
    const maxSteps = targetRaceSteps + Math.ceil(1 / TIMESTEP_SECONDS);
    let postGateSteps = 0; let rushActive = false; let rushPulseSteps = 0; let rushPulseCount = 0;
    for (let step = 1; postGateSteps < targetRaceSteps && step <= maxSteps; step += 1) {
      const pose = resources.stepBeforeWorld();
      world.step();
      const events = resources.stepAfterWorld(bodies);
      boosterCapViolations.push(...events.filter((event) => event.afterForwardSpeed > event.beforeForwardSpeed && event.afterForwardSpeed > MAX_BOOSTER_SPEED));
      if (pose.gateOpen) postGateSteps += 1;
      const raceElapsedMs = postGateSteps * TIMESTEP_SECONDS * 1_000;

      for (let index = 0; index < bodies.length; index += 1) {
        const marbleId = index + 1;
        if (finished.has(marbleId) || failed.has(marbleId)) continue;
        const body = bodies[index];
        const position = toVec3(body.translation());
        const velocity = toVec3(body.linvel());
        if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z].every(Number.isFinite)) {
          nonFinite.push({ seed: options.seed, marbleId, elapsedMs: raceElapsedMs, position, velocity, nearestSampleIndex: -1, category: "non-finite" });
          failed.add(marbleId);
          continue;
        }
        const projection = projectToTrack(position, built.samples);
        sampleIndexes[index] = projection.sampleIndex;
        const nearestSample = built.samples[projection.sampleIndex];
        if (distanceSquaredToSample(position, nearestSample) > 15 ** 2 && distanceSquaredToTrackSegments(position, built.samples) > 15 ** 2) {
          escapes.push({ seed: options.seed, marbleId, elapsedMs: raceElapsedMs, position, velocity, nearestSampleIndex: projection.sampleIndex, category: "escape" });
          failed.add(marbleId);
          continue;
        }
        stationaryMs[index] = pose.gateOpen && speed(velocity) < 0.12
          ? stationaryMs[index] + TIMESTEP_SECONDS * 1_000
          : 0;
        if (stationaryMs[index] >= 3_000) {
          stalls.push({ seed: options.seed, marbleId, elapsedMs: raceElapsedMs, position, velocity, nearestSampleIndex: projection.sampleIndex, category: "stall" });
          failed.add(marbleId);
          continue;
        }
        if (projection.progress >= 0.995 && insideFinishVolume(position, built.samples[built.samples.length - 1])) {
          finishOrder.push(marbleId);
          finishTimesMs.push(raceElapsedMs);
          finished.add(marbleId);
          body.setEnabled(false);
        }
      }
      if (options.rush && !rushActive && pose.gateOpen && shouldStartRaceRush(bodies.length - finished.size - failed.size, bodies.length)) rushActive = true;
      if (rushActive && ++rushPulseSteps >= 60) {
        rushPulseSteps = 0; rushPulseCount += 1;
        applyRaceRushPulse(bodies.map((body, index) => ({ id: index + 1, done: finished.has(index + 1) || failed.has(index + 1), eliminated: failed.has(index + 1), position: toVec3(body.translation()), sampleIndex: sampleIndexes[index]!, body })), built.samples);
      }
      if (step % 120 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (finished.size + failed.size === bodies.length) break;
    }
    return Object.freeze({
      seed: options.seed,
      finishOrder: Object.freeze(finishOrder),
      finishTimesMs: Object.freeze(finishTimesMs),
      rushPulseCount,
      escapes: Object.freeze(escapes),
      stalls: Object.freeze(stalls),
      nonFinite: Object.freeze(nonFinite),
      boosterCapViolations: Object.freeze(boosterCapViolations),
    });
  } finally {
    resources?.dispose();
    world.free();
  }
};
