import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { resolveModuleDevices, resolveModulePreview } from "./moduleDevices";
import { CHANNEL_WIDTH, MARBLE_DIAMETER } from "./modularTypes";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => a.x * b.x + a.y * b.y + a.z * b.z;
const lerp = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, amount: number) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount });
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const frameAt = (rows: readonly { localU: number; position: { x: number; y: number; z: number }; tangent: { x: number; y: number; z: number }; side: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } }[], localU: number) => {
  const lower = rows.reduce((candidate, row) => row.localU <= localU && row.localU >= candidate.localU ? row : candidate, rows[0]);
  const upper = rows.find((row) => row.localU >= localU) ?? rows[rows.length - 1];
  const amount = (localU - lower.localU) / (upper.localU - lower.localU || 1);
  return { position: lerp(lower.position, upper.position, amount), tangent: lerp(lower.tangent, upper.tangent, amount), side: lerp(lower.side, upper.side, amount), up: lerp(lower.up, upper.up, amount) };
};

describe("canonical modular devices", () => {
  it("derives return assist only for a booster immediately before a bumper on the valid route", () => {
    const built = buildModularTrack(createValidTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);

    expect(devices.boosters.map((booster) => [booster.cellIndex, booster.returnAssist])).toEqual([[17, false], [36, true]]);
  });

  it("uses six small round bumpers in a three-two-one pinball pattern", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    const cellIndex = devices.bumpers[0]!.cellIndex;
    const bumpers = devices.bumpers.filter((bumper) => bumper.cellIndex === cellIndex);

    expect(bumpers.map((bumper) => bumper.shape)).toEqual(Array.from({ length: 6 }, () => "round"));
    expect(bumpers.map((bumper) => bumper.localU)).toEqual([0.25, 0.25, 0.25, 0.5, 0.5, 0.75]);
    const laterals = bumpers.map((bumper) => {
      const frame = frameAt(built.samples.filter((sample) => sample.cellIndex === cellIndex), bumper.localU);
      return dot({ x: bumper.center.x - frame.position.x, y: bumper.center.y - frame.position.y, z: bumper.center.z - frame.position.z }, frame.side);
    });
    laterals.forEach((lateral, index) => expect(lateral).toBeCloseTo([-2.4, 0, 2.4, -1.2, 1.2, 0][index], 8));
    expect(bumpers[5]).toMatchObject({ radius: 0.75 * MARBLE_DIAMETER, height: 1.4 * MARBLE_DIAMETER });
  });

  it("keeps every round bumper clear of walls, seams, and its neighbours", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(devices.bumpers.length % 6).toBe(0);
    expect(new Set(devices.bumpers.map((bumper) => bumper.cellIndex)).size * 6).toBe(devices.bumpers.length);
    for (const cellIndex of new Set(devices.bumpers.map((bumper) => bumper.cellIndex))) {
      const bumpers = devices.bumpers.filter((bumper) => bumper.cellIndex === cellIndex);
      const rows = built.samples.filter((sample) => sample.cellIndex === cellIndex);
      for (const bumper of bumpers) {
        expect(bumper.shape).toBe("round");
        if (bumper.shape !== "round") continue;
        const frame = frameAt(rows, bumper.localU);
        const lateral = dot({ x: bumper.center.x - frame.position.x, y: bumper.center.y - frame.position.y, z: bumper.center.z - frame.position.z }, frame.side);
        const expected = { x: frame.position.x + frame.side.x * lateral + frame.up.x * bumper.height / 2, y: frame.position.y + frame.side.y * lateral + frame.up.y * bumper.height / 2, z: frame.position.z + frame.side.z * lateral + frame.up.z * bumper.height / 2 };
        expect(distance(bumper.center, expected)).toBeLessThan(1e-6);
        expect(bumper.clearPassage).toBeCloseTo(CHANNEL_WIDTH / 2 - Math.abs(lateral) - bumper.radius, 8);
        expect(bumper.clearPassage).toBeGreaterThanOrEqual(3 * MARBLE_DIAMETER);
        expect(bumper.distanceFromNearestSeam).toBeCloseTo(Math.min(bumper.localU, 1 - bumper.localU) * 20 - bumper.radius, 8);
        expect(bumper.distanceFromNearestSeam).toBeGreaterThanOrEqual(2);
      }
      for (let left = 0; left < bumpers.length; left += 1) for (let right = left + 1; right < bumpers.length; right += 1) {
        const a = bumpers[left]; const b = bumpers[right];
        if (a.shape === "round" && b.shape === "round") expect(distance(a.center, b.center) - a.radius - b.radius).toBeGreaterThanOrEqual(1.5 * MARBLE_DIAMETER);
      }
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
    expect(devices.start).toMatchObject({ length: 10.2, runoutLength: 30.2, width: 10.4, wallHeight: 6 });
    expect(devices.start.gate.height).toBeGreaterThanOrEqual(2.14);
    expect(dot({ x: devices.start.gate.center.x - devices.start.frame.position.x, y: devices.start.gate.center.y - devices.start.frame.position.y, z: devices.start.gate.center.z - devices.start.frame.position.z }, devices.start.frame.up)).toBeCloseTo(devices.start.gate.height / 2, 8);
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
