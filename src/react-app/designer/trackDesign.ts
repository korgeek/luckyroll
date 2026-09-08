export type Direction = "north" | "east" | "south" | "west";
export type Rotation = 0 | 1 | 2 | 3;
export type ModuleKind = "straight" | "curve" | "funnel" | "wave" | "pinwheel" | "booster" | "bumper";

export type TrackCell =
  | null
  | Readonly<{ kind: "start" | "finish"; rotation: 0 }>
  | Readonly<{ kind: ModuleKind; rotation: Rotation }>;
export type TrackDesign = Readonly<{ name: string; cells: readonly TrackCell[] }>;
export type SharedTrack = Readonly<{ version: 1; name: string; cells: readonly TrackCell[] }>;
export type LocalTrack = Readonly<{ id: string; name: string; cells: readonly TrackCell[]; updatedAt: number }>;
export type TrackLibrary = Readonly<{ version: 1; tracks: readonly LocalTrack[] }>;
export type RaceCourseSelection =
  | Readonly<{ kind: "builtin" }>
  | Readonly<{ kind: "custom"; track: TrackDesign }>;

const STRAIGHT_FAMILY: readonly ModuleKind[] = ["straight", "funnel", "wave", "pinwheel", "booster", "bumper"];
const frozenCell = <T extends TrackCell>(cell: T): T =>
  cell === null || Object.isFrozen(cell) ? cell : Object.freeze(cell);
const frozenCells = (cells: readonly TrackCell[]): readonly TrackCell[] =>
  Object.freeze(cells.map(frozenCell));
const normalizedName = (name: string): string => name.trim();

export const createEmptyTrackDesign = (name = ""): TrackDesign => {
  const cells: TrackCell[] = Array.from({ length: 40 }, () => null);
  cells[0] = { kind: "start", rotation: 0 };
  cells[39] = { kind: "finish", rotation: 0 };
  return Object.freeze({ name: normalizedName(name), cells: frozenCells(cells) });
};

export const createDefaultTrackDesign = (name = "New Track"): TrackDesign => Object.freeze({
  name: normalizedName(name),
  cells: frozenCells([
    { kind: "start", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "pinwheel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "curve", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "wave", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "booster", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "curve", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 2 },
    { kind: "curve", rotation: 1 }, { kind: "straight", rotation: 0 }, { kind: "funnel", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "curve", rotation: 3 },
    { kind: "straight", rotation: 1 }, null, null, null, null,
    { kind: "curve", rotation: 0 }, { kind: "booster", rotation: 0 }, { kind: "bumper", rotation: 0 }, { kind: "straight", rotation: 0 }, { kind: "finish", rotation: 0 },
  ]),
});

const ROTATED_PORTS: Readonly<Record<ModuleKind | "start" | "finish", readonly (readonly Direction[])[]>> = {
  start: [["east"]], finish: [["west"]],
  straight: [["west", "east"], ["north", "south"]],
  curve: [["north", "east"], ["east", "south"], ["south", "west"], ["west", "north"]],
  funnel: [["west", "east"], ["north", "south"]],
  wave: [["west", "east"], ["north", "south"]],
  pinwheel: [["west", "east"], ["north", "south"]],
  booster: [["west", "east"], ["north", "south"]],
  bumper: [["west", "east"], ["north", "south"]],
};

export const portsFor = (cell: TrackCell): readonly Direction[] => {
  if (cell === null || typeof cell !== "object") return [];
  const orientations = ROTATED_PORTS[cell.kind];
  if (orientations === undefined) return [];
  const rotation = STRAIGHT_FAMILY.includes(cell.kind as ModuleKind) ? cell.rotation % 2 : cell.rotation;
  return orientations[rotation] ?? [];
};

export const rotateEditableCell = (cell: TrackCell): TrackCell => {
  if (cell === null || cell.kind === "start" || cell.kind === "finish") return cell;
  const max = STRAIGHT_FAMILY.includes(cell.kind) ? 2 : 4;
  return frozenCell({ kind: cell.kind, rotation: ((cell.rotation + 1) % max) as Rotation });
};
