import { describe, expect, it } from "vitest";
import { createRailOffsets, createSafetyRail, createTrackLayout, createStartGrid, getDownhillGuide } from "./trackLayout";

describe("marble course layout", () => {
	it("keeps every starting marble inside a protected launch bay", () => {
		const starts = createStartGrid(100);

		expect(starts).toHaveLength(100);
		expect(starts.every((slot) => slot.x >= -18 && slot.x <= 4.5 && slot.z >= 59 && slot.z <= 68 && slot.y >= 22 && slot.y <= 23.3)).toBe(true);
	});

	it("builds the single A-to-12 tiered loop without branches", () => {
		const layout = createTrackLayout();

		expect(layout.checkpoints).toHaveLength(12);
		expect(layout.checkpoints.map((checkpoint) => checkpoint.label)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
		expect(new Set(layout.checkpoints.map((checkpoint) => checkpoint.tier))).toEqual(new Set([1, 2, 3]));
		expect(layout.segments).toHaveLength(108);
		expect(layout.segments.every((segment, index) => index === 0 || segment.from === layout.segments[index - 1].to)).toBe(true);
		expect(layout.segments.every((segment) => segment.from.y > segment.to.y)).toBe(true);
		expect(layout.features).toEqual(["a-to-12-continuous", "three-tier-flow", "high-u-channel"]);
		expect(layout.finish).toBe(layout.segments[layout.segments.length - 1].to);
	});

	it("rounds every turn into one flowing ribbon instead of separate platforms", () => {
		const { segments } = createTrackLayout();
		const headings = segments.map((segment) => Math.atan2(segment.to.z - segment.from.z, segment.to.x - segment.from.x));
		const angleDelta = (next: number, previous: number) => Math.abs(Math.atan2(Math.sin(next - previous), Math.cos(next - previous)));

		const deltas = headings.slice(1).map((heading, index) => angleDelta(heading, headings[index]));
		expect(Math.max(...deltas)).toBeLessThan(1.1);
	});

	it("places safety rails symmetrically beside each course segment", () => {
		expect(createRailOffsets(8.4)).toEqual([-4.4, 4.4]);
	});

	it("uses low rails that contain a marble without obscuring the overview", () => {
		expect(createSafetyRail()).toEqual({ visualHeight: 1.05, collisionHeight: 3.4, collisionHalfHeight: 1.7 });
	});

	it("guides physics along the continuous curve and boosts the launch slope", () => {
		const launch = getDownhillGuide({ x: 0, z: 62 });
		const midCourse = getDownhillGuide({ x: 0, z: -10 });

		expect(launch.direction.x).toBeLessThan(0);
		expect(launch.strength).toBe(0.055);
		expect(midCourse.strength).toBe(0.014);
	});
});
