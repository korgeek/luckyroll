import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class TestRenderer {
    shadowMap = { enabled: false };
    outputColorSpace = actual.SRGBColorSpace;
    toneMapping = actual.NoToneMapping;
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(): void { /* test seam */ }
    setSize(): void { /* test seam */ }
    render(): void { /* test seam */ }
    dispose(): void { /* test seam */ }
  }
  return { ...actual, WebGLRenderer: TestRenderer };
});

import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import type { Marble } from "../domain/types";
import { createRaceScene } from "./MarbleRaceScene";

const marble = (id: number): Marble => ({ id, ownerId: `owner-${id}`, color: "#fff", symbol: "●" });

describe("race scene lifecycle boundary", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("emits a custom build error before creating a renderer", () => {
    const events: unknown[] = [];
    const bad = createValidTrackDesign("Bad");
    const cells = [...bad.cells]; cells[1] = null;
    const scene = createRaceScene(document.createElement("canvas"), (event) => events.push(event), { kind: "custom", track: { ...bad, cells } });
    expect(events).toEqual([{ type: "error", message: expect.any(String) }]);
    scene.dispose();
    expect(frames).toHaveLength(0);
  });

  it("tears down idempotently after a custom scene is started", async () => {
    const events: unknown[] = [];
    const scene = createRaceScene(document.createElement("canvas"), (event) => events.push(event), { kind: "custom", track: createValidTrackDesign("Live") });
    await Promise.resolve();
    scene.start([marble(1)], 11);
    await Promise.resolve();
    scene.dispose();
    scene.dispose();
    expect(frames.length).toBeGreaterThan(0);
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => (event as { type: string }).type === "error")).toEqual([]);
  });

  it("holds a started custom race while paused and resumes ticking", async () => {
    const events: { type: string }[] = [];
    const scene = createRaceScene(document.createElement("canvas"), (event) => events.push(event), { kind: "custom", track: createValidTrackDesign("Pause") });
    await Promise.resolve();
    scene.start([marble(1)], 11);
    await new Promise((resolve) => setTimeout(resolve, 50));
    scene.setPaused(true);
    const now = performance.now();
    frames.shift()?.(now);
    frames.shift()?.(now + 17);
    expect(events.filter((event) => event.type === "tick")).toHaveLength(0);
    scene.setPaused(false);
    frames.shift()?.(now + 34);
    expect(events.some((event) => event.type === "tick")).toBe(true);
    scene.dispose();
  });
});
