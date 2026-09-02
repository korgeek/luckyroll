import { describe, expect, it } from "vitest";
import { getCameraShot } from "./cameraPlan";

describe("race camera plan", () => {
	it("opens on the protected launch bay rather than tracking an individual marble", () => {
		const opening = getCameraShot(0);

		expect(opening.position).toEqual({ x: 50, y: 72, z: 125 });
		expect(opening.lookAt).toEqual({ x: 0, y: 12, z: 18 });
	});

	it("uses a fixed finish overview for the final drop", () => {
		const finish = getCameraShot(0.9);

		expect(finish.lookAt.z).toBeGreaterThan(45);
		expect(finish.position.y).toBeGreaterThan(finish.lookAt.y);
	});
});
