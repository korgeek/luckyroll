import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./track/trackBuild";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import { getCameraShot, getTrackBounds, selectProductionCameraShot } from "./cameraPlan";

describe("track-bound race camera plan", () => {
	const canonicalTrackBounds = getTrackBounds(buildValidatedTrack().samples);
	const isFiniteVec3 = (value: Vec3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

	it.each(["overview", "side", "profile", "leader", "trailer", "finish"] as const)("frames the %s shot inside the track bounds", (name) => {
		const shot = getCameraShot(name, canonicalTrackBounds);

		expect(isFiniteVec3(shot.position)).toBe(true);
		expect(isFiniteVec3(shot.lookAt)).toBe(true);
		expect(shot.near).toBeLessThan(shot.far);
		expect(shot.far).toBeGreaterThan(canonicalTrackBounds.radius * 2);
	});

	it("falls back to a finite usable bounds when samples are empty or malformed", () => {
		const malformed = [{ position: { x: Number.NaN, y: Infinity, z: 0 } }] as unknown as readonly TrackSample[];

		expect(getTrackBounds([])).toEqual({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
		expect(getTrackBounds(malformed)).toEqual({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
	});

	it("settles on the finish shot once the leader reaches the final fifteen percent", () => {
		expect(selectProductionCameraShot(6_000, 0.84)).not.toBe("finish");
		expect(selectProductionCameraShot(6_000, 0.85)).toBe("finish");
	});
});
