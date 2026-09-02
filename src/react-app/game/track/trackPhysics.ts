import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import { buildValidatedTrack } from "./trackBuild";
import { createLaunchSlots } from "./trackSpec";
import { projectToTrack } from "./trackSampler";
import type { LaunchSlot, TrackGeometry, TrackSample, Vec3 } from "./trackTypes";

const GRAVITY = { x: 0, y: -16, z: 0 };
const TIMESTEP_SECONDS = 1 / 60;
const MARBLE_RADIUS = 0.34;
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

export type MarbleFailure = Readonly<{
  seed: number;
  marbleId: number;
  elapsedMs: number;
  position: Vec3;
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
}>;

let rapier: RapierModule | undefined;
let initialized: Promise<void> | undefined;

const initializeRapier = (): Promise<void> => {
  initialized ??= import("@dimforge/rapier3d-compat/rapier.es.js").then(async ({ default: loaded }) => {
    await loaded.init();
    rapier = loaded;
  });
  return initialized;
};

const getRapier = (): RapierModule => {
  if (rapier === undefined) {
    throw new Error("Rapier must be initialized before creating track physics bodies.");
  }
  return rapier;
};

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
): ReturnType<RapierWorld["createCollider"]> => {
  const module = getRapier();
  const body = world.createRigidBody(module.RigidBodyDesc.fixed());
  const collider = module.ColliderDesc.trimesh(geometry.positions, geometry.indices)
    .setFriction(MARBLE_FRICTION)
    .setRestitution(MARBLE_RESTITUTION);
  return world.createCollider(collider, body);
};

export const createMarbleBodies = (
  world: RapierWorld,
  slots: readonly LaunchSlot[],
  samples?: readonly TrackSample[],
): readonly RapierBody[] => {
  const positions = samples === undefined ? slots : launchPositionsFor(slots, samples);

  return slots.map((_slot, index) => {
    const position = positions[index];
    const module = getRapier();
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

export const launchPositionsFor = (
  slots: readonly LaunchSlot[],
  samples: readonly TrackSample[],
): readonly Vec3[] =>
  slots.map((slot) => {
    const launchSample = samples[Math.min(samples.length - 1, slot.row * 3)];
    const lateral = Math.max(-launchSample.width / 2, Math.min(launchSample.width / 2, slot.crossOffset));
    const profileAngle = Math.asin(lateral / (launchSample.width / 2));
    const profileLift = launchSample.channelDepth * (1 - Math.cos(profileAngle));

    return {
      x: launchSample.position.x + launchSample.side.x * lateral + launchSample.up.x * (profileLift + MARBLE_RADIUS),
      y: launchSample.position.y + launchSample.side.y * lateral + launchSample.up.y * (profileLift + MARBLE_RADIUS),
      z: launchSample.position.z + launchSample.side.z * lateral + launchSample.up.z * (profileLift + MARBLE_RADIUS),
    };
  });

const rotateSlots = (slots: readonly LaunchSlot[], seed: number): readonly LaunchSlot[] => {
  if (slots.length === 0) {
    return slots;
  }
  const offset = Math.abs(seed) % slots.length;
  return Array.from({ length: slots.length }, (_, index) => slots[(index + offset) % slots.length]);
};

export const runValidationRace = async (
  options: ValidationRaceOptions,
): Promise<ValidationRaceResult> => {
  await initializeRapier();
  const built = buildValidatedTrack();
  const module = getRapier();
  const world = new module.World(GRAVITY);
  world.timestep = TIMESTEP_SECONDS;
  createTrackCollider(world, built.geometry);
  const bodies = createMarbleBodies(
    world,
    rotateSlots(createLaunchSlots(options.marbleCount), options.seed),
    built.samples,
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
