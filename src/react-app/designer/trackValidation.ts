import {
  portsFor,
  type Direction,
  type ModuleKind,
  type Rotation,
  type TrackCell,
  type TrackDesign,
} from "./trackDesign";

export type RouteFailure = Readonly<{
  code: "endpoint" | "off-board" | "gap" | "connector" | "upward" | "loop" | "branch" | "finish-entry" | "orphan";
  cellIndex: number;
  message: string;
}>;
export type RouteStep = Readonly<{ cellIndex: number; entry?: Direction; exit?: Direction }>;
export type ValidRoute = Readonly<{
  ok: true;
  route: readonly RouteStep[];
  directionByCell: ReadonlyMap<number, Direction>;
}>;
export type RouteResult = ValidRoute | Readonly<{ ok: false; failures: readonly RouteFailure[] }>;
export type DesignValidation = Readonly<{ ok: boolean; failures: readonly RouteFailure[] }>;

const COLUMNS = 5;
const ROWS = 8;
const CELL_COUNT = COLUMNS * ROWS;
const MODULE_KINDS: readonly ModuleKind[] = ["straight", "curve", "funnel", "wave", "pinwheel", "booster", "bumper"];
const CELL_KEYS = ["kind", "rotation"] as const;
const opposite = (direction: Direction): Direction => ({ north: "south", east: "west", south: "north", west: "east" }[direction] as Direction);
const delta: Readonly<Record<Direction, readonly [number, number]>> = {
  north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1],
};
const failure = (code: RouteFailure["code"], cellIndex: number, message: string): RouteFailure =>
  Object.freeze({ code, cellIndex, message });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isDirection = (value: unknown): value is Direction => value === "north" || value === "east" || value === "south" || value === "west";
const isRotation = (value: unknown): value is Rotation => value === 0 || value === 1 || value === 2 || value === 3;
const hasOnlyCellKeys = (cell: Record<string, unknown>): boolean => {
  const keys = Object.keys(cell);
  return keys.length === CELL_KEYS.length && CELL_KEYS.every((key) => keys.includes(key));
};

const validCell = (cell: unknown, index: number): boolean => {
  if (cell === null) return true;
  if (!isObject(cell) || !hasOnlyCellKeys(cell) || !isRotation(cell.rotation)) return false;
  if (cell.kind === "start" || cell.kind === "finish") return cell.rotation === 0 && (index === 0 || index === 39);
  return typeof cell.kind === "string" && MODULE_KINDS.includes(cell.kind as ModuleKind);
};

const occupied = (cell: TrackCell | undefined): boolean => cell !== null && cell !== undefined;

