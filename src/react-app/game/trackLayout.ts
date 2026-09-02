export type TrackPoint = { x: number; y: number; z: number };
export type TrackSegment = { id: string; from: TrackPoint; to: TrackPoint; width: number; route: "main" };

const SEGMENT_COUNT = 32;

function pointAt(progress: number): TrackPoint {
	const z = 68 - progress * 136;
	const y = progress < 0.25 ? 22 - progress * 32 : 14 - ((progress - 0.25) / 0.75) * 13;
	const curveProgress = Math.max(0, (progress - 0.1) / 0.9);
	return { x: 8 * Math.sin(curveProgress * Math.PI * 2), y, z };
}

export function createTrackLayout() {
	const points = Array.from({ length: SEGMENT_COUNT + 1 }, (_, index) => pointAt(index / SEGMENT_COUNT));
	const segments: TrackSegment[] = points.slice(0, -1).map((from, index) => ({ id: `s-curve-${index + 1}`, from, to: points[index + 1], width: 11.2, route: "main" }));
	return { segments, totalRun: 159, levelRange: 21, features: ["launch-drop", "continuous-s-curve"] as const };
}

export function createStartGrid(count: number): TrackPoint[] {
	return Array.from({ length: count }, (_, index) => {
		const column = index % 10;
		const row = Math.floor(index / 10);
		const base = pointAt(0.03 + row * 0.004);
		return { x: base.x + (column - 4.5) * 0.9, y: base.y + 0.62, z: base.z };
	});
}

export function createRailOffsets(width: number) {
	return [-(width / 2 + 0.2), width / 2 + 0.2] as const;
}

export function createSafetyRail() {
	return { visualHeight: 0.78, collisionHeight: 1.55, collisionHalfHeight: 0.775 };
}

const guideSegments = createTrackLayout().segments;

export function getDownhillGuide(position: Pick<TrackPoint, "x" | "z">) {
	let selected = guideSegments[0]; let selectedIndex = 0; let distance = Number.POSITIVE_INFINITY;
	guideSegments.forEach((segment, index) => {
		const centerX = (segment.from.x + segment.to.x) / 2; const centerZ = (segment.from.z + segment.to.z) / 2;
		const candidate = (position.x - centerX) ** 2 + (position.z - centerZ) ** 2;
		if (candidate < distance) { selected = segment; selectedIndex = index; distance = candidate; }
	});
	const x = selected.to.x - selected.from.x; const y = selected.to.y - selected.from.y; const z = selected.to.z - selected.from.z; const length = Math.hypot(x, y, z);
	return { direction: { x: x / length, y: y / length, z: z / length }, strength: selectedIndex < 8 ? 0.04 : 0.01 };
}
