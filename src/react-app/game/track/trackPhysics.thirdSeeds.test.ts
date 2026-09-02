import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics third seed soak", () => {
  it("finishes seed 71 twice without recovery", () =>
    validateSeedsTwice([71], true), 180_000);
});
