import { describe, expect, it } from "vitest";
import { buildValidatedTrack } from "./track/trackBuild";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import {
  createRaceFocusDirector,
  getBirdViewUp,
  getCameraShot,
  getTrackBounds,
  hasCameraClipChanged,
  selectFocusRank,
  writeControlledTrackFollowShot,
  writeTrackFollowShot,
  type CameraShot,
  type RaceFocusTarget,
} from "./cameraPlan";

const canonicalTrackBounds = getTrackBounds(buildValidatedTrack().samples);
const isFiniteVec3 = (value: Vec3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const target = (id: RaceFocusTarget["id"], progress: number): RaceFocusTarget => ({ id, progress });
const field = (count: number, offset = 0): RaceFocusTarget[] => Array.from({ length: count }, (_, index) => target(`marble-${offset + index}`, 1 - index / count));
const mutableShot = (): CameraShot => ({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 10 });

describe("track-bound race camera plan", () => {
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

  it("writes the exact directed local-frame pose and finite clipping plane values", () => {
    const shot = mutableShot();
    const sample = { tangent: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };

    writeTrackFollowShot(shot, { x: 4, y: 2, z: -3 }, sample, { center: { x: 0, y: 0, z: 0 }, radius: 20 });

    expect(shot.position).toEqual({ x: 11.5, y: 4.8, z: -3 });
    expect(shot.lookAt).toEqual({ x: 4, y: 2.45, z: -3 });
    expect(shot.near).toBeLessThan(shot.far);
    expect(isFiniteVec3(shot.position)).toBe(true);
    expect(isFiniteVec3(shot.lookAt)).toBe(true);
  });

  it("applies pointer, touch, and zoom offsets after the directed pose without changing its target", () => {
    const directed = mutableShot();
    const controlled = mutableShot();
    const sample = { tangent: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };
    writeTrackFollowShot(directed, { x: 0, y: 0, z: 0 }, sample, canonicalTrackBounds);

    writeControlledTrackFollowShot(controlled, directed, sample.up, { yaw: Math.PI / 2, pitch: 0.2, zoom: 1.2 });

    expect(controlled.lookAt).toEqual(directed.lookAt);
    expect(controlled.position).not.toEqual(directed.position);
    expect(isFiniteVec3(controlled.position)).toBe(true);
  });

  it("only flags a projection update when camera clipping actually changes", () => {
    expect(hasCameraClipChanged({ near: 0.5, far: 300 }, { near: 0.5, far: 300 })).toBe(false);
    expect(hasCameraClipChanged({ near: 0.5, far: 300 }, { near: 0.6, far: 300 })).toBe(true);
  });
});
