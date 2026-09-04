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
import type { TrackSample } from "./trackTypes";

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

  it("does not report narrow base-track device anchors as physically ready", () => {
    const built = buildValidatedTrack({ features: true });
    expect(built.obstacleLayout.ok).toBe(true);
    expect(built.obstaclePlacement.ok).toBe(false);
    expect(built.obstaclePlacement.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "device-surface-width", message: expect.stringMatching(/base surface|requires/i) }),
    ]));
    expect(built.obstacleLayout.pegHall.baseSurfaceWidth).toBeLessThan(built.obstacleLayout.pegHall.width);
    expect(built.obstacleLayout.pushers.baseSurfaceWidth).toBeLessThan(built.obstacleLayout.pushers.hallWidth);
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
    const nullEntry = resolveObstacleLayout([null] as unknown as readonly TrackSample[], NEON_OBSTACLE_LAYOUT);
    const incomplete = Object.fromEntries(Object.entries(samples[0]).filter(([key]) => !["channelDepth", "bankRadians", "zone"].includes(key)));
    const incompleteEntry = resolveObstacleLayout([incomplete] as unknown as readonly TrackSample[], NEON_OBSTACLE_LAYOUT);
    expect(empty.ok).toBe(false);
    expect(malformed.ok).toBe(false);
    expect(nullEntry.ok).toBe(false);
    expect(incompleteEntry.ok).toBe(false);
    if (!empty.ok) expect(empty.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    if (!malformed.ok) expect(malformed.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    if (!nullEntry.ok) expect(nullEntry.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    if (!incompleteEntry.ok) expect(incompleteEntry.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid-samples", message: expect.any(String) })]));
    expect(validateObstacleLayout(empty)).toEqual(empty.failures);
  });

  it("fails closed for noncanonical sample indexes without using them as array offsets", () => {
    const single = samples[0];
    const malformedInputs: readonly (readonly TrackSample[])[] = [
      [{ ...single, index: 7 }],
      [{ ...single, index: -1 }],
      [{ ...single, index: 0.5 }],
      [{ ...samples[1] }, { ...samples[0] }],
    ];
    for (const malformed of malformedInputs) {
      expect(() => resolveObstacleLayout(malformed, NEON_OBSTACLE_LAYOUT)).not.toThrow();
      const resolvedMalformed = resolveObstacleLayout(malformed, NEON_OBSTACLE_LAYOUT);
      expect(resolvedMalformed.ok).toBe(false);
      if (!resolvedMalformed.ok) {
        expect(resolvedMalformed.failures).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "invalid-samples", message: expect.any(String) }),
        ]));
      }
    }
  });

  it("fails closed when layout measurements are non-finite", () => {
    const nonFinite = resolveObstacleLayout(samples, {
      ...NEON_OBSTACLE_LAYOUT,
      pushers: { ...NEON_OBSTACLE_LAYOUT.pushers, reach: Number.POSITIVE_INFINITY },
    });
    expect(nonFinite.ok).toBe(false);
    if (!nonFinite.ok) {
      expect(nonFinite.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "non-finite-layout", message: expect.any(String) }),
      ]));
    }
  });

  it("does not emit a valid layout when finite measurements overflow a pusher pose", () => {
    const overflowing = resolveObstacleLayout(samples, {
      ...NEON_OBSTACLE_LAYOUT,
      pushers: { ...NEON_OBSTACLE_LAYOUT.pushers, reach: Number.MAX_VALUE, travel: 0 },
    });
    expect(overflowing.ok).toBe(false);
    if (!overflowing.ok) {
      expect(overflowing.failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "non-finite-layout", message: expect.any(String) }),
      ]));
    }
  });

  it("rejects non-finite resolved placement measurements", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(validateObstacleLayout({
      ...resolved,
      start: { ...resolved.start, frame: { ...resolved.start.frame, position: { ...resolved.start.frame.position, x: Number.NaN } } },
      pegHall: { ...resolved.pegHall, width: Number.NaN },
      pegs: [{ ...resolved.pegs[0], radius: Number.POSITIVE_INFINITY }],
      pushers: { ...resolved.pushers, phaseOffset: Number.NaN },
      vortex: { ...resolved.vortex, outletDiameter: Number.NaN },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "non-finite-layout", message: expect.any(String) }),
    ]));
  });

  it("rejects non-finite resolved frame measurements", () => {
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(validateObstacleLayout({
      ...resolved,
      start: { ...resolved.start, frame: { ...resolved.start.frame, position: { ...resolved.start.frame.position, x: Number.NaN } } },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "non-finite-layout", message: expect.any(String) }),
    ]));
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

  it("fails closed for finite layouts that violate intrinsic obstacle safety", () => {
    const overlappingPegs = resolveObstacleLayout(samples, {
      ...NEON_OBSTACLE_LAYOUT,
      pegHall: {
        ...NEON_OBSTACLE_LAYOUT.pegHall,
        pegs: [NEON_OBSTACLE_LAYOUT.pegHall.pegs[0], NEON_OBSTACLE_LAYOUT.pegHall.pegs[0]],
      },
    });
    const blockedPushers = resolveObstacleLayout(samples, {
      ...NEON_OBSTACLE_LAYOUT,
      pushers: { ...NEON_OBSTACLE_LAYOUT.pushers, hallWidth: 2 },
    });
    const invalidVortex = resolveObstacleLayout(samples, {
      ...NEON_OBSTACLE_LAYOUT,
      vortex: { ...NEON_OBSTACLE_LAYOUT.vortex, outletDiameter: 1, verticalDrop: 1 },
    });

    for (const [result, code] of [
      [overlappingPegs, "peg-clearance"],
      [blockedPushers, "pusher-passage"],
      [invalidVortex, "vortex-outlet"],
    ] as const) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failures).toEqual(expect.arrayContaining([
          expect.objectContaining({ code, message: expect.any(String) }),
        ]));
      }
    }
  });
});
