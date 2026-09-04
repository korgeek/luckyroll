import type { TrackDesign, ModuleKind, Direction } from "../../designer/trackDesign";
import type { ValidRoute } from "../../designer/trackValidation";
import type { Vec3 } from "../track/trackTypes";
import {
  CHANNEL_WIDTH,
  LANDING_LENGTH,
  MARBLE_DIAMETER,
  MAX_CURVE_BANK,
  MODULE_SIZE,
  RAIL_HEIGHT,
  ROUTE_GRADE,
  START_LENGTH,
  type ModulePathSample,
  type ModulePort,
} from "./modularTypes";
import { profileNormalsAt } from "./moduleGeometry";

export * from "./modularTypes";

const MIN_CHORD_ERROR = MARBLE_DIAMETER * 0.02;
const MAX_TURN = 2 * Math.PI / 180;
const HALF_SIZE = MODULE_SIZE / 2;
const INTERIOR_LENGTH = MODULE_SIZE * 0.8;
const MIN_FUNNEL_WIDTH = 9.6;
const COLUMNS = 5;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, amount: number): Vec3 => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
  const magnitude = length(a);
  if (magnitude === 0) throw new Error("A modular path cannot contain a zero-length tangent.");
  return scale(a, 1 / magnitude);
};
const lerp = (a: Vec3, b: Vec3, amount: number): Vec3 => add(a, scale(subtract(b, a), amount));
const freeze = <T extends object>(value: T): T => Object.freeze(value);

