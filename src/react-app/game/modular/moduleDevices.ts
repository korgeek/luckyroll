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
const START_LENGTH = 10.2;
const START_WIDTH = 10.4;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
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
const cellSamples = (samples: readonly ModulePathSample[], cellIndex: number): readonly ModulePathSample[] => samples.filter((sample) => sample.cellIndex === cellIndex);
const travelFor = (route: ValidRoute, cellIndex: number): Direction | undefined => route.directionByCell.get(cellIndex);

export type BoosterTrigger = Readonly<{
  cellIndex: number;
  startDistance: number;
  endDistance: number;
  forward: Vec3;
  center: Vec3;
  side: Vec3;
  up: Vec3;
}>;

export type BumperBar = Readonly<{
  cellIndex: number;
  localU: number;
  center: Vec3;
  forward: Vec3;
  axis: Vec3;
  up: Vec3;
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
  start: ResolvedStart & Readonly<{
    gate: StartDeviceDescriptor;
    pusher: StartDeviceDescriptor & Readonly<{ endCenter: Vec3; durationMs: number }>;
    length: number;
    runoutLength: number;
    width: number;
  }>;
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
  pusherCenter: Vec3;
  pinwheelAngles: readonly number[];
}>;

export type StartDeviceDescriptor = Readonly<{
  center: Vec3;
  tangent: Vec3;
  side: Vec3;
  up: Vec3;
  width: number;
  height: number;
  depth: number;
}>;

export const resolveModulePreview = (_cell: Exclude<TrackCell, null>, travel?: Direction): ModulePreviewDescriptor => Object.freeze({
  ...(travel === undefined ? {} : { directionArrow: travel }),
  bumperOffsets: neutralBumperOffsets,
  collider: false as const,
});

type DeviceFrame = Readonly<{ position: Vec3; tangent: Vec3; side: Vec3; up: Vec3; distance: number }>;
const interpolate = (a: Vec3, b: Vec3, amount: number): Vec3 => normalize(add(a, scale({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, amount)));
const frameAtCellU = (samples: readonly ModulePathSample[], cellIndex: number, localU: number): DeviceFrame | undefined => {
  const rows = samples.filter((sample) => sample.cellIndex === cellIndex);
  const first = rows[0];
  if (first === undefined) return undefined;
  const lower = rows.reduce((candidate, sample) => sample.localU <= localU && sample.localU >= candidate.localU ? sample : candidate, first);
  const upper = rows.find((sample) => sample.localU >= localU) ?? rows[rows.length - 1];
  const span = upper.localU - lower.localU;
  const amount = span === 0 ? 0 : (localU - lower.localU) / span;
  return Object.freeze({
    position: add(lower.position, scale({ x: upper.position.x - lower.position.x, y: upper.position.y - lower.position.y, z: upper.position.z - lower.position.z }, amount)),
    tangent: interpolate(lower.tangent, upper.tangent, amount),
    side: interpolate(lower.side, upper.side, amount),
    up: interpolate(lower.up, upper.up, amount),
    distance: lower.distance + (upper.distance - lower.distance) * amount,
  });
};
const resolveBumpers = (cellIndex: number, samples: readonly ModulePathSample[]): readonly BumperBar[] => {
  const values: BumperBar[] = [];
  for (const [localU, sign] of [[0.35, -1], [0.5, 1], [0.65, -1]] as const) {
    const frame = frameAtCellU(samples, cellIndex, localU);
    if (frame === undefined) continue;
    const inward = scale(frame.side, -sign);
    const axis = rotate(inward, frame.tangent, BUMPER_TIP_ANGLE);
    const up = normalize(subtract(frame.up, scale(axis, frame.up.x * axis.x + frame.up.y * axis.y + frame.up.z * axis.z)));
    values.push(Object.freeze({
      cellIndex,
      localU,
      center: add(add(frame.position, scale(frame.side, sign * (CHANNEL_WIDTH / 2 - BUMPER_LENGTH / 2))), scale(frame.up, BUMPER_HEIGHT / 2)),
      forward: frame.tangent,
      axis,
      up,
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
  const startFrame = Object.freeze({ ...frameFromSample(first), position: add(first.position, scale(first.tangent, -START_LENGTH)) });
  const gateFrame = Object.freeze({
    center: add(add(startFrame.position, scale(startFrame.tangent, 9.4)), scale(startFrame.up, 1.24 / 2)),
    tangent: startFrame.tangent, side: startFrame.side, up: startFrame.up,
    width: START_WIDTH, height: 1.24, depth: 0.36,
  });
  const pusher = Object.freeze({
    center: add(startFrame.position, scale(startFrame.up, 1.6)),
    endCenter: add(add(startFrame.position, scale(startFrame.tangent, 8.8)), scale(startFrame.up, 1.6)),
    tangent: startFrame.tangent, side: startFrame.side, up: startFrame.up,
    width: CHANNEL_WIDTH - MARBLE_DIAMETER, height: 3.2, depth: 0.36, durationMs: 650,
  });
  const start = Object.freeze({ frame: startFrame, gate: gateFrame, pusher, length: START_LENGTH, runoutLength: START_LENGTH + 20, width: START_WIDTH, radius: START_WIDTH / 2, shuffleMs: 700, wallHeight: 4 });
  const boosters: BoosterTrigger[] = [];
  const bumpers: BumperBar[] = [];
  const pinwheels: PinwheelLayout[] = [];
  for (const step of route.route) {
    const cell = track.cells[step.cellIndex];
    const travel = travelFor(route, step.cellIndex);
    if (cell === null || cell === undefined || travel === undefined) continue;
    const middle = frameAtCellU(samples, step.cellIndex, 0.5);
    if (middle === undefined) continue;
    if (cell.kind === "booster") {
      const firstRow = cellSamples(samples, step.cellIndex)[0] ?? middle;
      const cellStartDistance = firstRow.distance - firstRow.localU * MODULE_SIZE;
      const startDistance = cellStartDistance + MODULE_SIZE * 0.4;
      boosters.push(Object.freeze({ cellIndex: step.cellIndex, startDistance, endDistance: cellStartDistance + MODULE_SIZE * 0.6, forward: middle.tangent, center: middle.position, side: middle.side, up: middle.up }));
    } else if (cell.kind === "bumper") {
      bumpers.push(...resolveBumpers(step.cellIndex, samples));
    } else if (cell.kind === "pinwheel") {
      pinwheels.push(Object.freeze({
        cellIndex: step.cellIndex,
        center: add(middle.position, scale(middle.up, PINWHEEL_ARM_THICKNESS / 2)),
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
