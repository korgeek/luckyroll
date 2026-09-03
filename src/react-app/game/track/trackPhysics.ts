import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import { buildValidatedTrack } from "./trackBuild";
import { buildObstacleGeometry } from "./obstacleGeometry";
import { createBowlLaunchPositions, createObstaclePhysics } from "./obstaclePhysics";
import { createLaunchSlots } from "./trackSpec";
import { projectToTrack } from "./trackSampler";
import type { LaunchSlot, PhysicalLaunchPosition, TrackFeatureLayout, TrackGeometry, TrackSample, Vec3 } from "./trackTypes";

const GRAVITY = { x: 0, y: -16, z: 0 };
const TIMESTEP_SECONDS = 1 / 60;
const MARBLE_RADIUS = 0.34;
const LAUNCH_CLEARANCE = MARBLE_RADIUS + 0.21;
const MARBLE_RESTITUTION = 0.08;
const MARBLE_FRICTION = 0.24;
const LINEAR_DAMPING = 0.02;
const ANGULAR_DAMPING = 0.04;
const STALL_SPEED = 0.12;
const STALL_DURATION_MS = 3_000;
// The tuned containment rims are at most 14.2 units from their centerline.
// 15 units leaves rim contact valid while detecting a body outside the channel.
const ESCAPE_RADIUS = 15;
const FINISH_PROGRESS = 0.995;

type RapierModule = typeof RAPIER_TYPE;
type RapierWorld = InstanceType<RapierModule["World"]>;
type RapierBody = ReturnType<RapierWorld["createRigidBody"]>;
type RapierCollider = ReturnType<RapierWorld["createCollider"]>;

export type TrackColliderResources = Readonly<{
  body: RapierBody;
  outer: RapierCollider;
  divider?: RapierCollider;
}>;

export type MarbleFailure = Readonly<{
  seed: number;
  marbleId: number;
  elapsedMs: number;
  position: Vec3;
  velocity: Vec3;
  nearestSampleIndex: number;
  category: "escape" | "stall";
}>;

export type ValidationRaceResult = Readonly<{
  seed: number;
  finishOrder: readonly number[];
  finishTimesMs: readonly number[];
  escapes: readonly MarbleFailure[];
  stalls: readonly MarbleFailure[];
}>;

export type ValidationRaceOptions = Readonly<{
  seed: number;
  marbleCount: number;
  durationSeconds: number;
  features?: boolean;
  featureLayout?: TrackFeatureLayout;
}>;

export const FIXED_VALIDATION_SEEDS = Object.freeze([11, 23, 37, 41, 53, 67, 71, 83, 97, 101]);

let rapier: RapierModule | undefined;
let initialized: Promise<RapierModule> | undefined;

export const initializeTrackPhysics = (): Promise<RapierModule> => {
  initialized ??= import("@dimforge/rapier3d-compat/rapier.es.js").then(async ({ default: loaded }) => {
    await loaded.init();
    rapier = loaded;
    return loaded;
  });
  return initialized;
};

export const getInitializedTrackPhysicsRapier = (): RapierModule => {
  if (rapier === undefined) {
    throw new Error("Rapier must be initialized before creating track physics bodies.");
  }
  return rapier;
};

export const createTrackPhysicsWorld = (gravity: Vec3 = GRAVITY): RapierWorld =>
  new (getInitializedTrackPhysicsRapier()).World(gravity);

const toVec3 = (value: { x: number; y: number; z: number }): Vec3 => ({
  x: value.x,
  y: value.y,
  z: value.z,
});

export const speed = (velocity: Vec3): number => Math.hypot(velocity.x, velocity.y, velocity.z);

export const distanceSquaredToSample = (position: Vec3, sample: TrackSample): number => {
  const x = position.x - sample.position.x;
  const y = position.y - sample.position.y;
  const z = position.z - sample.position.z;
  return x * x + y * y + z * z;
};

export const insideFinishVolume = (position: Vec3, finish: TrackSample): boolean =>
  Math.hypot(position.x - finish.position.x, position.z - finish.position.z) <= 4 &&
  position.y >= finish.position.y &&
  position.y <= finish.position.y + finish.channelDepth * 2;

