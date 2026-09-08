import { describe, expect, it } from "vitest";
import { createDefaultTrackDesign, portsFor } from "./trackDesign";
import { resolveRoute, validateTrackDesign } from "./trackValidation";

describe("createDefaultTrackDesign", () => {
  it("uses the requested straight-family showcase cells on the valid serpentine route", () => {
    const track = createDefaultTrackDesign("Showcase");

    expect(track.cells.map((cell) => cell?.kind)).toEqual([
      "start", "straight", "funnel", "straight", "curve", "curve", "straight", "pinwheel", "straight", "curve",
      "curve", "straight", "wave", "straight", "curve", "curve", "straight", "booster", "straight", "curve",
      "curve", "straight", "funnel", "straight", "curve", "curve", "straight", "funnel", "straight", "curve",
      "straight", undefined, undefined, undefined, undefined, "curve", "straight", "bumper", "straight", "finish",
    ]);
    expect(validateTrackDesign(track).ok).toBe(true);
    expect(resolveRoute(track.cells).ok).toBe(true);
    expect(portsFor(track.cells[2])).toEqual(["west", "east"]);
    expect(portsFor(track.cells[7])).toEqual(["west", "east"]);
    expect(portsFor(track.cells[12])).toEqual(["west", "east"]);
    expect(portsFor(track.cells[17])).toEqual(["west", "east"]);
    expect(portsFor(track.cells[37])).toEqual(["west", "east"]);
  });

  it("keeps independently-created defaults and their saved names isolated", () => {
    const first = createDefaultTrackDesign("First");
    const second = createDefaultTrackDesign("Second");

    expect(first).not.toBe(second);
    expect(first.cells).not.toBe(second.cells);
    expect(first.name).toBe("First");
    expect(second.name).toBe("Second");
  });
});
