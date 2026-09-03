import type { Direction, TrackCell, TrackDesign } from "../../designer/trackDesign";
import type { ValidRoute } from "../../designer/trackValidation";
import type { ResolvedFrame, ResolvedStart, Vec3 } from "../track/trackTypes";
import {
  CHANNEL_WIDTH,
  LANDING_LENGTH,
  MARBLE_DIAMETER,
  MODULE_SIZE,
  type ModulePathSample,
} from "./modularTypes";

const BUMPER_LENGTH = 4;
const BUMPER_THICKNESS = 0.45 * MARBLE_DIAMETER;
const BUMPER_HEIGHT = 1.4 * MARBLE_DIAMETER;
const BUMPER_TIP_ANGLE = Math.PI / 6;
const PINWHEEL_RADIUS = 0.28 * CHANNEL_WIDTH;
const PINWHEEL_ARM_THICKNESS = 0.5 * MARBLE_DIAMETER;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, amount: number): Vec3 => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a.x, a.y, a.z);
  return length === 0 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / length);
};
const rotate = (a: Vec3, b: Vec3, angle: number): Vec3 => normalize(add(scale(a, Math.cos(angle)), scale(b, Math.sin(angle))));
const frameFromSample = (sample: ModulePathSample): ResolvedFrame => Object.freeze({
  sampleIndex: sample.index,
  position: sample.position,
  tangent: sample.tangent,
  side: sample.side,
  up: sample.up,
});
const nearestSample = (samples: readonly ModulePathSample[], cellIndex: number, localU: number): ModulePathSample | undefined => {
  const candidates = samples.filter((sample) => sample.cellIndex === cellIndex);
  return candidates.reduce<ModulePathSample | undefined>((best, sample) => best === undefined || Math.abs(sample.localU - localU) < Math.abs(best.localU - localU) ? sample : best, undefined);
};
const cellSamples = (samples: readonly ModulePathSample[], cellIndex: number): readonly ModulePathSample[] => samples.filter((sample) => sample.cellIndex === cellIndex);
const travelFor = (route: ValidRoute, cellIndex: number): Direction | undefined => route.directionByCell.get(cellIndex);

export type BoosterTrigger = Readonly<{
  cellIndex: number;
  startDistance: number;
  endDistance: number;
  forward: Vec3;
}>;

export type BumperBar = Readonly<{
  cellIndex: number;
  center: Vec3;
  forward: Vec3;
  axis: Vec3;
  tipDirection: Vec3;
  length: number;
  thickness: number;
  height: number;
  clearPassage: number;
  distanceFromNearestSeam: number;
}>;

export type PinwheelLayout = Readonly<{
  cellIndex: number;
  center: Vec3;
  axis: Vec3;
  radius: number;
  armThickness: number;
  angularSpeed: number;
  minimumPassage: number;
}>;

export type ModuleDevices = Readonly<{
  start: ResolvedStart;
  boosters: readonly BoosterTrigger[];
  bumpers: readonly BumperBar[];
  pinwheels: readonly PinwheelLayout[];
}>;

export type ModulePreviewDescriptor = Readonly<{
  directionArrow?: Direction;
  bumperOffsets: readonly [number, number, number];
  collider: false;
}>;

const neutralBumperOffsets = Object.freeze([-CHANNEL_WIDTH / 2 + BUMPER_LENGTH / 2, 0, CHANNEL_WIDTH / 2 - BUMPER_LENGTH / 2] as const);

export type ModularDevicePose = Readonly<{
  elapsedSeconds: number;
  gateOpen: boolean;
  agitatorAngle: number;
  pinwheelAngles: readonly number[];
}>;

export const resolveModulePreview = (_cell: Exclude<TrackCell, null>, travel?: Direction): ModulePreviewDescriptor => Object.freeze({
  ...(travel === undefined ? {} : { directionArrow: travel }),
  bumperOffsets: neutralBumperOffsets,
  collider: false as const,
});

const resolveBumpers = (cellIndex: number, samples: readonly ModulePathSample[], forward: Vec3): readonly BumperBar[] => {
  const values: BumperBar[] = [];
  for (const [localU, sign] of [[0.35, -1], [0.5, 1], [0.65, -1]] as const) {
    const sample = nearestSample(samples, cellIndex, localU);
    if (sample === undefined) continue;
    const inward = scale(sample.side, -sign);
    const axis = rotate(inward, forward, BUMPER_TIP_ANGLE);
    values.push(Object.freeze({
      cellIndex,
      center: add(add(sample.position, scale(sample.side, sign * (CHANNEL_WIDTH / 2 - BUMPER_LENGTH / 2))), scale(sample.up, BUMPER_HEIGHT / 2)),
      forward,
      axis,
      tipDirection: axis,
      length: BUMPER_LENGTH,
      thickness: BUMPER_THICKNESS,
      height: BUMPER_HEIGHT,
      clearPassage: CHANNEL_WIDTH - BUMPER_LENGTH * 2,
      distanceFromNearestSeam: Math.max(LANDING_LENGTH, Math.min(localU, 1 - localU) * MODULE_SIZE),
    }));
  }
  return Object.freeze(values);
};

export const resolveModuleDevices = (track: TrackDesign, route: ValidRoute, samples: readonly ModulePathSample[]): ModuleDevices => {
  const first = samples[0];
  if (first === undefined) throw new Error("A modular device layout requires a sampled route.");
  const start = Object.freeze({ frame: frameFromSample(first), radius: 8.5, shuffleMs: 700, wallHeight: 4 });
  const boosters: BoosterTrigger[] = [];
  const bumpers: BumperBar[] = [];
  const pinwheels: PinwheelLayout[] = [];
  for (const step of route.route) {
    const cell = track.cells[step.cellIndex];
    const travel = travelFor(route, step.cellIndex);
    if (cell === null || cell === undefined || travel === undefined) continue;
    const middle = nearestSample(samples, step.cellIndex, 0.5);
    if (middle === undefined) continue;
    if (cell.kind === "booster") {
      const startDistance = (cellSamples(samples, step.cellIndex)[0]?.distance ?? middle.distance) + MODULE_SIZE * 0.4;
      boosters.push(Object.freeze({ cellIndex: step.cellIndex, startDistance, endDistance: startDistance + MODULE_SIZE * 0.2, forward: middle.tangent }));
    } else if (cell.kind === "bumper") {
      bumpers.push(...resolveBumpers(step.cellIndex, samples, middle.tangent));
    } else if (cell.kind === "pinwheel") {
      pinwheels.push(Object.freeze({
        cellIndex: step.cellIndex,
        center: add(middle.position, scale(middle.up, PINWHEEL_ARM_THICKNESS)),
        axis: middle.up,
        radius: PINWHEEL_RADIUS,
        armThickness: PINWHEEL_ARM_THICKNESS,
        angularSpeed: 2,
        minimumPassage: 3 * MARBLE_DIAMETER,
      }));
    }
  }
  return Object.freeze({ start, boosters: Object.freeze(boosters), bumpers: Object.freeze(bumpers), pinwheels: Object.freeze(pinwheels) });
};
