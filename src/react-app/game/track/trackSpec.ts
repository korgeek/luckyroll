import type { LaunchSlot, TrackNode, TrackSpec, TrackZone } from "./trackTypes";

const node = (
  id: string,
  checkpoint: TrackNode["checkpoint"],
  level: TrackNode["level"],
  x: number,
  y: number,
  z: number,
  width: number,
  channelDepth: number,
  zone: TrackZone,
): TrackNode =>
  Object.freeze({
    id,
    ...(checkpoint === undefined ? {} : { checkpoint }),
    ...(level === undefined ? {} : { level }),
    position: Object.freeze({ x, y, z }),
    width,
    channelDepth,
    bankRadians: 0,
    zone,
  });

// Guide nodes round hairpins without adding checkpoints.
const nodes: readonly TrackNode[] = [
  node("A", "A", 3, 0, 28.0, 72, 18, 2.8, "launch"),
  node("1", "1", 3, -30, 27.2, 72, 16, 2.6, "launch"),
  node("2", "2", 3, -34, 25.9, 34, 12, 2.3, "run"),
  node("3", "3", 3, 30, 24.5, 26, 12, 2.3, "run"),
  node("4", "4", 3, 31, 22.8, -34, 12, 2.4, "run"),
  node("4-bend-entry", undefined, undefined, 42, 22.4, -39, 12, 2.5, "run"),
  node("4-bend", undefined, undefined, 51, 22.0, -32, 12, 2.5, "run"),
  node("4-bend-sweep", undefined, undefined, 51, 21.5, -20, 12, 2.5, "run"),
  node("4-drop", undefined, undefined, 40, 17.5, 5, 13, 2.6, "descent"),
  node("5", "5", 2, 27, 16.8, 7, 13, 2.5, "run"),
  node("6", "6", 2, -7, 15.5, 5, 16, 2.7, "mixing-hall"),
  node("7", "7", 2, -25, 14.2, 15, 13, 2.5, "run"),
  node("8", "8", 2, -24, 12.6, 48, 12, 2.4, "run"),
  node("8-drop-entry", undefined, undefined, -22, 12.2, 61, 12, 2.5, "run"),
  node("8-drop-crown", undefined, undefined, -13, 11.8, 71, 12, 2.5, "run"),
  node("8-drop-sweep", undefined, undefined, 1, 11.4, 75, 12, 2.5, "run"),
  node("8-drop-exit", undefined, undefined, 12, 11.0, 68, 12, 2.5, "run"),
  node("8-drop", undefined, undefined, 14, 10.6, 56, 12, 2.5, "descent"),
  node("9", "9", 1, -6, 8.291448637818334, 35, 12, 2.4, "run"),
  node("9-return-entry", undefined, undefined, -20, 7.89144863781833, 25, 12, 2.4, "run"),
  node("9-return-sweep", undefined, undefined, -24, 7.591448637818324, 12, 12, 2.4, "run"),
  node("9-return-turn", undefined, undefined, -15, 7.291448637818321, 2, 12, 2.4, "run"),
  node("9-return-exit", undefined, undefined, -5, 6.991448637818316, -3, 12, 2.4, "run"),
  node("9-return", undefined, undefined, 6, 6.841448637818314, -1, 12, 2.4, "run"),
  node("9-return-final-sweep", undefined, undefined, 13, 6.741448637818314, 6, 12, 2.4, "run"),
  node("10", "10", 1, 14, 6.691448637818314, 21, 16, 2.7, "mixing-hall"),
  node("10-exit", undefined, undefined, 16, 4.667713357827932, 36, 13, 2.5, "run"),
  node("10-sweep", undefined, undefined, 30, 4.467713357827932, 48, 13, 2.5, "run"),
  node("10-bend", undefined, undefined, 45, 4.267713357827933, 42, 13, 2.5, "run"),
  node("10-return-entry", undefined, undefined, 54, 3.8677133578279337, 27, 12, 2.4, "run"),
  node("10-return-apex", undefined, undefined, 54, 3.3677133578279337, 10, 12, 2.4, "run"),
  node("10-return-sweep", undefined, undefined, 46, 2.8677133578279337, -5, 12, 2.4, "run"),
  node("10-return-exit", undefined, undefined, 30, 2.467713357827934, -12, 12, 2.4, "run"),
  node("10-return", undefined, undefined, 16, -0.2696304014326657, -7, 12, 2.4, "run"),
  node("11", "11", 1, 5, -0.569630401432664, 48, 12, 2.4, "run"),
  node("12", "12", 1, -4, -2.16963040143266, 64, 14, 2.6, "finish"),
];

const cloneNode = (source: TrackNode): TrackNode =>
  Object.freeze({
    ...source,
    position: Object.freeze({ ...source.position }),
  });

export const createLuckyRollTrackSpec = (
  options: { features?: boolean } = {},
): TrackSpec => {
  const features = options.features ?? false;
  void features;

  return Object.freeze({
    nodes: Object.freeze(nodes.map(cloneNode)),
    sampleSpacing: 1,
    profileSegments: 8,
  });
};

export const createLaunchSlots = (count = 100): readonly LaunchSlot[] => {
  const columnSpacing = 1.8;
  const rowSpacing = 1.2;
  const centerZ = 72;

  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / 10);
      const column = index % 10;
      const crossOffset = (column - 4.5) * columnSpacing;

      return Object.freeze({
        x: (row - 4.5) * rowSpacing,
        y: 28,
        z: centerZ + crossOffset,
        crossOffset,
        row,
        column,
      });
    }),
  );
};
