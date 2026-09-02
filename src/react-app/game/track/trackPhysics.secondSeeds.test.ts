import { describe, it } from "vitest";
import { validateSeedsTwice } from "./trackPhysics.testSupport";

describe.sequential("headless track physics second seed soak", () => {
  it("finishes seeds 37 and 41 twice without recovery", () =>
    validateSeedsTwice([37, 41], true), 180_000);
});
