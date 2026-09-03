import { describe, expect, it } from "vitest";
import { createEmptyTrackDesign, createDefaultTrackDesign, rotateEditableCell, type TrackCell, type TrackDesign } from "./trackDesign";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "./trackDesign.testSupport";
import { resolveRoute, validateTrackDesign } from "./trackValidation";

describe("modular route validation", () => {
  it("accepts the corrected 36-cell default serpentine and visits every occupied cell", () => {
    const result = resolveRoute(createValidTrackDesign().cells);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.route.map((step) => step.cellIndex)).toEqual([
      0, 1, 2, 3, 4, 9, 8, 7, 6, 5,
      10, 11, 12, 13, 14, 19, 18, 17, 16, 15,
      20, 21, 22, 23, 24, 29, 28, 27, 26, 25,
      30, 35, 36, 37, 38, 39,
    ]);
  });

  it("rejects upward travel", () => {
    const valid = createValidTrackDesign();
    const cells = [...valid.cells] as TrackCell[];
    cells[7] = { kind: "curve", rotation: 0 };
    const failures = validateTrackDesign({ ...valid, cells }).failures;
    expect(failures.map((failure) => failure.code)).toContain("upward");
  });

  it("rejects an orphan module", () => {
    const valid = createValidTrackDesign();
    const cells = [...valid.cells] as TrackCell[];
    cells[31] = { kind: "straight", rotation: 0 };
    const failures = validateTrackDesign({ ...valid, cells }).failures;
    expect(failures.map((failure) => failure.code)).toContain("orphan");
  });

  it.each([
    ["a gap", (cells: TrackCell[]) => { cells[1] = null; }, "gap", 1],
    ["a connector mismatch", (cells: TrackCell[]) => { cells[1] = { kind: "straight", rotation: 1 }; }, "connector", 1],
    ["a loop", (cells: TrackCell[]) => {
      cells[15] = { kind: "curve", rotation: 0 };
    }, "loop", 10],
    ["a wrong finish entry", (cells: TrackCell[]) => {
      cells[30] = { kind: "curve", rotation: 0 };
      cells[31] = { kind: "straight", rotation: 0 };
      cells[32] = { kind: "straight", rotation: 0 };
      cells[33] = { kind: "straight", rotation: 0 };
      cells[34] = { kind: "curve", rotation: 2 };
    }, "finish-entry", 39],
  ] as const)("rejects %s", (_description, mutate, code, cellIndex) => {
    const cells = [...createValidTrackDesign().cells] as TrackCell[];
    mutate(cells);
    expect(validateTrackDesign({ ...createValidTrackDesign(), cells }).failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, cellIndex })]),
    );
  });

  it("accepts left, right, and down travel without an upward exit", () => {
    const result = resolveRoute(createDefaultTrackDesign().cells);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const exits = result.route.flatMap((step) => step.exit === undefined ? [] : [step.exit]);
      expect(exits).toEqual(expect.arrayContaining(["west", "east", "south"]));
      expect(exits).not.toContain("north");
    }
  });

  it("validates the worst-case fixture on the same 36-cell route", () => {
    const track = createWorstCaseTrackDesign();
    expect(track.cells.length).toBe(40);
    expect(track.cells.filter((cell) => cell !== null)).toHaveLength(36);
    const substitutions = [1, 2, 3, 6, 8, 11, 12, 16, 18, 21, 23, 26, 28, 36, 38];
    expect(track.cells).not.toEqual(createDefaultTrackDesign("Qualification Track").cells);
    expect(substitutions.map((index) => track.cells[index]?.kind)).toEqual([
      "booster", "bumper", "bumper", "pinwheel", "wave", "bumper", "booster", "wave", "pinwheel", "booster", "bumper", "pinwheel", "wave", "bumper", "booster",
    ]);
    const result = resolveRoute(track.cells);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.route.map((step) => step.cellIndex)).toEqual([
      0, 1, 2, 3, 4, 9, 8, 7, 6, 5,
      10, 11, 12, 13, 14, 19, 18, 17, 16, 15,
      20, 21, 22, 23, 24, 29, 28, 27, 26, 25,
      30, 35, 36, 37, 38, 39,
    ]);
  });

  it.each([
    ["an untrimmed name", { name: " Track " }],
    ["an empty name", { name: "" }],
    ["a too-long name", { name: "x".repeat(61) }],
    ["a control character", { name: "Track\u0000" }],
    ["a wrong cell count", { cells: createValidTrackDesign().cells.slice(0, 39) }],
    ["an unknown module", { cells: Object.assign([...createValidTrackDesign().cells], { 1: { kind: "unknown", rotation: 0 } }) }],
    ["an extra cell field", { cells: Object.assign([...createValidTrackDesign().cells], { 1: { kind: "straight", rotation: 0, extra: true } }) }],
  ] as const)("rejects %s", (_description, mutation) => {
    const track = { ...createValidTrackDesign(), ...mutation } as TrackDesign;
    expect(validateTrackDesign(track).ok).toBe(false);
  });

  it("keeps an empty new design invalid and its endpoints fixed", () => {
    const track = createEmptyTrackDesign("New Track");
    expect(track.cells[0]).toEqual({ kind: "start", rotation: 0 });
    expect(track.cells[39]).toEqual({ kind: "finish", rotation: 0 });
    expect(validateTrackDesign(track).ok).toBe(false);
  });

  it("does not rotate fixed endpoints and cycles editable orientations", () => {
    const track = createEmptyTrackDesign("New Track");
    expect(rotateEditableCell(track.cells[0])).toBe(track.cells[0]);
    expect(rotateEditableCell(track.cells[39])).toBe(track.cells[39]);
    expect(rotateEditableCell({ kind: "straight", rotation: 1 })).toEqual({ kind: "straight", rotation: 0 });
    expect(rotateEditableCell({ kind: "curve", rotation: 3 })).toEqual({ kind: "curve", rotation: 0 });
  });
});
