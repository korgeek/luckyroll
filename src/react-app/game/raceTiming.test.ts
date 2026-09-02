import { expect, it } from "vitest";
import { RACE_TIMEOUT_MS } from "./raceTiming";

it("allows a full minute for a long tense race", () => {
	expect(RACE_TIMEOUT_MS).toBe(60_000);
});
