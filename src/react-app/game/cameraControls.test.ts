import { describe, expect, it } from "vitest";
import { applyDrag, applyPan, applyZoom, initialCameraControls, isCameraAtRest, relaxControls } from "./cameraControls";

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

	it("keeps pan finite and bounded", () => {
		const controls = applyPan(initialCameraControls, Number.POSITIVE_INFINITY, -10_000);

		expect(Number.isFinite(controls.panX)).toBe(true);
		expect(Number.isFinite(controls.panY)).toBe(true);
		expect(Math.abs(controls.panX)).toBeLessThanOrEqual(24);
		expect(Math.abs(controls.panY)).toBeLessThanOrEqual(24);
	});

	it("returns changed controls to the initial camera at full relaxation", () => {
		const changed = applyPan(applyZoom(applyDrag(initialCameraControls, 80, 100), 100), 10, -6);

		expect(relaxControls(changed, 1)).toEqual(initialCameraControls);
		expect(isCameraAtRest(relaxControls(changed, 1))).toBe(true);
	});
});