export const createTrackCollider = (
  world: RapierWorld,
  geometry: TrackGeometry,
): TrackColliderResources => {
  const module = getInitializedTrackPhysicsRapier();
  const body = world.createRigidBody(module.RigidBodyDesc.fixed());
  const outer = world.createCollider(module.ColliderDesc.trimesh(geometry.positions, geometry.indices)
    .setFriction(MARBLE_FRICTION)
    .setRestitution(MARBLE_RESTITUTION), body);
  const divider = geometry.featureIndices.length === 0
    ? undefined
    : world.createCollider(module.ColliderDesc.trimesh(geometry.featurePositions, geometry.featureIndices)
      .setFriction(MARBLE_FRICTION)
      .setRestitution(MARBLE_RESTITUTION), body);
  return Object.freeze({ body, outer, ...(divider === undefined ? {} : { divider }) });
};

export const createMarbleBodies = (
  world: RapierWorld,
  positions: readonly PhysicalLaunchPosition[],
): readonly RapierBody[] => {
  return positions.map((position) => {
    const module = getInitializedTrackPhysicsRapier();
    const body = world.createRigidBody(
      module.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING),
    );
    const collider = module.ColliderDesc.ball(MARBLE_RADIUS)
      .setRestitution(MARBLE_RESTITUTION)
      .setFriction(MARBLE_FRICTION);
    world.createCollider(collider, body);
    return body;
  });
};

