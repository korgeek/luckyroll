import { createDefaultTrackDesign, type TrackCell, type TrackDesign } from "./trackDesign";

export const createValidTrackDesign = (name = "Valid Track"): TrackDesign => createDefaultTrackDesign(name);

export const createWorstCaseTrackDesign = (): TrackDesign => {
  const cells = [...createDefaultTrackDesign("Qualification Track").cells] as TrackCell[];
  for (const [index, kind] of [[1, "booster"], [2, "bumper"], [3, "bumper"], [6, "pinwheel"], [8, "wave"], [11, "bumper"], [12, "booster"], [16, "wave"], [18, "pinwheel"], [21, "booster"], [23, "bumper"], [26, "pinwheel"], [28, "wave"], [36, "bumper"], [38, "booster"]] as const) {
    cells[index] = { kind, rotation: 0 };
  }
  return Object.freeze({ name: "Qualification Track", cells: Object.freeze(cells.map((cell) => cell === null ? null : Object.freeze(cell))) });
};