export const resolveRoute = (cells: readonly TrackCell[]): RouteResult => {
  const failures: RouteFailure[] = [];
  const route: RouteStep[] = [{ cellIndex: 0, exit: "east" }];
  const directions = new Map<number, Direction>([[0, "east"]]);
  const visited = new Set<number>([0]);

  if (!Array.isArray(cells) || cells.length !== CELL_COUNT) {
    return { ok: false, failures: [failure("endpoint", -1, `Track must contain exactly ${CELL_COUNT} cells.`)] };
  }
  if (!isObject(cells[0]) || cells[0].kind !== "start" || cells[0].rotation !== 0) {
    failures.push(failure("endpoint", 0, "Cell 0 must be the fixed east-facing start."));
  }
  if (!isObject(cells[39]) || cells[39].kind !== "finish" || cells[39].rotation !== 0) {
    failures.push(failure("endpoint", 39, "Cell 39 must be the fixed west-facing finish."));
  }
  if (failures.length > 0) return { ok: false, failures };

  let current = 0;
  let exit: Direction = "east";
  while (current !== 39) {
    if (!isDirection(exit)) {
      failures.push(failure("connector", current, "Route exit is not a direction."));
      break;
    }
    if ((exit as Direction) === "north") {
      failures.push(failure("upward", current, "Route traversal may not move upward."));
      break;
    }
    const [rowDelta, columnDelta] = delta[exit];
    const row = Math.floor(current / COLUMNS) + rowDelta;
    const column = current % COLUMNS + columnDelta;
    if (row < 0 || row >= ROWS || column < 0 || column >= COLUMNS) {
      failures.push(failure("off-board", current, "Route output leaves the board."));
      break;
    }
    const next = row * COLUMNS + column;
    if (cells[next] === null) {
      failures.push(failure("gap", next, "Route output enters an empty cell."));
      break;
    }
    if (visited.has(next)) {
      failures.push(failure("loop", next, "Route revisits a cell."));
      break;
    }

    const entry = opposite(exit);
    const nextPorts = portsFor(cells[next]);
    if (next === 39 && entry !== "west") {
      failures.push(failure("finish-entry", next, "Finish must be entered from the west."));
      visited.add(next);
      route.push({ cellIndex: next, entry });
      break;
    }
    if (!nextPorts.includes(entry)) {
      failures.push(failure("connector", next, "Adjacent module connectors do not match."));
      break;
    }
    if (next === 39) {
      visited.add(next);
      route.push({ cellIndex: next, entry });
      directions.set(next, entry);
      break;
    }
    if (nextPorts.length > 2) {
      failures.push(failure("branch", next, "A module may expose at most two route connections."));
      break;
    }
    if (nextPorts.length !== 2) {
      failures.push(failure("connector", next, "A traversed module must expose exactly two route connections."));
      break;
    }
    const exits = nextPorts.filter((port) => port !== entry);
    if (exits.length !== 1) {
      failures.push(failure("branch", next, "A module must have one unambiguous route output."));
      break;
    }
    exit = exits[0];
    if (exit === "north") {
      failures.push(failure("upward", next, "Route traversal may not move upward."));
      visited.add(next);
      route.push({ cellIndex: next, entry, exit });
      directions.set(next, exit);
      break;
    }
    current = next;
    visited.add(current);
    route.push({ cellIndex: current, entry, exit });
    directions.set(current, exit);
  }

  for (let index = 0; index < cells.length; index += 1) {
    if (occupied(cells[index]) && !visited.has(index)) {
      failures.push(failure("orphan", index, "Occupied cell is not part of the start-to-finish route."));
    }
  }
  const occupiedCount = cells.filter(occupied).length;
  if (failures.length > 0 || visited.size !== occupiedCount || !visited.has(39)) {
    if (failures.length === 0) failures.push(failure("orphan", -1, "Route does not visit every occupied cell."));
    return { ok: false, failures };
  }
  return { ok: true, route, directionByCell: directions };
};

export const validateTrackDesign = (track: TrackDesign): DesignValidation => {
  const failures: RouteFailure[] = [];
  if (!isObject(track) || typeof track.name !== "string") {
    failures.push(failure("endpoint", -1, "Track name must be a string."));
  } else if (track.name !== track.name.trim() || [...track.name].length < 1 || [...track.name].length > 60 || /[\u0000-\u001f\u007f-\u009f]/u.test(track.name)) {
    failures.push(failure("endpoint", -1, "Track name must be 1–60 trimmed characters without control characters."));
  }
  const cells = isObject(track) && Array.isArray(track.cells) ? track.cells : undefined;
  if (cells === undefined || cells.length !== CELL_COUNT) {
    failures.push(failure("endpoint", -1, `Track must contain exactly ${CELL_COUNT} cells.`));
    return { ok: false, failures };
  }
  for (let index = 0; index < cells.length; index += 1) {
    if (!validCell(cells[index], index)) failures.push(failure("connector", index, "Cell has an unknown kind, orientation, or field set."));
  }
  const route = resolveRoute(cells);
  if (!route.ok) failures.push(...route.failures);
  return { ok: failures.length === 0, failures: Object.freeze(failures) };
};

export const assertValidTrackDesign = (track: TrackDesign): ValidRoute => {
  const validation = validateTrackDesign(track);
  if (!validation.ok) throw new Error(validation.failures.map(({ message }) => message).join(" "));
  const route = resolveRoute(track.cells);
  if (!route.ok) throw new Error(route.failures.map(({ message }) => message).join(" "));
  return route;
};
