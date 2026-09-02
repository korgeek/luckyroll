import { describe, expect, it } from "vitest";
import { getCameraShot } from "./cameraPlan";

describe("race camera plan", () => {
	it("opens on the protected launch bay rather than tracking an individual marble", () => {
		const opening = getCameraShot(0);

		expect(opening.position).toEqual({ x: 24, y: 58, z: 105 });
		expect(opening.lookAt).toEqual({ x: 0, y: 10, z: 4 });
	});

	it("uses a fixed finish overview for the final drop", () => {
		const finish = getCameraShot(0.9);

		expect(finish.lookAt.z).toBeLessThan(-45);
		expect(finish.position.z).toBeGreaterThan(finish.lookAt.z);
	});
});
