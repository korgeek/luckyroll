import { describe, expect, it } from "vitest";
import { createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { resolveModuleDevices, resolveModulePreview } from "./moduleDevices";
import { CHANNEL_WIDTH, MARBLE_DIAMETER } from "./modularTypes";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => a.x * b.x + a.y * b.y + a.z * b.z;
const lerp = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, amount: number) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const frameAt = (rows: readonly { localU: number; position: { x: number; y: number; z: number }; side: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } }[], localU: number) => {
  const lower = rows.reduce((candidate, row) => row.localU <= localU && row.localU >= candidate.localU ? row : candidate, rows[0]);
  const upper = rows.find((row) => row.localU >= localU) ?? rows[rows.length - 1];
  const amount = (localU - lower.localU) / (upper.localU - lower.localU || 1);
  return { position: lerp(lower.position, upper.position, amount), side: lerp(lower.side, upper.side, amount), up: lerp(lower.up, upper.up, amount) };
};

describe("canonical modular devices", () => {
  it("mirrors bumper tips downstream and keeps all obstacles out of landings", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(devices.bumpers.length % 5).toBe(0);
    expect(new Set(devices.bumpers.map((bumper) => bumper.cellIndex)).size * 5).toBe(devices.bumpers.length);
    for (const cellIndex of new Set(devices.bumpers.map((bumper) => bumper.cellIndex))) {
      const bars = devices.bumpers.filter((bumper) => bumper.cellIndex === cellIndex);
      expect(bars.map((bumper) => bumper.localU)).toEqual([0.25, 0.375, 0.5, 0.625, 0.75]);
      const rows = built.samples.filter((sample) => sample.cellIndex === cellIndex);
      for (const [index, localU] of [0.25, 0.375, 0.5, 0.625, 0.75].entries()) {
        const frame = frameAt(rows, localU);
        const sign = index % 2 === 0 ? -1 : 1;
        const expected = { x: frame.position.x + frame.side.x * sign * 4 + frame.up.x * 1.4 * 0.68 / 2, y: frame.position.y + frame.side.y * sign * 4 + frame.up.y * 1.4 * 0.68 / 2, z: frame.position.z + frame.side.z * sign * 4 + frame.up.z * 1.4 * 0.68 / 2 };
        expect(distance(bars[index].center, expected)).toBeLessThan(1e-6);
      }
    }
    for (const bumper of devices.bumpers) {
      expect(dot(bumper.forward, bumper.tipDirection)).toBeGreaterThan(0);
      expect(Math.abs(dot(bumper.up, bumper.axis))).toBeLessThan(1e-6);
      expect(bumper.clearPassage).toBeGreaterThanOrEqual(3 * 0.68);
      expect(bumper.distanceFromNearestSeam).toBeGreaterThanOrEqual(2);
      expect(bumper.thickness).toBeCloseTo(0.45 * 0.68, 8);
      expect(bumper.height).toBeCloseTo(1.4 * 0.68, 8);
    }
  });

  it("resolves fixed pinwheel and centered booster dimensions", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(devices.pinwheels[0]).toMatchObject({ radius: 4, armThickness: 0.5 * 0.68, angularSpeed: 5 });
    expect(devices.pinwheels[0]?.minimumPassage).toBe(12 - 2 * 4);
    const booster = devices.boosters[0];
    expect(booster).toBeDefined();
    if (booster) {
      const rows = built.samples.filter((sample) => sample.cellIndex === booster.cellIndex);
      const first = rows[0];
      expect(first).toBeDefined();
      if (first) {
        expect(booster.startDistance).toBeCloseTo(first.distance - first.localU * 20 + 8, 8);
        expect(booster.endDistance).toBeCloseTo(first.distance - first.localU * 20 + 12, 8);
      }
    }
  });

  it("places a high-walled start enclosure directly upstream from the track", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    const first = built.samples[0]!;
    const fromStart = { x: first.position.x - devices.start.frame.position.x, y: first.position.y - devices.start.frame.position.y, z: first.position.z - devices.start.frame.position.z };
    const along = dot(fromStart, devices.start.frame.tangent);
    expect(devices.start).toMatchObject({ length: 10.2, runoutLength: 30.2, width: 10.4, wallHeight: 4 });
    expect(along).toBeCloseTo(devices.start.length, 8);
    expect(dot({ x: devices.start.gate.center.x - devices.start.frame.position.x, y: devices.start.gate.center.y - devices.start.frame.position.y, z: devices.start.gate.center.z - devices.start.frame.position.z }, devices.start.frame.tangent)).toBeCloseTo(9.4, 8);
    expect(devices.start.pusher).toBeDefined();
    if (devices.start.pusher) {
      const pusher = devices.start.pusher;
      const initialAlong = dot({ x: pusher.center.x - devices.start.frame.position.x, y: pusher.center.y - devices.start.frame.position.y, z: pusher.center.z - devices.start.frame.position.z }, devices.start.frame.tangent);
      const finalAlong = dot({ x: pusher.endCenter.x - devices.start.frame.position.x, y: pusher.endCenter.y - devices.start.frame.position.y, z: pusher.endCenter.z - devices.start.frame.position.z }, devices.start.frame.tangent);
      const gateAlong = dot({ x: devices.start.gate.center.x - devices.start.frame.position.x, y: devices.start.gate.center.y - devices.start.frame.position.y, z: devices.start.gate.center.z - devices.start.frame.position.z }, devices.start.frame.tangent);
      expect(pusher).toMatchObject({ width: CHANNEL_WIDTH - MARBLE_DIAMETER, height: 3.2, depth: 0.36, durationMs: 650 });
      expect(initialAlong + pusher.depth / 2).toBeLessThan(0.62 - MARBLE_DIAMETER / 2);
      expect(finalAlong + pusher.depth / 2).toBeLessThan(gateAlong - devices.start.gate.depth / 2);
    }
  });

  it("uses symmetric bars and no arrow for an unresolved bumper preview", () => {
    const preview = resolveModulePreview({ kind: "bumper", rotation: 0 });
    expect(preview.directionArrow).toBeUndefined();
    expect(preview.bumperOffsets).toEqual([-preview.bumperOffsets[2], 0, -preview.bumperOffsets[0]]);
    expect(preview.collider).toBe(false);
  });
});
