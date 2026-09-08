import { describe, expect, it } from "vitest";
import { createAdaptiveQuality } from "./adaptiveQuality";

describe("adaptive rendering quality", () => {
  it("steps down after sustained slow frames and recovers one level at a time", () => {
    const quality = createAdaptiveQuality();
    const run = (count: number, ms: number, eligible = true) => { let level = 0; for (let i = 0; i < count; i++) level = quality.sample(ms, eligible); return level; };
    expect(run(80, 33)).toBe(0);
    expect(run(20, 33)).toBe(1);
    expect(run(100, 33)).toBe(2);
    expect(run(500, 16)).toBe(2);
    expect(run(200, 16)).toBe(1);
    expect(run(700, 16)).toBe(0);
  });

  it("ignores pauses, hidden frames and loading gaps, and resets accumulated pressure", () => {
    const quality = createAdaptiveQuality();
    for (let i = 0; i < 80; i++) quality.sample(33, true);
    expect(quality.sample(1000, true)).toBe(0);
    for (let i = 0; i < 70; i++) expect(quality.sample(33, true)).toBe(0);
    for (let i = 0; i < 200; i++) expect(quality.sample(33, false)).toBe(0);
    for (let i = 0; i < 70; i++) expect(quality.sample(33, true)).toBe(0);
    expect(quality.sample(NaN, true)).toBe(0);
    for (let i = 0; i < 200; i++) quality.sample(33, true);
    quality.reset(); expect(quality.sample(16, true)).toBe(0);
  });
});
