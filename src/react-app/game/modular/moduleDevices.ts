import type { Direction, TrackCell, TrackDesign } from "../../designer/trackDesign";
import type { ValidRoute } from "../../designer/trackValidation";
import type { ResolvedFrame, ResolvedStart, Vec3 } from "../track/trackTypes";
import { CHANNEL_PROFILE } from "./moduleGeometry";
import {
  CHANNEL_WIDTH,
  MARBLE_DIAMETER,
  MODULE_SIZE,
  type ModulePathSample,
} from "./modularTypes";

const BUMPER_HEIGHT = 1.4 * MARBLE_DIAMETER;
const ROUND_BUMPER_RADIUS = 0.75 * MARBLE_DIAMETER;
const BUMPER_PLACEMENTS = [[0.25, 0], [0.5, -1.2], [0.5, 1.2], [0.75, -2.4], [0.75, 0], [0.75, 2.4]] as const;
export const PINWHEEL_ARM_COUNT = 2;
const PINWHEEL_RADIUS = 4;
const PINWHEEL_ARM_THICKNESS = 0.5 * MARBLE_DIAMETER;
const PINWHEEL_ANGULAR_SPEED = 5;
const START_LENGTH = 10.2;
const START_WIDTH = 10.4;
const START_GATE_HEIGHT = 2.5;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, amount: number): Vec3 => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a.x, a.y, a.z);
  return length === 0 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / length);
};
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
  returnAssist: boolean;
  startDistance: number;
  endDistance: number;
  forward: Vec3;
  center: Vec3;
  side: Vec3;
  up: Vec3;
}>;

