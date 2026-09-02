import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics final seed soak", () => {
  it("finishes seeds 83 and 97 twice without recovery", () =>
    validateSeedsTwice([83, 97]), 180_000);
});
