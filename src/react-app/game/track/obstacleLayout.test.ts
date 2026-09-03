import { describe, expect, it } from "vitest";
import {
  MARBLE_DIAMETER,
  MARBLE_RADIUS,
  MIN_DEVICE_CLEARANCE,
  NEON_OBSTACLE_LAYOUT,
  minimumPegSurfaceGap,
  minimumPegWallGap,
  openPusherPassage,
  resolveObstacleLayout,
  resolvePusherPose,
  validateObstacleLayout,
} from "./obstacleLayout";
import { buildValidatedTrack } from "./trackBuild";

const samples = buildValidatedTrack({ features: true }).samples;

describe("neon obstacle layout", () => {
  const resolved = resolveObstacleLayout(samples, NEON_OBSTACLE_LAYOUT);

  it("defines the approved marble and safety constants", () => {
    expect(MARBLE_RADIUS).toBe(0.34);
    expect(MARBLE_DIAMETER).toBe(0.68);
    expect(MIN_DEVICE_CLEARANCE).toBe(2.04);
    expect(MIN_DEVICE_CLEARANCE).toBe(3 * MARBLE_DIAMETER);
  });

  it("keeps the canonical measurements immutable with exact anchors", () => {
    expect(Object.isFrozen(NEON_OBSTACLE_LAYOUT)).toBe(true);
    expect(Object.isFrozen(NEON_OBSTACLE_LAYOUT.pegHall.pegs)).toBe(true);
    expect(NEON_OBSTACLE_LAYOUT.start.progress).toBe(0);
    expect(NEON_OBSTACLE_LAYOUT.pegHall.progress).toBe(0.31);
    expect(NEON_OBSTACLE_LAYOUT.pushers.progress).toBe(0.43);
    expect(NEON_OBSTACLE_LAYOUT.branch).toEqual({ startProgress: 0.56, endProgress: 0.67, mergeProgress: 0.7 });
    expect(NEON_OBSTACLE_LAYOUT.vortex.progress).toBe(0.79);
    expect(NEON_OBSTACLE_LAYOUT.pegHall.pegs).toHaveLength(7);
    expect(new Set(NEON_OBSTACLE_LAYOUT.pegHall.pegs.map((peg) => `${peg.along}:${peg.lateral}`))).toEqual(new Set([
      "-3:-5.8", "-2:-2.9", "-1:0", "0:2.9", "1:5.8", "2:-2.9", "3:2.9",
    ]));
  });

  it("uses the approved vortex dimensions", () => {
    expect(NEON_OBSTACLE_LAYOUT.vortex.outletDiameter).toBe(1.36);
    expect(NEON_OBSTACLE_LAYOUT.vortex.verticalDrop).toBe(1.36);
  });

  it("exposes the validated resolved layout from the canonical track build", () => {
    const built = buildValidatedTrack({ features: true });
    expect(built.obstacleLayout.ok).toBe(true);
    expect(built.obstacleLayout.pegs).toHaveLength(7);
  });

  it("keeps every peg opening at least three marble diameters wide", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(minimumPegSurfaceGap(resolved.pegs)).toBeGreaterThanOrEqual(2.04);
    expect(minimumPegWallGap(resolved.pegs, resolved.pegHall)).toBeGreaterThanOrEqual(2.04);
    for (let first = 0; first < resolved.pegs.length; first += 1) {
      for (let second = first + 1; second < resolved.pegs.length; second += 1) {
        const left = resolved.pegs[first]; const right = resolved.pegs[second];
        expect(Math.hypot(left.center.x - right.center.x, left.center.y - right.center.y, left.center.z - right.center.z) - left.radius - right.radius)
          .toBeGreaterThanOrEqual(2.04);
      }
    }
    for (const peg of resolved.pegs) {
      expect(resolved.pegHall.width / 2 + peg.lateral - peg.radius).toBeGreaterThanOrEqual(2.04);
      expect(resolved.pegHall.width / 2 - peg.lateral - peg.radius).toBeGreaterThanOrEqual(2.04);
    }
  });

  it("resolves frozen finite frames at the closest progress anchors", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.pegs)).toBe(true);
    for (const frame of [resolved.start.frame, resolved.pegHall.frame, resolved.pushers.frame, resolved.vortex.frame]) {
      expect(Object.isFrozen(frame)).toBe(true);
      expect(Object.values(frame.position).every(Number.isFinite)).toBe(true);
      expect(Object.values(frame.tangent).every(Number.isFinite)).toBe(true);
      expect(Object.values(frame.side).every(Number.isFinite)).toBe(true);
      expect(Object.values(frame.up).every(Number.isFinite)).toBe(true);
    }
    for (const [progress, frame] of [
      [0, resolved.start.frame],
      [0.31, resolved.pegHall.frame],
      [0.43, resolved.pushers.frame],
      [0.79, resolved.vortex.frame],
    ] as const) {
      const closest = samples.reduce((nearest, sample) =>
        Math.abs(sample.index / (samples.length - 1) - progress) < Math.abs(nearest.index / (samples.length - 1) - progress)
          ? sample : nearest,
      );
      expect(frame.sampleIndex).toBe(closest.index);
    }
  });

  it("leaves a 2.04-wide route at every sampled pusher phase", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    for (let phase = 0; phase <= 1; phase += 0.025) {
      expect(openPusherPassage(resolvePusherPose(resolved.pushers, phase))).toBeGreaterThanOrEqual(2.04);
    }
  });

  it("clamps and wraps pusher phases deterministically", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolvePusherPose(resolved.pushers, -0.5)).toEqual(resolvePusherPose(resolved.pushers, 0));
    expect(resolvePusherPose(resolved.pushers, 1.5)).toEqual(resolvePusherPose(resolved.pushers, 0.5));
    expect(resolvePusherPose(resolved.pushers, 0.25)).toEqual(resolvePusherPose(resolved.pushers, 1.25));
  });

  it("fails closed for empty or malformed samples", () => {
    const empty = resolveObstacleLayout([], NEON_OBSTACLE_LAYOUT);
    const malformed = resolveObstacleLayout([{ ...samples[0], tangent: { x: Number.NaN, y: 0, z: 0 } }], NEON_OBSTACLE_LAYOUT);
    expect(empty.ok).toBe(false);
    expect(malformed.ok).toBe(false);
    if (!empty.ok) expect(empty.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    if (!malformed.ok) expect(malformed.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    expect(validateObstacleLayout(empty)).toEqual(empty.failures);
  });

  it("reports every safety failure code with an actionable message", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const failures = validateObstacleLayout({
      ...resolved,
      pegs: resolved.pegs.map((peg, index) => index === 1 ? { ...peg, center: resolved.pegs[0].center } : peg),
      pegHall: { ...resolved.pegHall, width: 2 },
      pushers: { ...resolved.pushers, hallWidth: 2, travel: 8 },
      vortex: { ...resolved.vortex, outletDiameter: 1, verticalDrop: 1 },
    });
    for (const code of ["peg-clearance", "wall-clearance", "pusher-passage", "vortex-outlet", "vortex-drop"] as const) {
      expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({ code, message: expect.any(String) })]));
    }
  });
});
