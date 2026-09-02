import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics final seed soak", () => {
  it("finishes seeds 83, 97, and 101 twice without recovery", () =>
    validateSeedsTwice([83, 97, 101]), 180_000);
});
