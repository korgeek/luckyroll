import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics middle seed soak", () => {
  it("finishes seeds 53, 67, and 71 twice without recovery", () =>
    validateSeedsTwice([53, 67, 71]), 180_000);
});