const directionVector: Readonly<Record<Direction, Vec3>> = {
  north: { x: 0, y: 0, z: -1 },
  east: { x: 1, y: 0, z: 0 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
};
const opposite = (direction: Direction): Direction => ({
  north: "south", east: "west", south: "north", west: "east",
}[direction] as Direction);

const cellPortPosition = (cellIndex: number, direction: Direction): Vec3 => {
  const row = Math.floor(cellIndex / COLUMNS);
  const column = cellIndex % COLUMNS;
  const center = { x: (column + 0.5) * MODULE_SIZE, y: 0, z: (row + 0.5) * MODULE_SIZE };
  return add(center, scale(directionVector[direction], HALF_SIZE));
};

const quinticBasis = (t: number): readonly [number, number, number, number] => {
  const t2 = t * t; const t3 = t2 * t; const t4 = t3 * t; const t5 = t4 * t;
  return [1 - 10 * t3 + 15 * t4 - 6 * t5, t - 6 * t3 + 8 * t4 - 3 * t5, 10 * t3 - 15 * t4 + 6 * t5, -4 * t3 + 7 * t4 - 3 * t5];
};
const quintic = (p0: number, p1: number, d0: number, d1: number, t: number): number => {
  const [h00, h10, h01, h11] = quinticBasis(t);
  return p0 * h00 + d0 * h10 + p1 * h01 + d1 * h11;
};
const quinticDerivative = (p0: number, p1: number, d0: number, d1: number, t: number): number => {
  const t2 = t * t; const t3 = t2 * t; const t4 = t3 * t;
  return p0 * (-30 * t2 + 60 * t3 - 30 * t4) + d0 * (1 - 18 * t2 + 32 * t3 - 15 * t4)
    + p1 * (30 * t2 - 60 * t3 + 30 * t4) + d1 * (-12 * t2 + 28 * t3 - 15 * t4);
};
const quinticSecondDerivative = (p0: number, p1: number, d0: number, d1: number, t: number): number => {
  const t2 = t * t; const t3 = t2 * t;
  return p0 * (-60 * t + 180 * t2 - 120 * t3) + d0 * (-36 * t + 96 * t2 - 60 * t3)
    + p1 * (60 * t - 180 * t2 + 120 * t3) + d1 * (-24 * t + 84 * t2 - 60 * t3);
};

const waveOffsetAt = (localU: number): number => {
  if (localU <= 0.1 || localU >= 0.9) return 0;
  const u = (localU - 0.1) / 0.8;
  return 0.15 * CHANNEL_WIDTH * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
};
const waveOffsetFirst = (localU: number): number => {
  if (localU <= 0.1 || localU >= 0.9) return 0;
  const u = (localU - 0.1) / 0.8;
  const sin2 = Math.sin(2 * Math.PI * u);
  return 0.15 * CHANNEL_WIDTH / 0.8 * (2 * Math.PI * Math.cos(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2 + Math.PI * sin2 ** 2);
};
const waveOffsetSecond = (localU: number): number => {
  if (localU <= 0.1 || localU >= 0.9) return 0;
  const u = (localU - 0.1) / 0.8;
  const sin2 = Math.sin(2 * Math.PI * u);
  return 0.15 * CHANNEL_WIDTH / 0.8 ** 2 * (-4 * Math.PI ** 2 * sin2 * Math.sin(Math.PI * u) ** 2 + 6 * Math.PI ** 2 * sin2 * Math.cos(2 * Math.PI * u));
};

/** Wave displacement in board-local lateral units. */
export const waveOffset = waveOffsetAt;

const funnelSmoothStep = (t: number): number => 6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3;
export const moduleWidthAt = (kind: ModuleKind, localU: number): number => {
  if (kind !== "funnel") return CHANNEL_WIDTH;
  const u = clamp(localU, 0, 1);
  if (u <= 0.1 || u >= 0.9) return CHANNEL_WIDTH;
  const interior = (u - 0.1) / 0.8;
  const taper = 0.4375;
  if (interior <= taper) return CHANNEL_WIDTH - (CHANNEL_WIDTH - MIN_FUNNEL_WIDTH) * funnelSmoothStep(interior / taper);
  if (interior >= 1 - taper) return CHANNEL_WIDTH - (CHANNEL_WIDTH - MIN_FUNNEL_WIDTH) * funnelSmoothStep((1 - interior) / taper);
  return MIN_FUNNEL_WIDTH;
};

type AnalyticPoint = Readonly<{ position: Vec3; derivative: Vec3; secondDerivative: Vec3 }>;
type CellPath = Readonly<{ pointAt: (localU: number) => AnalyticPoint; sideAt: (localU: number) => Vec3; entry: Direction; exit: Direction }>;

const curvature = (point: AnalyticPoint): Vec3 => {
  const speed = length(point.derivative);
  if (speed === 0) return { x: 0, y: 0, z: 0 };
  const acceleration = point.secondDerivative;
  const velocity = point.derivative;
  const speedSquared = speed * speed;
  return scale(subtract(scale(acceleration, speedSquared), scale(velocity, dot(velocity, acceleration))), 1 / speedSquared ** 2);
};

const makeCellPath = (kind: ModuleKind | "start" | "finish", entry: Direction, exit: Direction, cellIndex: number): CellPath => {
  const entryPort = cellPortPosition(cellIndex, entry);
  const exitPort = cellPortPosition(cellIndex, exit);
  const incoming = directionVector[opposite(entry)];
  const outgoing = directionVector[exit];
  const chord = normalize(subtract(exitPort, entryPort));
  const side = normalize({ x: -chord.z, y: 0, z: chord.x });
  const entrySide = normalize({ x: -incoming.z, y: 0, z: incoming.x });
  const exitSide = normalize({ x: -outgoing.z, y: 0, z: outgoing.x });
  const sideAngle = Math.atan2(entrySide.x * exitSide.z - entrySide.z * exitSide.x, entrySide.x * exitSide.x + entrySide.z * exitSide.z);
  const curveSideAt = (localU: number): Vec3 => {
    if (kind !== "curve") return side;
    if (localU <= 0.1) return entrySide;
    if (localU >= 0.9) return exitSide;
    const amount = clamp((localU - 0.1) / 0.8, 0, 1);
    const angle = sideAngle * amount;
    return { x: entrySide.x * Math.cos(angle) - entrySide.z * Math.sin(angle), y: 0, z: entrySide.x * Math.sin(angle) + entrySide.z * Math.cos(angle) };
  };

  if (kind === "curve") {
    const p0 = add(entryPort, scale(incoming, LANDING_LENGTH));
    const p1 = add(exitPort, scale(outgoing, -LANDING_LENGTH));
    const d0 = scale(incoming, INTERIOR_LENGTH);
    const d1 = scale(outgoing, INTERIOR_LENGTH);
    const coordinate = (point: Vec3, derivative: Vec3, secondDerivative: Vec3): AnalyticPoint => ({
      position: point, derivative, secondDerivative,
    });
    return {
      entry,
      exit,
      sideAt: curveSideAt,
      pointAt(localU) {
        if (localU <= 0.1) return coordinate(add(entryPort, scale(incoming, MODULE_SIZE * localU)), incoming, { x: 0, y: 0, z: 0 });
        if (localU >= 0.9) return coordinate(add(exitPort, scale(outgoing, MODULE_SIZE * (localU - 1))), outgoing, { x: 0, y: 0, z: 0 });
        const t = (localU - 0.1) / 0.8;
        const position = {
          x: quintic(p0.x, p1.x, d0.x, d1.x, t), y: quintic(p0.y, p1.y, d0.y, d1.y, t), z: quintic(p0.z, p1.z, d0.z, d1.z, t),
        };
        const derivative = scale({
          x: quinticDerivative(p0.x, p1.x, d0.x, d1.x, t), y: quinticDerivative(p0.y, p1.y, d0.y, d1.y, t), z: quinticDerivative(p0.z, p1.z, d0.z, d1.z, t),
        }, 1 / 0.8);
        const secondDerivative = scale({
          x: quinticSecondDerivative(p0.x, p1.x, d0.x, d1.x, t), y: quinticSecondDerivative(p0.y, p1.y, d0.y, d1.y, t), z: quinticSecondDerivative(p0.z, p1.z, d0.z, d1.z, t),
        }, 1 / 0.8 ** 2);
        return coordinate(position, derivative, secondDerivative);
      },
    };
  }

  return {
    entry,
    exit,
    sideAt: () => side,
    pointAt(localU) {
      const offset = kind === "wave" ? waveOffsetAt(localU) : 0;
      const firstOffset = kind === "wave" ? waveOffsetFirst(localU) : 0;
      const secondOffset = kind === "wave" ? waveOffsetSecond(localU) : 0;
      return {
        position: add(add(entryPort, scale(chord, MODULE_SIZE * localU)), scale(side, offset)),
        derivative: add(scale(chord, MODULE_SIZE), scale(side, firstOffset)),
        secondDerivative: scale(side, secondOffset),
      };
    },
  };
};

const gradeFrame = (planarTangent: Vec3, planarSide: Vec3, bankRadians: number) => {
  const tangent = normalize({
    x: planarTangent.x * Math.cos(ROUTE_GRADE),
    y: -Math.sin(ROUTE_GRADE),
    z: planarTangent.z * Math.cos(ROUTE_GRADE),
  });
  const flatSide = normalize(subtract(planarSide, scale(planarTangent, dot(planarSide, planarTangent))));
  const flatUp = normalize(cross(flatSide, tangent));
  const side = normalize(add(scale(flatSide, Math.cos(bankRadians)), scale(flatUp, -Math.sin(bankRadians))));
  return { tangent, side, up: normalize(cross(side, tangent)) };
};

const bankAt = (kind: ModuleKind | "start" | "finish", localU: number, signedCurvature: number): number => {
  if (kind !== "curve" || localU <= 0.1 || localU >= 0.9) return 0;
  const t = (localU - 0.1) / 0.8;
  return Math.sign(signedCurvature) * MAX_CURVE_BANK * Math.sin(Math.PI * t) ** 2;
};

const surfaceTurnExceeds = (path: CellPath, kind: ModuleKind | "start" | "finish", start: number, middle: number, end: number, widthAt: (localU: number) => number): boolean => {
  const rows = [start, middle, end].map((localU) => {
    const point = path.pointAt(localU);
    const planarTangent = normalize({ x: point.derivative.x, y: 0, z: point.derivative.z });
    const planarSide = path.sideAt(localU);
    const frame = gradeFrame(planarTangent, planarSide, bankAt(kind, localU, dot(curvature(point), planarSide)));
    return profileNormalsAt(frame, widthAt(localU));
  });
  for (let column = 0; column < rows[0].length; column += 1) {
    if (turnBetween(rows[0][column], rows[1][column]) > MAX_TURN
      || turnBetween(rows[1][column], rows[2][column]) > MAX_TURN
      || turnBetween(rows[0][column], rows[2][column]) > MAX_TURN) return true;
  }
  return false;
};

const turnBetween = (a: Vec3, b: Vec3): number => Math.acos(clamp(dot(normalize(a), normalize(b)), -1, 1));
const chordError = (a: Vec3, b: Vec3, midpoint: Vec3): number => length(subtract(midpoint, lerp(a, b, 0.5)));
const adaptiveParameters = (
  path: CellPath,
  kind: ModuleKind | "start" | "finish",
  widthAt: (localU: number) => number,
): readonly Readonly<{ localU: number; chordError: number }>[] => {
  const output = new Map<number, number>();
  const visit = (start: number, end: number, depth: number): void => {
    const first = path.pointAt(start);
    const last = path.pointAt(end);
    const middleU = (start + end) / 2;
    const middle = path.pointAt(middleU);
    const quarterStartU = (start + middleU) / 2;
    const quarterEndU = (middleU + end) / 2;
    const startWidth = widthAt(start);
    const endWidth = widthAt(end);
    const profileAt = (localU: number): number => startWidth + (endWidth - startWidth) * ((localU - start) / (end - start));
    const profileError = Math.max(
      Math.abs(widthAt(quarterStartU) - profileAt(quarterStartU)),
      Math.abs(widthAt(middleU) - profileAt(middleU)),
      Math.abs(widthAt(quarterEndU) - profileAt(quarterEndU)),
    );
    const needsSplit = depth < 14 && (profileError > MIN_CHORD_ERROR
      || chordError(first.position, last.position, middle.position) > MIN_CHORD_ERROR
      || turnBetween(first.derivative, last.derivative) > MAX_TURN
      || turnBetween(first.derivative, middle.derivative) > MAX_TURN
      || turnBetween(middle.derivative, last.derivative) > MAX_TURN
      || surfaceTurnExceeds(path, kind, start, middleU, end, widthAt));
    if (needsSplit) {
      visit(start, middleU, depth + 1);
      visit(middleU, end, depth + 1);
    } else {
      const acceptedError = chordError(first.position, last.position, middle.position);
      output.set(start, Math.max(output.get(start) ?? 0, acceptedError));
      output.set(end, Math.max(output.get(end) ?? 0, acceptedError));
    }
  };
  const seeds = kind === "funnel" ? [0, 0.1, 0.45, 0.5, 0.55, 0.9, 1] : [0, 0.1, 0.9, 1];
  for (let index = 0; index < seeds.length - 1; index += 1) visit(seeds[index], seeds[index + 1], 0);
  return [...output.entries()].sort(([left], [right]) => left - right).map(([localU, acceptedError]) => ({ localU, chordError: acceptedError }));
};

const createPort = (cellIndex: number, direction: Direction, clearWidth: number, position: Vec3, outwardTangent: Vec3): ModulePort => freeze({
  cellIndex,
  direction,
  position,
  outwardTangent: freeze(outwardTangent),
  curvature: freeze({ x: 0, y: 0, z: 0 }),
  floorHeight: position.y,
  clearWidth,
  railHeight: RAIL_HEIGHT,
});

export const sampleModulePath = (track: TrackDesign, route: ValidRoute): readonly ModulePathSample[] => {
  const result: ModulePathSample[] = [];
  let planarDistance = 0;
  for (let routeIndex = 0; routeIndex < route.route.length; routeIndex += 1) {
    const step = route.route[routeIndex];
    const cell = track.cells[step.cellIndex];
    if (cell === null || cell === undefined || step.exit === "north") throw new Error("Cannot sample an invalid modular route.");
    const entry = step.entry ?? opposite(step.exit ?? "west");
    const exit = step.exit ?? opposite(step.entry ?? "east");
    const path = makeCellPath(cell.kind, entry, exit, step.cellIndex);
    const widthAt = (localU: number): number => cell.kind === "funnel" ? moduleWidthAt(cell.kind, localU) : CHANNEL_WIDTH;
    const parameters = adaptiveParameters(path, cell.kind, widthAt);
    for (const parameter of parameters) {
      const localU = parameter.localU;
      const analytic = path.pointAt(localU);
      const previous = result[result.length - 1];
      if (previous !== undefined) planarDistance += Math.hypot(analytic.position.x - previous.position.x, analytic.position.z - previous.position.z);
      const planarTangent = normalize({ x: analytic.derivative.x, y: 0, z: analytic.derivative.z });
      const planarSide = path.sideAt(localU);
      const centerlineCurvature = curvature(analytic);
      const bankRadians = bankAt(cell.kind, localU, dot(centerlineCurvature, planarSide));
      const { tangent, side, up } = gradeFrame(planarTangent, planarSide, bankRadians);
      const position = freeze({ x: analytic.position.x, y: -planarDistance * Math.tan(ROUTE_GRADE), z: analytic.position.z });
      const isPort = (localU === 0 && (step.entry !== undefined || routeIndex === 0))
        || (localU === 1 && (step.exit !== undefined || routeIndex === route.route.length - 1));
      const port = isPort
        ? createPort(
          step.cellIndex,
          localU === 0 ? entry : exit,
          widthAt(localU),
          routeIndex > 0 && localU === 0 && previous !== undefined ? previous.position : position,
          localU === 0 ? scale(tangent, -1) : tangent,
        )
        : undefined;
      if (routeIndex > 0 && localU === 0) {
        const previous = result[result.length - 1];
        if (previous === undefined || port === undefined) throw new Error("A modular seam is missing its reciprocal port.");
        const previousPorts = previous.ports === undefined ? (previous.port === undefined ? [] : [previous.port]) : previous.ports;
        result[result.length - 1] = freeze({ ...previous, ports: freeze([...previousPorts, port]) });
        continue;
      }
      result.push(freeze({
        index: result.length,
        distance: planarDistance / Math.cos(ROUTE_GRADE),
        position,
        tangent: freeze(tangent),
        side: freeze(side),
        up: freeze(up),
        width: widthAt(localU),
        channelDepth: RAIL_HEIGHT,
        bankRadians,
        zone: cell.kind === "start" ? "launch" : cell.kind === "finish" ? "finish" : "run",
        cellIndex: step.cellIndex,
        localU,
        chordError: parameter.chordError,
        centerlineCurvature: freeze(scale(centerlineCurvature, Math.cos(ROUTE_GRADE) ** 2)),
        ...(port === undefined ? {} : { port, ports: freeze([port]) }),
      }));
    }
  }
  return Object.freeze(result);
};

export const createStartExtensionSamples = (samples: readonly ModulePathSample[]): readonly ModulePathSample[] => {
  const first = samples[0];
  if (first === undefined) throw new Error("A start extension requires a sampled route.");
  const start = Object.freeze({
    ...first,
    index: -1,
    distance: first.distance - START_LENGTH,
    position: Object.freeze({
      x: first.position.x - first.tangent.x * START_LENGTH,
      y: first.position.y - first.tangent.y * START_LENGTH,
      z: first.position.z - first.tangent.z * START_LENGTH,
    }),
    localU: -START_LENGTH / MODULE_SIZE,
    width: CHANNEL_WIDTH,
    bankRadians: 0,
    centerlineCurvature: Object.freeze({ x: 0, y: 0, z: 0 }),
    chordError: 0,
    port: undefined,
    ports: undefined,
  });
  return Object.freeze([start, ...samples]);
};
