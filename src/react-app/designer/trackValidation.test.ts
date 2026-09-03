import { describe, expect, it } from "vitest";
import { createEmptyTrackDesign, type TrackCell } from "./trackDesign";
import { createValidTrackDesign } from "./trackDesign.testSupport";
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

  it("keeps an empty new design invalid and its endpoints fixed", () => {
    const track = createEmptyTrackDesign("New Track");
    expect(track.cells[0]).toEqual({ kind: "start", rotation: 0 });
    expect(track.cells[39]).toEqual({ kind: "finish", rotation: 0 });
    expect(validateTrackDesign(track).ok).toBe(false);
  });
});