export type RoundBumper = Readonly<{
  shape: "round";
  cellIndex: number;
  localU: number;
  center: Vec3;
  forward: Vec3;
  up: Vec3;
  radius: number;
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

export type WaveLayout = Readonly<{ cellIndex: number; localU: number; center: Vec3; tangent: Vec3; side: Vec3; up: Vec3; radius: number; lateralRadius: number; height: number; inward: 1 | -1 }>;

export const createWaveGeometry = (wave: Pick<WaveLayout, "radius" | "lateralRadius" | "height" | "inward">): { positions: Float32Array; indices: Uint32Array } => {
  const centerOffset = 2.8;
  const wall = CHANNEL_PROFILE.filter(point => point.lateral >= CHANNEL_WIDTH * 0.275 && point.height <= wave.height);
  const last = wall[wall.length - 1]; const next = CHANNEL_PROFILE.find(point => point.lateral > 0 && point.height > wave.height)!;
  wall.push({ height: wave.height, lateral: last.lateral + (next.lateral - last.lateral) * (wave.height - last.height) / (next.height - last.height) });
  const positions: number[] = []; const indices: number[] = [];
  const front: number[][] = []; const back: number[][] = [];
  const vertex = (x: number, y: number, z: number) => { const index = positions.length / 3; positions.push(x, y, z); return index; };
  const quad = (a: number, b: number, c: number, d: number) => {
    for (const face of [[a, b, c], [b, d, c]]) if (new Set(face).size === 3) indices.push(...(wave.inward === 1 ? face : face.reverse()));
  };
  const stops = Array.from({ length: 65 }, (_, index) => index / 64); stops.splice(20, 0, 0.3);
  for (let row = 0; row < stops.length; row++) {
    const travel = 1 - stops[row];
    const amount = travel <= 0.7 ? travel / 0.7 : (1 - travel) / 0.3;
    const blend = amount * amount * (3 - 2 * amount);
    const z = wave.radius * (2 * stops[row] - 1); front.push([]); back.push([]);
    for (const point of wall) {
      const height = point.height * blend;
      const upper = wall.findIndex(sample => sample.height >= height);
      const left = wall[Math.max(0, upper - 1)]; const right = wall[upper];
      const lateral = left.lateral + (right.lateral - left.lateral) * (height - left.height) / (right.height - left.height || 1);
      const boundary = centerOffset - lateral;
      const face = boundary + (centerOffset - CHANNEL_WIDTH * 0.275 + wave.lateralRadius - boundary) * blend;
      const a = blend === 0 && front[row].length ? front[row][0] : vertex(wave.inward * face, height - wave.height / 2, z);
      front[row].push(a);
      back[row].push(blend === 0 ? a : vertex(wave.inward * boundary, height - wave.height / 2, z));
    }
    if (row === 0) continue;
    for (let column = 1; column < wall.length; column++) {
      quad(front[row - 1][column - 1], front[row - 1][column], front[row][column - 1], front[row][column]);
      quad(back[row - 1][column - 1], back[row][column - 1], back[row - 1][column], back[row][column]);
    }
    const top = wall.length - 1;
    quad(front[row - 1][top], back[row - 1][top], front[row][top], back[row][top]);
    quad(back[row - 1][0], front[row - 1][0], back[row][0], front[row][0]);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
};

export const createWaveVertices = (wave: WaveLayout): Float32Array => createWaveGeometry(wave).positions;

export type ModuleDevices = Readonly<{
  start: ResolvedStart & Readonly<{
    gate: StartDeviceDescriptor;
    pusher: StartDeviceDescriptor & Readonly<{ endCenter: Vec3; durationMs: number }>;
    length: number;
    runoutLength: number;
    width: number;
  }>;
  boosters: readonly BoosterTrigger[];
  bumpers: readonly RoundBumper[];
  pinwheels: readonly PinwheelLayout[];
  waves: readonly WaveLayout[];
}>;

export type ModulePreviewDescriptor = Readonly<{
  directionArrow?: Direction;
  bumperOffsets: readonly [number, number, number];
  collider: false;
}>;

const neutralBumperOffsets = Object.freeze([-2.4, 0, 2.4] as const);

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
const resolveBumpers = (cellIndex: number, samples: readonly ModulePathSample[]): readonly RoundBumper[] => {
  const values: RoundBumper[] = [];
  for (const [localU, lateral] of BUMPER_PLACEMENTS) {
    const frame = frameAtCellU(samples, cellIndex, localU);
    if (frame === undefined) continue;
    values.push(Object.freeze({
      shape: "round" as const, cellIndex, localU,
      center: add(add(frame.position, scale(frame.side, lateral)), scale(frame.up, BUMPER_HEIGHT / 2)),
      forward: frame.tangent, up: frame.up, radius: ROUND_BUMPER_RADIUS, height: BUMPER_HEIGHT,
      clearPassage: CHANNEL_WIDTH / 2 - Math.abs(lateral) - ROUND_BUMPER_RADIUS,
      distanceFromNearestSeam: Math.min(localU, 1 - localU) * MODULE_SIZE - ROUND_BUMPER_RADIUS,
    }));
  }
  return Object.freeze(values);
};

// Local +X is across the track; -Z is forward, matching the device frame.
export const createPusherVertices = ({ width, height, depth }: Pick<StartDeviceDescriptor, "width" | "height" | "depth">): Float32Array =>
  new Float32Array([-height / 2, height / 2].flatMap(y => [-width / 2, y, depth / 2, width / 2, y, depth / 2, 0, y, -depth / 2]));

export const resolveModuleDevices = (track: TrackDesign, route: ValidRoute, samples: readonly ModulePathSample[]): ModuleDevices => {
  const first = samples[0];
  if (first === undefined) throw new Error("A modular device layout requires a sampled route.");
  const startFrame = Object.freeze({ ...frameFromSample(first), position: add(first.position, scale(first.tangent, -START_LENGTH)) });
  const gateFrame = Object.freeze({
    center: add(add(startFrame.position, scale(startFrame.tangent, 9.4)), scale(startFrame.up, START_GATE_HEIGHT / 2)),
    tangent: startFrame.tangent, side: startFrame.side, up: startFrame.up,
    width: START_WIDTH, height: START_GATE_HEIGHT, depth: 0.36,
  });
  const pusher = Object.freeze({
    center: add(add(startFrame.position, scale(startFrame.tangent, -0.42)), scale(startFrame.up, 1.6)),
    endCenter: add(add(startFrame.position, scale(startFrame.tangent, 8.38)), scale(startFrame.up, 1.6)),
    tangent: startFrame.tangent, side: startFrame.side, up: startFrame.up,
    width: CHANNEL_WIDTH - MARBLE_DIAMETER, height: 3.2, depth: 1.2, durationMs: 650,
  });
  const start = Object.freeze({ frame: startFrame, gate: gateFrame, pusher, length: START_LENGTH, runoutLength: START_LENGTH + 20, width: START_WIDTH, radius: START_WIDTH / 2, shuffleMs: 700, wallHeight: 6 });
  const boosters: BoosterTrigger[] = [];
  const bumpers: RoundBumper[] = [];
  const pinwheels: PinwheelLayout[] = [];
  const waves: WaveLayout[] = [];
  for (const [routeIndex, step] of route.route.entries()) {
    const cell = track.cells[step.cellIndex];
    const travel = travelFor(route, step.cellIndex);
    if (cell === null || cell === undefined || travel === undefined) continue;
    const middle = frameAtCellU(samples, step.cellIndex, 0.5);
    if (middle === undefined) continue;
    if (cell.kind === "booster") {
      const firstRow = cellSamples(samples, step.cellIndex)[0] ?? middle;
      const cellStartDistance = firstRow.distance - firstRow.localU * MODULE_SIZE;
      const startDistance = cellStartDistance + MODULE_SIZE * 0.4;
      const nextCell = track.cells[route.route[routeIndex + 1]?.cellIndex ?? -1];
      boosters.push(Object.freeze({ cellIndex: step.cellIndex, returnAssist: nextCell?.kind === "bumper", startDistance, endDistance: cellStartDistance + MODULE_SIZE * 0.6, forward: middle.tangent, center: middle.position, side: middle.side, up: middle.up }));
    } else if (cell.kind === "bumper") {
      bumpers.push(...resolveBumpers(step.cellIndex, samples));
    } else if (cell.kind === "wave") {
      for (const [localU, inward] of [[0.22, 1], [0.78, -1]] as const) {
        const frame = frameAtCellU(samples, step.cellIndex, localU)!;
        waves.push(Object.freeze({ cellIndex: step.cellIndex, localU, inward, radius: 4, lateralRadius: 2.4, height: 4,
          center: add(add(frame.position, scale(frame.side, -inward * 2.8)), scale(frame.up, 2)),
          tangent: frame.tangent, side: frame.side, up: frame.up }));
      }
    } else if (cell.kind === "pinwheel") {
      pinwheels.push(Object.freeze({
        cellIndex: step.cellIndex,
        center: add(middle.position, scale(middle.up, PINWHEEL_ARM_THICKNESS / 2)),
        axis: middle.up,
        radius: PINWHEEL_RADIUS,
        armThickness: PINWHEEL_ARM_THICKNESS,
        angularSpeed: PINWHEEL_ANGULAR_SPEED,
        minimumPassage: CHANNEL_WIDTH - 2 * PINWHEEL_RADIUS,
      }));
    }
  }
  return Object.freeze({ start, boosters: Object.freeze(boosters), bumpers: Object.freeze(bumpers), pinwheels: Object.freeze(pinwheels), waves: Object.freeze(waves) });
};
