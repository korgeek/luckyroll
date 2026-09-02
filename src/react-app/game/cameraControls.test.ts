import { describe, expect, it } from "vitest";
import { applyDrag, applyZoom, initialCameraControls } from "./cameraControls";

describe("camera controls", () => {
	it("turns the overview with a pointer drag while clamping vertical tilt", () => {
		const controls = applyDrag(initialCameraControls, 80, 10_000);

		expect(controls.yaw).toBeGreaterThan(0);
		expect(controls.pitch).toBe(0.55);
	});

	it("supports wheel and pinch zoom without allowing an unusable distance", () => {
		const close = applyZoom(initialCameraControls, 1000);
		const far = applyZoom(initialCameraControls, -1000);

		expect(close.zoom).toBe(0.72);
		expect(far.zoom).toBe(1.35);
	});
});
