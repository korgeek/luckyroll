import { expect, it } from "vitest";
import { RACE_TIMEOUT_MS } from "./raceTiming";

it("allows two minutes for a long tense race", () => {
	expect(RACE_TIMEOUT_MS).toBe(120_000);
});
