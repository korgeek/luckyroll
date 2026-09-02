import { describe, expect, it } from "vitest";
import { launchPositionsFor, runValidationRace } from "./trackPhysics";
import { buildValidatedTrack } from "./trackBuild";
import { createLaunchSlots } from "./trackSpec";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics", () => {
  it("keeps all physical launch positions non-overlapping inside the entry channel", () => {
    const positions = launchPositionsFor(createLaunchSlots(100), buildValidatedTrack().samples);

    expect(Math.min(...positions.flatMap((position, index) =>
      positions.slice(index + 1).map((other) => Math.hypot(
        position.x - other.x,
        position.y - other.y,
        position.z - other.z,
      )),
    ))).toBeGreaterThanOrEqual(0.68);
  });

  it("rolls one marble from A through 12 using gravity only", async () => {
    const result = await runValidationRace({ seed: 1, marbleCount: 1, durationSeconds: 60 });

    expect(result.escapes).toEqual([]);
    expect(result.stalls).toEqual([]);
    expect(result.finishOrder).toEqual([1]);
    expect(result.finishTimesMs[0]).toBeGreaterThanOrEqual(45_000);
    expect(result.finishTimesMs[0]).toBeLessThanOrEqual(60_000);
  });

  it("finishes seeds 11, 23, 37, and 41 twice without recovery", () =>
    validateSeedsTwice([11, 23, 37, 41]), 180_000);
});
