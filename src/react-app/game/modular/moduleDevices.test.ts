import { describe, expect, it } from "vitest";
import { createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { resolveModuleDevices, resolveModulePreview } from "./moduleDevices";

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => a.x * b.x + a.y * b.y + a.z * b.z;

describe("canonical modular devices", () => {
  it("mirrors bumper tips downstream and keeps all obstacles out of landings", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(devices.bumpers.length % 3).toBe(0);
    expect(new Set(devices.bumpers.map((bumper) => bumper.cellIndex)).size * 3).toBe(devices.bumpers.length);
    for (const bumper of devices.bumpers) {
      expect(dot(bumper.forward, bumper.tipDirection)).toBeGreaterThan(0);
      expect(bumper.clearPassage).toBeGreaterThanOrEqual(3 * 0.68);
      expect(bumper.distanceFromNearestSeam).toBeGreaterThanOrEqual(2);
      expect(bumper.thickness).toBeCloseTo(0.45 * 0.68, 8);
      expect(bumper.height).toBeCloseTo(1.4 * 0.68, 8);
    }
  });

  it("resolves fixed pinwheel and centered booster dimensions", () => {
    const built = buildModularTrack(createWorstCaseTrackDesign());
    const devices = resolveModuleDevices(built.track, built.route, built.samples);
    expect(devices.pinwheels[0]).toMatchObject({ radius: 0.28 * 12, armThickness: 0.5 * 0.68, angularSpeed: 2 });
    expect(devices.pinwheels[0]?.minimumPassage).toBeGreaterThanOrEqual(3 * 0.68);
    const booster = devices.boosters[0];
    expect(booster).toBeDefined();
    if (booster) expect(booster.endDistance - booster.startDistance).toBeCloseTo(0.2 * 20, 8);
  });

  it("uses symmetric bars and no arrow for an unresolved bumper preview", () => {
    const preview = resolveModulePreview({ kind: "bumper", rotation: 0 });
    expect(preview.directionArrow).toBeUndefined();
    expect(preview.bumperOffsets).toEqual([-preview.bumperOffsets[2], 0, -preview.bumperOffsets[0]]);
    expect(preview.collider).toBe(false);
  });
});