const subtract = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const cross = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length === 0 ? { x: 0, y: 1, z: 0 } : {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

const vertexAt = (geometry: TrackGeometry, row: number, column: number): Vec3 => {
  const offset = (row * (geometry.profileSegments + 1) + column) * 3;
  return {
    x: geometry.positions[offset],
    y: geometry.positions[offset + 1],
    z: geometry.positions[offset + 2],
  };
};

const deterministicJitter = (seed: number, row: number, column: number): number => {
  let value = (seed >>> 0) ^ Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(column + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff - 0.5;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const profileSegmentAt = (sample: TrackSample, profileSegments: number, lateral: number): number => {
  const offsets = Array.from({ length: profileSegments + 1 }, (_, column) =>
    Math.sin(-Math.PI / 2 + Math.PI * column / profileSegments) * sample.width / 2,
  );
  return Math.min(profileSegments - 1, Math.max(0, offsets.findIndex((offset, index) =>
    index > 0 && lateral <= offset,
  ) - 1));
};

export const launchPositionsFor = (
  slots: readonly LaunchSlot[],
  geometry: TrackGeometry,
  seed = 0,
): readonly PhysicalLaunchPosition[] =>
  slots.map((slot) => {
    const row = Math.min(geometry.samples.length - 2, slot.row * 2);
    const launchSample = geometry.samples[row];
    const lateral = clamp(
      slot.crossOffset + deterministicJitter(seed, slot.row, slot.column) * 0.12,
      -launchSample.width / 2 + MARBLE_RADIUS,
      launchSample.width / 2 - MARBLE_RADIUS,
    );
    const column = profileSegmentAt(launchSample, geometry.profileSegments, lateral);
    const lower = vertexAt(geometry, row, column);
    const upper = vertexAt(geometry, row, column + 1);
    const nextLower = vertexAt(geometry, row + 1, column);
    const profileOffset = Math.sin(-Math.PI / 2 + Math.PI * column / geometry.profileSegments) * launchSample.width / 2;
    const nextProfileOffset = Math.sin(-Math.PI / 2 + Math.PI * (column + 1) / geometry.profileSegments) * launchSample.width / 2;
    const interpolation = (lateral - profileOffset) / (nextProfileOffset - profileOffset);
    const surface = {
      x: lower.x + (upper.x - lower.x) * interpolation,
      y: lower.y + (upper.y - lower.y) * interpolation,
      z: lower.z + (upper.z - lower.z) * interpolation,
    };
    let normal = normalize(cross(subtract(upper, lower), subtract(nextLower, lower)));
    if (normal.y < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z };

    return {
      x: surface.x + normal.x * LAUNCH_CLEARANCE,
      y: surface.y + normal.y * LAUNCH_CLEARANCE,
      z: surface.z + normal.z * LAUNCH_CLEARANCE,
      crossOffset: lateral,
      row: slot.row,
      column: slot.column,
      physicalLaunchPosition: true,
    };
  });

export const runValidationRace = async (
  options: ValidationRaceOptions,
): Promise<ValidationRaceResult> => {
  await initializeTrackPhysics();
  const built = buildValidatedTrack({ features: options.features ?? false, featureLayout: options.featureLayout });
  const world = createTrackPhysicsWorld();
  world.timestep = TIMESTEP_SECONDS;
  createTrackCollider(world, built.geometry);
  const bodies = createMarbleBodies(
    world,
    launchPositionsFor(createLaunchSlots(options.marbleCount), built.geometry, options.seed),
  );
  const stationaryMs = new Array<number>(bodies.length).fill(0);
  const finished = new Set<number>();
  const failed = new Set<number>();
  const finishOrder: number[] = [];
  const finishTimesMs: number[] = [];
  const escapes: MarbleFailure[] = [];
  const stalls: MarbleFailure[] = [];
  const durationSteps = Math.floor(options.durationSeconds / TIMESTEP_SECONDS);

  for (let step = 1; step <= durationSteps; step += 1) {
    world.step();
    const elapsedMs = step * TIMESTEP_SECONDS * 1_000;

    for (let index = 0; index < bodies.length; index += 1) {
      const marbleId = index + 1;
      if (finished.has(marbleId) || failed.has(marbleId)) {
        continue;
      }

      const body = bodies[index];
      const position = toVec3(body.translation());
      const projection = projectToTrack(position, built.samples);
      const nearestSample = built.samples[projection.sampleIndex];

      if (distanceSquaredToSample(position, nearestSample) > ESCAPE_RADIUS ** 2) {
        escapes.push({
          seed: options.seed,
          marbleId,
          elapsedMs,
          position,
          velocity: toVec3(body.linvel()),
          nearestSampleIndex: projection.sampleIndex,
          category: "escape",
        });
        failed.add(marbleId);
        continue;
      }

      stationaryMs[index] = speed(toVec3(body.linvel())) < STALL_SPEED
        ? stationaryMs[index] + TIMESTEP_SECONDS * 1_000
        : 0;
      if (stationaryMs[index] >= STALL_DURATION_MS) {
        stalls.push({
          seed: options.seed,
          marbleId,
          elapsedMs,
          position,
          velocity: toVec3(body.linvel()),
          nearestSampleIndex: projection.sampleIndex,
          category: "stall",
        });
        failed.add(marbleId);
        continue;
      }

      if (projection.progress >= FINISH_PROGRESS && insideFinishVolume(position, built.samples[built.samples.length - 1])) {
        finishOrder.push(marbleId);
        finishTimesMs.push(elapsedMs);
        finished.add(marbleId);
        body.setEnabled(false);
      }
    }

    if (finished.size + failed.size === bodies.length) {
      break;
    }
  }

  world.free();
  return Object.freeze({
    seed: options.seed,
    finishOrder: Object.freeze(finishOrder),
    finishTimesMs: Object.freeze(finishTimesMs),
    escapes: Object.freeze(escapes),
    stalls: Object.freeze(stalls),
  });
};

export const runValidationSuite = async (
  options: Readonly<{ features?: boolean }> = {},
): Promise<readonly ValidationRaceResult[]> => {
  const results: ValidationRaceResult[] = [];
  for (const seed of FIXED_VALIDATION_SEEDS) {
    results.push(await runValidationRace({
      seed,
      marbleCount: 100,
      durationSeconds: 60,
      features: options.features ?? false,
    }));
  }
  return Object.freeze(results);
};

export const runObstacleValidationRace = async (options: Readonly<{ seed: number; durationSeconds: number }>): Promise<ValidationRaceResult> => {
  await initializeTrackPhysics();
  const built = buildValidatedTrack({ features: true });
  const world = createTrackPhysicsWorld();
  world.timestep = TIMESTEP_SECONDS;
  createTrackCollider(world, built.geometry);
  const obstacles = createObstaclePhysics(world, buildObstacleGeometry(built.geometry, built.obstacleLayout));
  const bodies = createMarbleBodies(world, createBowlLaunchPositions(100, built.obstacleLayout.start, options.seed));
  const stationaryMs = new Array<number>(bodies.length).fill(0);
  const finished = new Set<number>(); const failed = new Set<number>(); const finishOrder: number[] = []; const finishTimesMs: number[] = [];
  const escapes: MarbleFailure[] = []; const stalls: MarbleFailure[] = [];
  const durationSteps = Math.floor(options.durationSeconds / TIMESTEP_SECONDS);
  let raceElapsedMs = 0;
  try {
    for (let step = 1; step <= durationSteps; step += 1) {
      const pose = obstacles.stepFixed();
      world.step();
      if (pose.raceClockStarted) raceElapsedMs += TIMESTEP_SECONDS * 1_000;
      for (let index = 0; index < bodies.length; index += 1) {
        const marbleId = index + 1;
        if (finished.has(marbleId) || failed.has(marbleId)) continue;
        const body = bodies[index]; const position = toVec3(body.translation()); const projection = projectToTrack(position, built.samples); const nearestSample = built.samples[projection.sampleIndex];
        if (distanceSquaredToSample(position, nearestSample) > ESCAPE_RADIUS ** 2) {
          escapes.push({ seed: options.seed, marbleId, elapsedMs: raceElapsedMs, position, velocity: toVec3(body.linvel()), nearestSampleIndex: projection.sampleIndex, category: "escape" }); failed.add(marbleId); continue;
        }
        if (pose.raceClockStarted) {
          stationaryMs[index] = speed(toVec3(body.linvel())) < STALL_SPEED ? stationaryMs[index] + TIMESTEP_SECONDS * 1_000 : 0;
          if (stationaryMs[index] >= STALL_DURATION_MS) {
            stalls.push({ seed: options.seed, marbleId, elapsedMs: raceElapsedMs, position, velocity: toVec3(body.linvel()), nearestSampleIndex: projection.sampleIndex, category: "stall" }); failed.add(marbleId); continue;
          }
        }
        if (projection.progress >= FINISH_PROGRESS && insideFinishVolume(position, built.samples[built.samples.length - 1])) {
          finishOrder.push(marbleId); finishTimesMs.push(raceElapsedMs); finished.add(marbleId); body.setEnabled(false);
        }
      }
      if (finished.size + failed.size === bodies.length) break;
    }
  } finally {
    obstacles.dispose();
    world.free();
  }
  return Object.freeze({ seed: options.seed, finishOrder: Object.freeze(finishOrder), finishTimesMs: Object.freeze(finishTimesMs), escapes: Object.freeze(escapes), stalls: Object.freeze(stalls) });
};

export const validateObstacleQualificationSeeds = (seeds: readonly number[], recordedSeeds: readonly number[] = []): readonly number[] => {
  if (new Set(recordedSeeds).size !== recordedSeeds.length || recordedSeeds.some((seed, index) => seed !== FIXED_VALIDATION_SEEDS[index])) throw new Error("Obstacle qualification must use the ten fixed seeds exactly once in canonical order.");
  if (new Set(seeds).size !== seeds.length) throw new Error("Obstacle qualification seeds must be unique.");
  if (seeds.some((seed) => recordedSeeds.includes(seed))) throw new Error("Obstacle qualification ledger already records a requested seed; do not start another race.");
  const pending = FIXED_VALIDATION_SEEDS.slice(recordedSeeds.length);
  if (seeds.length !== pending.length || seeds.some((seed, index) => seed !== pending[index])) throw new Error("Obstacle qualification must use the ten fixed seeds exactly once in canonical order.");
  if (pending.length === 0) throw new Error("Obstacle qualification ledger already records every seed; do not start another race.");
  return Object.freeze([...seeds]);
};
