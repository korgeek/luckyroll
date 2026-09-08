import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modular/modularTrackBuild";
import { buildValidatedTrack } from "./track/trackBuild";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import {
  cameraLerpAlpha,
  createFeatureBroadcastDirector,
  createRaceFocusDirector,
  deriveFeatureBroadcastZones,
  getBirdViewUp,
  getCameraShot,
  getTrackBounds,
  hasCameraClipChanged,
  selectFocusRank,
  shouldPresentFeatureBroadcast,
  writeControlledTrackFollowShot,
  writeBirdViewFit,
  writeFeatureBroadcastShot,
  writeTrackFollowShot,
  type CameraShot,
  type RaceFocusTarget,
} from "./cameraPlan";

const canonicalTrackBounds = getTrackBounds(buildValidatedTrack().samples);
const isFiniteVec3 = (value: Vec3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const subtract = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
const dot = (left: Vec3, right: Vec3): number => left.x * right.x + left.y * right.y + left.z * right.z;
const target = (id: RaceFocusTarget["id"], progress: number): RaceFocusTarget => ({ id, progress });
const field = (count: number, offset = 0): RaceFocusTarget[] => Array.from({ length: count }, (_, index) => target(`marble-${offset + index}`, 1 - index / count));
const mutableShot = (): CameraShot => ({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 10 });
const featureSamples = (kind: "bumper" | "pinwheel", cellIndex: number, entryDistance: number, x = entryDistance) => [
  { index: 0, distance: entryDistance + 2, position: { x: x + 2, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 12, bankRadians: 0, zone: "run" as const, kind, cellIndex, localU: 0.1 },
  { index: 1, distance: entryDistance + 18, position: { x: x + 18, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 12, bankRadians: 0, zone: "run" as const, kind, cellIndex, localU: 0.9 },
] as const;
const traffic = (distances: readonly number[], eliminated: readonly number[] = []) => distances.map((distance, index) => ({ id: index + 1, distance, eliminated: eliminated.includes(index + 1) }));

describe("track-bound race camera plan", () => {
	it("keeps a sparse follow anchor continuous across a nearest-sample boundary", () => {
		const samples = [
			{ index: 0, distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 12, bankRadians: 0, zone: "run" as const },
			{ index: 1, distance: 5.84, position: { x: 5.84, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 12, bankRadians: 0, zone: "run" as const },
			{ index: 2, distance: 16, position: { x: 16, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 12, bankRadians: 0, zone: "run" as const },
		];
		const before = writeTrackFollowShot(mutableShot(), { x: 10.91, y: 0, z: 0 }, samples, 1, canonicalTrackBounds);
		const after = writeTrackFollowShot(mutableShot(), { x: 10.93, y: 0, z: 0 }, samples, 2, canonicalTrackBounds);

		expect(Math.abs(after.position.x - before.position.x)).toBeLessThan(0.1);
	});

	it("derives feature entry and exit from actual local route slope", () => {
		const [zone] = deriveFeatureBroadcastZones(featureSamples("bumper", 7, 10));

		expect(zone).toMatchObject({ key: "bumper:7", kind: "bumper", entryDistance: 10, exitDistance: 30, length: 20, width: 12, height: 12 });
	});

	it("holds a bumper from first entry until every non-DNF marble clears it", () => {
		const director = createFeatureBroadcastDirector(deriveFeatureBroadcastZones(featureSamples("bumper", 7, 10)));

		expect(director.update(traffic([9, 9]))).toBeUndefined();
		expect(director.update(traffic([10, 9]))?.key).toBe("bumper:7");
		expect(director.update(traffic([31, 9]))?.key).toBe("bumper:7");
		expect(director.update(traffic([31, 9], [2]))).toBeUndefined();
		expect(director.update(traffic([10, 9]))).toBeUndefined();
	});

	it("holds a wheel through 80 unique exits and releases on the 81st", () => {
		const director = createFeatureBroadcastDirector(deriveFeatureBroadcastZones(featureSamples("pinwheel", 8, 40)));
		const first80 = [...Array.from({ length: 80 }, () => 61), ...Array.from({ length: 20 }, () => 50)];

		expect(director.update(traffic(first80))?.key).toBe("pinwheel:8");
		const recross = [...first80]; recross[0] = 50;
		expect(director.update(traffic(recross))?.key).toBe("pinwheel:8");
		expect(director.update(traffic(first80))?.key).toBe("pinwheel:8");
		const first81 = [...first80]; first81[80] = 61;
		expect(director.update(traffic(first81))).toBeUndefined();
	});

	it("releases a smaller wheel after all remaining marbles clear", () => {
		const director = createFeatureBroadcastDirector(deriveFeatureBroadcastZones(featureSamples("pinwheel", 8, 40)));
		expect(director.update(traffic([41, 39]))?.key).toBe("pinwheel:8");
		expect(director.update(traffic([61, 61]))).toBeUndefined();
	});

	it("resets one-shot state and treats multiple feature cells independently", () => {
		const zones = deriveFeatureBroadcastZones([...featureSamples("bumper", 1, 10), ...featureSamples("bumper", 2, 40, 40)]);
		const director = createFeatureBroadcastDirector(zones);
		expect(director.update(traffic([11]))?.key).toBe("bumper:1");
		expect(director.update(traffic([31]))).toBeUndefined();
		expect(director.update(traffic([41]))?.key).toBe("bumper:2");
		director.reset();
		expect(director.update(traffic([11]))?.key).toBe("bumper:1");
	});

	it.each([320 / 740, 1024 / 768])("fits an entire tall feature module at aspect %s", (aspect) => {
		const [zone] = deriveFeatureBroadcastZones(featureSamples("bumper", 7, 10));
		const shot = writeFeatureBroadcastShot(mutableShot(), zone, 60, aspect, 0);
		const camera = new THREE.PerspectiveCamera(60, aspect, shot.near, shot.far);
		camera.position.set(shot.position.x, shot.position.y, shot.position.z);
		camera.up.set(zone.up.x, zone.up.y, zone.up.z);
		camera.lookAt(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z); camera.updateMatrixWorld();
		for (const along of [-zone.length / 2, zone.length / 2]) for (const across of [-zone.width / 2, zone.width / 2]) for (const up of [-zone.height / 2, zone.height / 2]) {
			const projected = new THREE.Vector3(zone.center.x + zone.tangent.x * along + zone.side.x * across + zone.up.x * up, zone.center.y + zone.tangent.y * along + zone.side.y * across + zone.up.y * up, zone.center.z + zone.tangent.z * along + zone.side.z * across + zone.up.z * up).project(camera);
			expect(Math.abs(projected.x)).toBeLessThanOrEqual(1); expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
		}
		const view = subtract(shot.position, shot.lookAt);
		expect(dot(view, zone.up) / Math.hypot(view.x, view.y, view.z)).toBeGreaterThan(0.9);
	});

	it("keeps a feature inside the far plane while easing from a distant bird view", () => {
		const aspect = 320 / 740;
		const [zone] = deriveFeatureBroadcastZones(featureSamples("bumper", 7, 10));
		const bird = writeBirdViewFit(mutableShot(), { center: zone.center, radius: 120 }, 60, aspect);
		const shot = writeFeatureBroadcastShot(mutableShot(), zone, 60, aspect, 0, bird.position);
		const camera = new THREE.PerspectiveCamera(60, aspect, shot.near, shot.far);
		camera.position.set(bird.position.x, bird.position.y, bird.position.z); camera.up.set(zone.up.x, zone.up.y, zone.up.z);
		camera.lookAt(zone.center.x, zone.center.y, zone.center.z); camera.updateMatrixWorld();

		for (const along of [-zone.length / 2, zone.length / 2]) for (const across of [-zone.width / 2, zone.width / 2]) for (const up of [-zone.height / 2, zone.height / 2]) {
			const projected = new THREE.Vector3(zone.center.x + zone.tangent.x * along + zone.side.x * across + zone.up.x * up, zone.center.y + zone.tangent.y * along + zone.side.y * across + zone.up.y * up, zone.center.z + zone.tangent.z * along + zone.side.z * across + zone.up.z * up).project(camera);
			expect(projected.z).toBeLessThanOrEqual(1);
		}
	});

	it("suppresses only feature presentation for camera overrides", () => {
		expect(shouldPresentFeatureBroadcast({ birdView: false, reducedMotion: false, debugPaused: false, recentManualInput: false })).toBe(true);
		for (const key of ["birdView", "reducedMotion", "debugPaused", "recentManualInput"] as const) expect(shouldPresentFeatureBroadcast({ birdView: false, reducedMotion: false, debugPaused: false, recentManualInput: false, [key]: true })).toBe(false);
	});

	it("uses frame-rate independent camera easing", () => {
		const sixtyHz = cameraLerpAlpha(0.042, 1000 / 60);
		const thirtyHz = cameraLerpAlpha(0.042, 1000 / 30);
		expect(1 - (1 - sixtyHz) ** 60).toBeCloseTo(1 - (1 - thirtyHz) ** 30, 10);
	});
	it.each([["portrait", 320 / 740], ["landscape", 1024 / 768]] as const)("fits every track-bound corner in a %s view", (_name, aspect) => {
		const center = { x: 4, y: -2, z: 8 };
		const half = { x: 10, y: 5, z: 24 };
		const bounds = { center, radius: Math.hypot(half.x, half.y, half.z) };
		const shot = writeBirdViewFit(mutableShot(), bounds, 60, aspect);
		const camera = new THREE.PerspectiveCamera(60, aspect, shot.near, shot.far);
		camera.position.set(shot.position.x, shot.position.y, shot.position.z);
		camera.up.set(0, 0, -1);
		camera.lookAt(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z);
		camera.updateMatrixWorld();

		for (const x of [-half.x, half.x]) for (const y of [-half.y, half.y]) for (const z of [-half.z, half.z]) {
			const projected = new THREE.Vector3(center.x + x, center.y + y, center.z + z).project(camera);
			expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
			expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
			expect(projected.z).toBeGreaterThanOrEqual(-1);
			expect(projected.z).toBeLessThanOrEqual(1);
		}
		expect(shot.lookAt).toEqual(center);
		expect(shot.far).toBeGreaterThanOrEqual(Math.hypot(shot.position.x - center.x, shot.position.y - center.y, shot.position.z - center.z) + bounds.radius * 2);
	});

	it("falls back to finite bird framing for invalid camera inputs", () => {
		const shot = writeBirdViewFit(mutableShot(), { center: { x: Number.NaN, y: 0, z: 0 }, radius: -1 }, Number.NaN, 0);
		expect(isFiniteVec3(shot.position)).toBe(true);
		expect(isFiniteVec3(shot.lookAt)).toBe(true);
		expect(shot.near).toBeGreaterThan(0);
		expect(shot.far).toBeGreaterThan(shot.near);
	});

  it.each(["overview", "bird", "side", "profile", "leader", "trailer", "finish"] as const)("frames the %s debug shot inside the track bounds", (name) => {
    const shot = getCameraShot(name, canonicalTrackBounds);

    expect(isFiniteVec3(shot.position)).toBe(true);
    expect(isFiniteVec3(shot.lookAt)).toBe(true);
    expect(shot.near).toBeLessThan(shot.far);
    expect(shot.far).toBeGreaterThan(canonicalTrackBounds.radius * 2);
  });

  it("centers the bird view directly above the whole track", () => {
    const shot = getCameraShot("bird", canonicalTrackBounds);
    expect(shot.position.x).toBeCloseTo(canonicalTrackBounds.center.x, 8);
    expect(Math.abs(shot.position.z - canonicalTrackBounds.center.z)).toBeLessThan(canonicalTrackBounds.radius * 0.01);
    expect(shot.position.y).toBeGreaterThan(canonicalTrackBounds.center.y + canonicalTrackBounds.radius * 2);
  });

  it("orients bird view horizontally from finish toward start", () => {
    const samples = [
      { position: { x: 4, y: 0, z: 8 } },
      { position: { x: -2, y: -4, z: -6 } },
    ] as unknown as readonly TrackSample[];
    const up = getBirdViewUp(samples);
    const finishToStart = { x: 6, z: 14 };

    expect(up.x * finishToStart.x + up.z * finishToStart.z).toBeGreaterThan(0);
    expect(up.y).toBe(0);
    expect(Math.hypot(up.x, up.z)).toBeCloseTo(1, 8);
  });

  it("uses a stable bird-view orientation for missing or coincident endpoints", () => {
    const coincident = [
      { position: { x: 3, y: 1, z: -2 } },
      { position: { x: 3, y: -7, z: -2 } },
    ] as unknown as readonly TrackSample[];

    expect(getBirdViewUp([])).toEqual({ x: 0, y: 0, z: -1 });
    expect(getBirdViewUp(coincident)).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("falls back to a finite usable bounds when samples are empty or malformed", () => {
    const malformed = [{ position: { x: Number.NaN, y: Infinity, z: 0 } }] as unknown as readonly TrackSample[];

    expect(getTrackBounds([])).toEqual({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
    expect(getTrackBounds(malformed)).toEqual({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
  });

  it("selects the leader before halfway, walks by progress percentile, and selects the trailer at three quarters", () => {
    expect(selectFocusRank(0.49, 100)).toBe(0);
    expect(selectFocusRank(0.625, 101)).toBe(50);
    expect(selectFocusRank(0.749, 100)).toBeGreaterThan(95);
    expect(selectFocusRank(0.75, 100)).toBe(99);
  });

  it("holds the selected target for 1800ms and requires a two-rank middle-phase hysteresis band", () => {
    const director = createRaceFocusDirector();
    const original = field(8);

    expect(director.select(original, 0.625, 0)?.id).toBe("marble-4");
    expect(director.select(original, 0.4, 1_799)?.id).toBe("marble-4");
    expect(director.select(original, 0.60, 1_800)?.id).toBe("marble-4");
    expect(director.select(original, 0.74, 1_800)?.id).toBe("marble-7");
  });

  it("latches the final trailer across order and live-count changes until that target finishes", () => {
    const director = createRaceFocusDirector();
    const lateField = [target("leader", 0.9), target("middle", 0.7), target("trailer", 0.5)];

    expect(director.select(lateField, 0.76, 4_000)?.id).toBe("trailer");
    expect(director.select([target("trailer", 0.8), target("leader", 0.7)], 0.9, 4_100)?.id).toBe("trailer");
    expect(director.select([target("leader", 0.9), target("middle", 0.7)], 0.9, 4_200)?.id).toBe("middle");
  });

  it("preserves a zero-valued marble id in the final trailer latch", () => {
    const director = createRaceFocusDirector();

    expect(director.select([target(5, 0.9), target(0, 0.5)], 0.8, 0)?.id).toBe(0);
    expect(director.select([target(0, 0.8), target(5, 0.7)], 0.9, 1)?.id).toBe(0);
  });

  it("keeps a final trailer latch after the leader regresses below three quarters", () => {
    const director = createRaceFocusDirector();
    const live = [target("leader", 0.9), target("middle", 0.7), target("trailer", 0.5)];

    expect(director.select(live, 0.8, 0)?.id).toBe("trailer");
    expect(director.select([target("leader", 0.6), target("trailer", 0.55), target("middle", 0.4)], 0.49, 5_000)?.id).toBe("trailer");
  });

  it("honors an existing 1800ms hold before it latches the final trailer", () => {
    const director = createRaceFocusDirector();
    const live = field(5);

    expect(director.select(live, 0.625, 0)?.id).toBe("marble-2");
    expect(director.select(live, 0.76, 1_799)?.id).toBe("marble-2");
    expect(director.select(live, 0.76, 1_800)?.id).toBe("marble-4");
  });

  it("keeps the director hold active across a paused wall-clock interval when given race elapsed time", () => {
    const director = createRaceFocusDirector();
    const live = field(5);

    expect(director.select(live, 0.625, 0)?.id).toBe("marble-2");
    expect(director.select(live, 0.4, 500)?.id).toBe("marble-2");
    expect(director.select(live, 0.4, 1_799)?.id).toBe("marble-2");
    expect(director.select(live, 0.4, 1_800)?.id).toBe("marble-0");
  });

  it("clears its hold and final-trailer latch on reset", () => {
    const director = createRaceFocusDirector();
    const lateField = [target("leader", 0.9), target("trailer", 0.5)];

    expect(director.select(lateField, 0.8, 0)?.id).toBe("trailer");
    director.reset();
    expect(director.select(lateField, 0.4, 1)?.id).toBe("leader");
  });

  it("anchors a follow shot on the sampled route behind a banked curve marble", () => {
    const samples = buildModularTrack(createValidTrackDesign()).samples;
    const sampleIndex = samples.findIndex((sample) => Math.abs(sample.bankRadians) > 0.1);
    const shot = mutableShot();

    writeTrackFollowShot(shot, samples[sampleIndex]!.position, samples, sampleIndex, getTrackBounds(samples));

    expect(isFiniteVec3(shot.position)).toBe(true);
    expect(isFiniteVec3(shot.lookAt)).toBe(true);
    expect(dot(subtract(shot.position, shot.lookAt), samples[sampleIndex]!.up)).toBeGreaterThanOrEqual(5);
  });

  it("keeps a follow camera above a tall open channel wall", () => {
    const sample = { index: 0, distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 8, bankRadians: 0, zone: "run" as const };
    const directed = mutableShot(); const controlled = mutableShot();
    writeTrackFollowShot(directed, sample.position, [sample], 0, canonicalTrackBounds, 9);
    writeControlledTrackFollowShot(controlled, directed, sample.up, { yaw: 0, pitch: -0.55, zoom: 0.55, panY: -24 }, 9);
    expect(dot(subtract(controlled.position, directed.lookAt), sample.up)).toBeGreaterThanOrEqual(9);
  });

  it("applies pointer, touch, and zoom offsets after the directed pose without changing its target", () => {
    const directed = mutableShot();
    const controlled = mutableShot();
    const sample = { tangent: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
    const samples = [{ ...sample, index: 0, position: { x: 0, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, distance: 0, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const }];
    writeTrackFollowShot(directed, { x: 0, y: 0, z: 0 }, samples, 0, canonicalTrackBounds);

    writeControlledTrackFollowShot(controlled, directed, sample.up, { yaw: Math.PI / 2, pitch: 0.2, zoom: 1.2 });

    expect(controlled.lookAt).toEqual(directed.lookAt);
    expect(controlled.position).not.toEqual(directed.position);
    expect(isFiniteVec3(controlled.position)).toBe(true);
  });

  it("keeps extreme controls above the local rail", () => {
    const directed = mutableShot();
    const controlled = mutableShot();
    const bankedUp = { x: 0, y: Math.cos(Math.PI / 4), z: Math.sin(Math.PI / 4) };
    directed.position = { x: 7.5, y: 5, z: 0 };
    directed.lookAt = { x: 0, y: 0, z: 0 };

    writeControlledTrackFollowShot(controlled, directed, bankedUp, { yaw: 0, pitch: -0.55, zoom: 0.55, panY: -24 });

    expect(dot(subtract(controlled.position, directed.lookAt), bankedUp)).toBeGreaterThanOrEqual(5);
  });

  it("only flags a projection update when camera clipping actually changes", () => {
    expect(hasCameraClipChanged({ near: 0.5, far: 300 }, { near: 0.5, far: 300 })).toBe(false);
    expect(hasCameraClipChanged({ near: 0.5, far: 300 }, { near: 0.6, far: 300 })).toBe(true);
  });
});
