import { describe, expect, it } from "vitest";
import { createValidTrackDesign } from "../../designer/trackDesign.testSupport";
import { assertValidTrackDesign } from "../../designer/trackValidation";
import {
  boardToWorld,
  moduleWidthAt,
  sampleModulePath,
} from "./modulePath";

describe("canonical modular module paths", () => {
  it("keeps reciprocal ports G2 and funnel ports at full width", () => {
    const track = createValidTrackDesign();
    const route = assertValidTrackDesign(track);
    const samples = sampleModulePath(track, route);
    const seam = samples.filter((sample) => sample.port?.cellIndex === 4 || sample.port?.cellIndex === 9);
    const upstream = seam.find((sample) => sample.port?.cellIndex === 4 && sample.localU === 1)?.port;
    const downstream = { position: { x: 90, y: 0, z: 20 }, outwardTangent: { x: 0, y: 0, z: -1 }, curvature: { x: 0, y: 0, z: 0 } };

    expect(upstream).toBeDefined();
    expect(Math.hypot(
      upstream!.position.x - downstream!.position.x,
      upstream!.position.y - downstream!.position.y,
      upstream!.position.z - downstream!.position.z,
    )).toBeLessThanOrEqual(1e-6);
    expect(upstream!.outwardTangent.x * downstream!.outwardTangent.x
      + upstream!.outwardTangent.y * downstream!.outwardTangent.y
      + upstream!.outwardTangent.z * downstream!.outwardTangent.z).toBeCloseTo(-1, 6);
    expect(Math.hypot(upstream!.curvature.x, upstream!.curvature.y, upstream!.curvature.z)).toBeLessThanOrEqual(1e-6);
    expect(Math.hypot(downstream!.curvature.x, downstream!.curvature.y, downstream!.curvature.z)).toBeLessThanOrEqual(1e-6);
    expect(moduleWidthAt("funnel", 0)).toBe(12);
    expect(moduleWidthAt("funnel", 0.5)).toBe(9.6);
    expect(moduleWidthAt("funnel", 1)).toBe(12);
  });

  it("keeps the board tilt exact and samples every route cell in order", () => {
    const transformed = boardToWorld({ x: 0, y: 0, z: 20 });
    expect(transformed.x).toBe(0);
    expect(transformed.y).toBeCloseTo(-20 * Math.sin(Math.PI / 9), 12);
    expect(transformed.z).toBeCloseTo(20 * Math.cos(Math.PI / 9), 12);

    const track = createValidTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    expect(samples[0].cellIndex).toBe(0);
    expect(samples[samples.length - 1]?.cellIndex).toBe(39);
    expect(new Set(samples.map((sample) => sample.cellIndex)).size).toBe(36);
    expect(samples.some((sample, index) => index > 0 && sample.position.y > samples[index - 1].position.y)).toBe(false);
  });
});
