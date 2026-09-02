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
  node("4-bend", undefined, undefined, 43, 21.0, -28, 12, 2.5, "run"),
  node("4-drop", undefined, undefined, 40, 18.1, 5, 13, 2.6, "descent"),
  node("5", "5", 2, 27, 16.8, 7, 13, 2.5, "run"),
  node("6", "6", 2, -7, 15.5, 5, 16, 2.7, "mixing-hall"),
  node("7", "7", 2, -25, 14.2, 15, 13, 2.5, "run"),
  node("8", "8", 2, -24, 12.6, 48, 12, 2.4, "run"),
  node("8-drop", undefined, undefined, -14, 10.8, 51, 12, 2.5, "descent"),
  node("9", "9", 1, -6, 9.4, 35, 12, 2.4, "run"),
  node("10", "10", 1, 14, 7.8, 21, 16, 2.7, "mixing-hall"),
  node("10-bend", undefined, undefined, 28, 6.7, 12, 13, 2.5, "run"),
  node("10-return", undefined, undefined, 17, 5.8, 1, 12, 2.4, "run"),
  node("11", "11", 1, 5, 4.6, 48, 12, 2.4, "run"),
  node("12", "12", 1, -4, 3.0, 64, 14, 2.6, "finish"),
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
