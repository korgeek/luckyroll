export type TrackPoint = { x: number; y: number; z: number };
export type TrackSegment = { id: string; from: TrackPoint; to: TrackPoint; width: number; route: "main" };
export type Checkpoint = TrackPoint & { label: string; tier: 1 | 2 | 3 };

type RouteAnchor = TrackPoint & { label?: string; tier?: 1 | 2 | 3 };

// The reference's A → 12 route is one ribbon. The Y values make the three
// visual tiers, but every sampled piece still slopes down into the next one.
const anchors: RouteAnchor[] = [
	{ label: "A", tier: 3, x: 0, y: 22.5, z: 64 },
	{ label: "1", tier: 3, x: -27, y: 21.8, z: 64 },
	{ label: "2", tier: 3, x: -30, y: 21.1, z: 30 },
	{ label: "3", tier: 3, x: 26, y: 20.4, z: 23 },
	{ label: "4", tier: 3, x: 22, y: 19.7, z: -34 },
	{ x: 37, y: 18.45, z: -34 },
	{ x: 37, y: 17.75, z: 8 },
	{ label: "5", tier: 2, x: 27, y: 17.2, z: 6 },
	{ label: "6", tier: 2, x: -8, y: 14.7, z: 5 },
	{ label: "7", tier: 2, x: -24, y: 13, z: 14 },
	{ label: "8", tier: 2, x: -22, y: 11.3, z: 46 },
	{ label: "9", tier: 1, x: -5, y: 8.9, z: 33 },
	{ label: "10", tier: 1, x: 12, y: 6.6, z: 21 },
	{ x: 25, y: 6.25, z: 14 },
	{ x: 27, y: 5.9, z: 2 },
	{ x: 15, y: 5.55, z: -3 },
	{ x: 4, y: 5.1, z: 8 },
	{ label: "11", tier: 1, x: 4, y: 4.7, z: 48 },
	{ label: "12", tier: 1, x: -3, y: 3, z: 61 },
];

const start: TrackPoint = { ...anchors[0] };
const checkpoints: Checkpoint[] = anchors.filter((anchor): anchor is Checkpoint => anchor.label !== undefined && anchor.label !== "A" && anchor.tier !== undefined).map((anchor) => ({ ...anchor }));
const POINTS_PER_LEG = 6;

const cubic = (before: number, from: number, to: number, after: number, progress: number) => {
	const squared = progress * progress;
	const cubed = squared * progress;
	return 0.5 * ((2 * from) + (-before + to) * progress + (2 * before - 5 * from + 4 * to - after) * squared + (-before + 3 * from - 3 * to + after) * cubed);
};

function sampleRoute() {
	const points: TrackPoint[] = [];
	for (let index = 0; index < anchors.length - 1; index += 1) {
		const before = anchors[Math.max(0, index - 1)];
		const from = anchors[index];
		const to = anchors[index + 1];
		const after = anchors[Math.min(anchors.length - 1, index + 2)];
		for (let step = 0; step < POINTS_PER_LEG; step += 1) {
			const progress = step / POINTS_PER_LEG;
			points.push({
				x: cubic(before.x, from.x, to.x, after.x, progress),
				// Linear elevation keeps every physical deck piece pointing downhill.
				y: from.y + (to.y - from.y) * progress,
				z: cubic(before.z, from.z, to.z, after.z, progress),
			});
		}
	}
	points.push({ ...anchors[anchors.length - 1] });
	return points;
}

export function createTrackLayout() {
	const points = sampleRoute();
	const segments: TrackSegment[] = points.slice(0, -1).map((from, index) => ({ id: `a-12-${index + 1}`, from, to: points[index + 1], width: 12, route: "main" }));
	const totalRun = segments.reduce((total, segment) => total + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y, segment.to.z - segment.from.z), 0);
	return {
		start,
		checkpoints,
		segments,
		finish: points[points.length - 1],
		totalRun,
		levelRange: start.y - points[points.length - 1].y,
		features: ["a-to-12-continuous", "three-tier-flow", "high-u-channel"] as const,
	};
}

export function createStartGrid(count: number): TrackPoint[] {
	return Array.from({ length: count }, (_, index) => {
		const column = index % 10;
		const row = Math.floor(index / 10);
		return { x: -2.5 - row * 1.35, y: 23.15 - row * 0.05, z: 64 + (column - 4.5) * 0.85 };
	});
}

export function createRailOffsets(width: number) {
	return [-(width / 2 + 0.2), width / 2 + 0.2] as const;
}

export function createSafetyRail() {
	return { visualHeight: 1.05, collisionHeight: 3.4, collisionHalfHeight: 1.7 };
}

const guideSegments = createTrackLayout().segments;

export function getDownhillGuide(position: Pick<TrackPoint, "x" | "z">) {
	let selected = guideSegments[0];
	let selectedIndex = 0;
	let distance = Number.POSITIVE_INFINITY;
	guideSegments.forEach((segment, index) => {
		const centerX = (segment.from.x + segment.to.x) / 2;
		const centerZ = (segment.from.z + segment.to.z) / 2;
		const candidate = (position.x - centerX) ** 2 + (position.z - centerZ) ** 2;
		if (candidate < distance) {
			selected = segment;
			selectedIndex = index;
			distance = candidate;
		}
	});
	const x = selected.to.x - selected.from.x;
	const y = selected.to.y - selected.from.y;
	const z = selected.to.z - selected.from.z;
	const length = Math.hypot(x, y, z);
	return { direction: { x: x / length, y: y / length, z: z / length }, segmentIndex: selectedIndex, strength: selectedIndex < 14 ? 0.055 : 0.014 };
}
