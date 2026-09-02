import type { LaunchSlot, TrackNode, TrackSpec, TrackZone } from "./trackTypes";

const HORIZONTAL_SCALE = 0.5;
const WIDTH_SCALE = 0.5;
const DOWNHILL_GRADE = 0.245;
const INITIAL_A_HEIGHT = 28;
type RawNode = Readonly<{
  id: string;
  checkpoint: TrackNode["checkpoint"];
  level: TrackNode["level"];
  x: number;
  z: number;
  width: number;
  channelDepth: number;
  zone: TrackZone;
}>;

const rawNode = (id: string, checkpoint: TrackNode["checkpoint"], level: TrackNode["level"], x: number, z: number, width: number, channelDepth: number, zone: TrackZone): RawNode =>
  Object.freeze({ id, checkpoint, level, x, z, width, channelDepth, zone });

const buildNodes = (source: readonly RawNode[]): readonly TrackNode[] => {
  let previous: { x: number; y: number; z: number } | undefined;

  return Object.freeze(source.map((entry) => {
    const x = entry.x * HORIZONTAL_SCALE;
    const z = entry.z * HORIZONTAL_SCALE;
    const y = previous === undefined
      ? INITIAL_A_HEIGHT
      : previous.y - Math.hypot(x - previous.x, z - previous.z) * DOWNHILL_GRADE;
    previous = { x, y, z };

    return Object.freeze({
      id: entry.id,
      ...(entry.checkpoint === undefined ? {} : { checkpoint: entry.checkpoint }),
      ...(entry.level === undefined ? {} : { level: entry.level }),
      position: Object.freeze({ x, y, z }),
      width: entry.zone === "launch" ? Math.max(entry.width, 18) : entry.width * WIDTH_SCALE,
      channelDepth: Math.max(entry.channelDepth, 4),
      bankRadians: 0,
      zone: entry.zone,
    });
  }));
};

// Guide nodes round hairpins without adding checkpoints.
const nodes: readonly TrackNode[] = buildNodes([
  rawNode("A", "A", 3, 0, 72, 18, 2.8, "launch"), rawNode("1", "1", 3, -30, 72, 16, 2.6, "launch"),
  rawNode("2", "2", 3, -34, 34, 12, 2.3, "run"), rawNode("3", "3", 3, 30, 26, 12, 2.3, "run"),
  rawNode("4", "4", 3, 31, -34, 12, 2.4, "run"), rawNode("4-bend-entry", undefined, undefined, 42, -39, 12, 2.5, "run"),
  rawNode("4-bend", undefined, undefined, 51, -32, 12, 2.5, "run"), rawNode("4-bend-sweep", undefined, undefined, 51, -20, 12, 2.5, "run"),
  rawNode("4-drop", undefined, undefined, 40, 5, 13, 2.6, "descent"), rawNode("5", "5", 2, 27, 7, 13, 2.5, "run"),
  rawNode("6", "6", 2, -7, 5, 16, 2.7, "mixing-hall"), rawNode("7", "7", 2, -25, 15, 13, 2.5, "run"),
  rawNode("8", "8", 2, -24, 48, 12, 2.4, "run"), rawNode("8-drop-entry", undefined, undefined, -22, 61, 12, 2.5, "run"),
  rawNode("8-drop-crown", undefined, undefined, -13, 71, 12, 2.5, "run"), rawNode("8-drop-sweep", undefined, undefined, 1, 75, 12, 2.5, "run"),
  rawNode("8-drop-exit", undefined, undefined, 12, 68, 12, 2.5, "run"), rawNode("8-drop", undefined, undefined, 14, 56, 12, 2.5, "descent"),
  rawNode("9", "9", 1, -6, 35, 12, 2.4, "run"), rawNode("9-return-entry", undefined, undefined, -20, 25, 12, 2.4, "run"),
  rawNode("9-return-sweep", undefined, undefined, -24, 12, 12, 2.4, "run"), rawNode("9-return-turn", undefined, undefined, -15, 2, 12, 2.4, "run"),
  rawNode("9-return-exit", undefined, undefined, -5, -3, 12, 2.4, "run"), rawNode("9-return", undefined, undefined, 6, -1, 12, 2.4, "run"),
  rawNode("9-return-final-sweep", undefined, undefined, 13, 6, 12, 2.4, "run"), rawNode("10", "10", 1, 14, 21, 16, 2.7, "mixing-hall"),
  rawNode("10-exit", undefined, undefined, 16, 36, 13, 2.5, "run"), rawNode("10-sweep", undefined, undefined, 30, 48, 13, 2.5, "run"),
  rawNode("10-bend", undefined, undefined, 45, 42, 13, 2.5, "run"), rawNode("10-return-entry", undefined, undefined, 54, 27, 12, 2.4, "run"),
  rawNode("10-return-apex", undefined, undefined, 54, 10, 12, 2.4, "run"), rawNode("10-return-sweep", undefined, undefined, 46, -5, 12, 2.4, "run"),
  rawNode("10-return-exit", undefined, undefined, 30, -12, 12, 2.4, "run"), rawNode("10-return", undefined, undefined, 16, -7, 12, 2.4, "run"),
  rawNode("11", "11", 1, 5, 48, 12, 2.4, "run"), rawNode("12", "12", 1, -4, 64, 14, 2.6, "finish"),
]);

const cloneNode = (source: TrackNode): TrackNode => Object.freeze({ ...source, position: Object.freeze({ ...source.position }) });

export const createLuckyRollTrackSpec = (options: { features?: boolean } = {}): TrackSpec => {
  const features = options.features ?? false; void features;
  return Object.freeze({ nodes: Object.freeze(nodes.map(cloneNode)), sampleSpacing: 0.5, profileSegments: 8 });
};

export const createLaunchSlots = (count = 100): readonly LaunchSlot[] => {
  const columnSpacing = 1.8;
  const rowSpacing = 1.2;
  const centerZ = 72 * HORIZONTAL_SCALE;
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 10); const column = index % 10; const crossOffset = (column - 4.5) * columnSpacing;
    return Object.freeze({ x: (row - 4.5) * rowSpacing, y: 28, z: centerZ + crossOffset, crossOffset, row, column });
  }));
};
