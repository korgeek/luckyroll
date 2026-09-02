import { describe, expect, it } from "vitest";
import { createLuckyRollTrackSpec } from "./trackSpec";
import { projectToTrack, sampleTrack } from "./trackSampler";
import type { TrackSample, Vec3 } from "./trackTypes";

describe("track centerline sampler", () => {
  const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const maxHeadingDelta = (items: readonly TrackSample[]) => Math.max(...items.slice(1).map((sample, index) => {
    const previous = items[index];
    const a = Math.atan2(previous.tangent.z, previous.tangent.x);
    const b = Math.atan2(sample.tangent.z, sample.tangent.x);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  }));
  const spec = createLuckyRollTrackSpec();
  const samples = sampleTrack(spec);

  it("uses the approved half-unit sampling density", () => {
    expect(spec.sampleSpacing).toBe(0.5);
  });

  it("samples the route at stable arc-length intervals", () => {
    const gaps = samples.slice(1).map((sample, index) => distance(sample.position, samples[index].position));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1.1);
    expect(Math.min(...gaps.slice(0, -1))).toBeGreaterThanOrEqual(spec.sampleSpacing * 0.75);
  });

  it("keeps the authoritative centerline within the approved course length", () => {
    const length = samples.slice(1).reduce((total, sample, index) =>
      total + distance(sample.position, samples[index].position), 0);

    expect(length).toBeGreaterThanOrEqual(350);
    expect(length).toBeLessThanOrEqual(450);
  });

  it("never creates an uphill sample", () => {
    expect(samples.every((sample, index) => index === 0 || sample.position.y < samples[index - 1].position.y)).toBe(true);
  });

  it("keeps adjacent tangents below the maximum heading change", () => {
    expect(maxHeadingDelta(samples)).toBeLessThan(0.16);
  });

  it("orients each local up vector toward the world sky", () => {
    expect(samples.every((sample) => sample.up.y > 0)).toBe(true);
  });

  it("projects A and 12 to opposite progress endpoints", () => {
    expect(projectToTrack(samples[0].position, samples).progress).toBe(0);
    expect(projectToTrack(samples[samples.length - 1].position, samples).progress).toBe(1);
  });
});
