import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modular/modularTrackBuild";
import { buildValidatedTrack } from "./track/trackBuild";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import {
  cameraLerpAlpha,
  createRouteCrowdDirector,
  getBirdViewUp,
  getCameraShot,
  getTrackBounds,
  hasCameraClipChanged,
  writeControlledTrackFollowShot,
  writeBirdViewFit,
  writeRouteCrowdFollowShot,
  writeTrackFollowShot,
  type CameraShot,
} from "./cameraPlan";

const canonicalTrackBounds = getTrackBounds(buildValidatedTrack().samples);
const isFiniteVec3 = (value: Vec3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const subtract = (left: Vec3, right: Vec3): Vec3 => ({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
const dot = (left: Vec3, right: Vec3): number => left.x * right.x + left.y * right.y + left.z * right.z;
const mutableShot = (): CameraShot => ({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 10 });

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

  it("keeps one virtual focus on the densest pack instead of a rank-selected marble", () => {
    const samples = [0, 10, 20, 100].map((distance, index) => ({ index, distance, position: { x: distance, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const }));
    const director = createRouteCrowdDirector(samples);

    expect(director.update([{ id: "leader", distance: 29 }, { id: "a", distance: 11 }, { id: "b", distance: 12 }, { id: "c", distance: 13 }], 4).distance).toBeCloseTo(12, 8);
    director.reset();
    expect(director.update([{ id: "trailer", distance: 1 }, { id: "a", distance: 30 }, { id: "b", distance: 31 }, { id: "c", distance: 32 }], 4).distance).toBeCloseTo(31, 8);
  });

  it("advances after eighty percent of the original field uniquely passes a run, despite rebounds and DNFs", () => {
    const samples = [
      { index: 0, distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const },
      { index: 1, distance: 20, position: { x: 20, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const },
      { index: 2, distance: 21, position: { x: 20, y: 0, z: 1 }, tangent: { x: 0, y: 0, z: 1 }, side: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const },
      { index: 3, distance: 40, position: { x: 20, y: 0, z: 20 }, tangent: { x: 0, y: 0, z: 1 }, side: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const },
    ];
    const director = createRouteCrowdDirector(samples);

    expect(director.update([{ id: 1, distance: 21 }, { id: 2, distance: 21 }, { id: 3, distance: 19 }, { id: 4, distance: 19 }, { id: 5, distance: 19 }], 5).runEnd).toBe(20);
    expect(director.update([{ id: 1, distance: 18, eliminated: true }, { id: 2, distance: 18 }, { id: 3, distance: 21 }, { id: 4, distance: 19 }, { id: 5, distance: 19 }], 5).runEnd).toBe(20);
    expect(director.update([{ id: 1, distance: 18, eliminated: true }, { id: 2, distance: 18 }, { id: 3, distance: 21 }, { id: 4, distance: 19, eliminated: true }, { id: 5, distance: 19 }], 5).runEnd).toBe(40);
  });

  it("changes from the slow straight follow to the fast corner follow at the eightieth unique pass", () => {
    const samples = [
      { index: 0, distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const, kind: "straight" },
      { index: 1, distance: 100, position: { x: 100, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const, kind: "straight" },
      { index: 2, distance: 120, position: { x: 100, y: 0, z: 20 }, tangent: { x: 0, y: 0, z: 1 }, side: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const, kind: "curve" },
    ];
    const director = createRouteCrowdDirector(samples);
    const traffic = (passed: number) => Array.from({ length: 100 }, (_, index) => ({ id: index, distance: index < passed ? 100 : 0 }));

    expect(director.update(traffic(79), 100).pace).toBe("slow");
    expect(director.update(traffic(80), 100).pace).toBe("fast");
  });

  it.each([320 / 740, 1024 / 768])("frames the route pack from behind at aspect %s", (aspect) => {
    const samples = buildValidatedTrack().samples;
    const distance = samples[Math.floor(samples.length * 0.55)]!.distance;
    const shot = writeRouteCrowdFollowShot(mutableShot(), distance, samples, getTrackBounds(samples));
    const camera = new THREE.PerspectiveCamera(60, aspect, shot.near, shot.far);
    camera.position.set(shot.position.x, shot.position.y, shot.position.z); camera.lookAt(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const focus = samples.reduce((nearest, sample) => Math.abs(sample.distance - distance) < Math.abs(nearest.distance - distance) ? sample : nearest, samples[0]!);

    expect(new THREE.Vector3(focus.position.x, focus.position.y, focus.position.z).project(camera).z).toBeGreaterThanOrEqual(-1);
    expect(dot(subtract(shot.lookAt, shot.position), focus.tangent)).toBeGreaterThan(0);
  });

  it.each([320 / 740, 1024 / 768])("fits default modular lane edges and its pack at aspect %s", (aspect) => {
    const samples = buildModularTrack(createValidTrackDesign()).samples;
    const focus = samples.find((sample) => sample.kind !== "curve" && sample.width >= 12)!;
    const shot = writeRouteCrowdFollowShot(mutableShot(), focus.distance, samples, getTrackBounds(samples), 5, "slow", 60, aspect);
    const camera = new THREE.PerspectiveCamera(60, aspect, shot.near, shot.far);
    camera.position.set(shot.position.x, shot.position.y, shot.position.z); camera.lookAt(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z); camera.updateProjectionMatrix(); camera.updateMatrixWorld();

    for (const lateral of [-focus.width * 0.45, 0, focus.width * 0.45]) {
      const point = new THREE.Vector3(focus.position.x + focus.side.x * lateral + focus.up.x * 0.34, focus.position.y + focus.side.y * lateral + focus.up.y * 0.34, focus.position.z + focus.side.z * lateral + focus.up.z * 0.34).project(camera);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1); expect(Math.abs(point.y)).toBeLessThanOrEqual(1); expect(point.z).toBeGreaterThanOrEqual(-1); expect(point.z).toBeLessThanOrEqual(1);
    }
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
