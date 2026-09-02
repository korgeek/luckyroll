import { describe, expect, it } from "vitest";
import { createColorBatches } from "./marbleBatches";

describe("marble color batches", () => {
	it("keeps each participant color in its own render batch", () => {
		const batches = createColorBatches([{ color: "#ff4f8f" }, { color: "#58e7ff" }, { color: "#ff4f8f" }]);

		expect(batches).toEqual([{ color: "#ff4f8f", sourceIndexes: [0, 2] }, { color: "#58e7ff", sourceIndexes: [1] }]);
	});
});
