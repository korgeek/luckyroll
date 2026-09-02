import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics fourth seed soak", () => {
  it("finishes seed 101 twice without recovery", () =>
    validateSeedsTwice([101], true), 180_000);
});
