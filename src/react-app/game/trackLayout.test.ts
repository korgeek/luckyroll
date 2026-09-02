import { describe, expect, it } from "vitest";
import { createRailOffsets, createSafetyRail, createTrackLayout, createStartGrid, getDownhillGuide } from "./trackLayout";

describe("marble course layout", () => {
	it("keeps every starting marble inside a protected launch bay", () => {
		const starts = createStartGrid(100);

		expect(starts).toHaveLength(100);
		expect(starts.every((slot) => Math.abs(slot.x) <= 4.5 && slot.z >= 55 && slot.z <= 64 && slot.y >= 20 && slot.y <= 22)).toBe(true);
	});

	it("builds an unbroken, fast S-curve descent before adding obstacles", () => {
		const layout = createTrackLayout();

		expect(layout.segments).toHaveLength(32);
		expect(layout.segments.every((segment, index) => index === 0 || segment.from === layout.segments[index - 1].to)).toBe(true);
		expect(layout.segments.every((segment) => segment.from.y > segment.to.y)).toBe(true);
		expect(layout.features).toEqual(["launch-drop", "continuous-s-curve"]);
	});

	it("places safety rails symmetrically beside each course segment", () => {
		expect(createRailOffsets(8.4)).toEqual([-4.4, 4.4]);
	});

	it("uses low rails that contain a marble without obscuring the overview", () => {
		expect(createSafetyRail()).toEqual({ visualHeight: 0.78, collisionHeight: 1.55, collisionHalfHeight: 0.775 });
	});

	it("guides physics along the continuous curve and boosts the launch slope", () => {
		const launch = getDownhillGuide({ x: 0, z: 62 });
		const midCourse = getDownhillGuide({ x: 0, z: -10 });

		expect(launch.direction.z).toBeLessThan(0);
		expect(launch.strength).toBe(0.04);
		expect(midCourse.strength).toBe(0.01);
	});
});
