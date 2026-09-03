import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  frames: [] as FrameRequestCallback[], courseCalls: [] as unknown[], order: [] as string[], emitted: [] as string[], projectedSamples: [] as unknown[][],
  courseSamples: undefined as unknown[] | undefined, worlds: [] as { id: number; freeCount: number; timestep: number; step: () => void; free: () => void }[], runs: [] as { id: number; disposeCount: number }[],
  worldSteps: 0, rendererDisposals: 0, failWorld: false, failRun: false, badBody: false,
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class TestRenderer {
    shadowMap = { enabled: false }; outputColorSpace = actual.SRGBColorSpace; toneMapping = actual.NoToneMapping;
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(): void {} setSize(): void {} render(): void {}
    dispose(): void { seams.rendererDisposals += 1; seams.order.push("renderer-dispose"); }
  }
  return { ...actual, WebGLRenderer: TestRenderer };
});

vi.mock("./raceCourse", async () => {
  const { Group } = await vi.importActual<typeof import("three")>("three");
  const sample = (index: number) => ({ index, distance: index, position: { x: index, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: 0, zone: "run" as const });
  return {
    createBuiltInTrackResources: () => { throw new Error("unused test seam"); },
    createRaceCourse: (selection: { kind: string; track?: { cells: readonly unknown[] } }, options?: unknown) => {
      seams.courseCalls.push({ selection, options });
      if (selection.kind === "custom" && selection.track?.cells[1] === null) throw new Error("invalid route");
      const samples = [sample(0), sample(1)]; seams.courseSamples = samples;
      const runCourse = {
        kind: selection.kind === "custom" ? "custom" as const : "builtin" as const, samples,
        geometry: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), featurePositions: new Float32Array(), featureNormals: new Float32Array(), featureIndices: new Uint32Array(), samples, profileSegments: 0, triangleCount: 0 },
        renderGroup: new Group(), attach: () => undefined,
        createRun: (_world: unknown, count: number, _seed: number, remainingRestart: boolean) => {
          if (seams.failRun) throw new Error("run failed");
          const id = seams.runs.length + 1; const run = { id, disposeCount: 0 }; seams.runs.push(run); seams.order.push(`run:${id}:${count}:${remainingRestart}`);
          return {
            launchPositions: Array.from({ length: count }, () => ({ x: 0, y: 1, z: 0, crossOffset: 0, row: 0, column: 0, physicalLaunchPosition: true as const })),
            stepBeforeWorld: () => { seams.order.push(`before:${id}`); return { raceClockStarted: true }; },
            stepAfterWorld: () => { seams.order.push(`after:${id}`); return []; }, reset: (restart: boolean) => { seams.order.push(`reset:${id}:${restart}`); },
            dispose: () => { run.disposeCount += 1; seams.order.push(`run-dispose:${id}`); },
          };
        },
        dispose: () => { seams.order.push("course-dispose"); },
      };
      return runCourse;
    },
  };
});

vi.mock("./track/trackPhysics", () => ({
  initializeTrackPhysics: () => seams.failWorld ? Promise.reject(new Error("init failed")) : Promise.resolve(),
  createTrackPhysicsWorld: () => {
    if (seams.failWorld) throw new Error("world failed");
    const id = seams.worlds.length + 1; const world = { id, freeCount: 0, timestep: 1 / 60, step: () => { seams.worldSteps += 1; seams.order.push(`world:${id}`); }, free: () => { world.freeCount += 1; seams.order.push(`world-free:${id}`); } };
    seams.worlds.push(world); return world;
  },
  createMarbleBodies: (_world: unknown, positions: readonly { x: number; y: number; z: number }[]) => [{ translation: () => seams.badBody ? { x: Number.NaN, y: 0, z: 0 } : positions[0], setEnabled: () => undefined }],
  distanceSquaredToSample: () => 0, insideFinishVolume: () => false, createTrackCollider: () => undefined,
}));

vi.mock("./track/trackSampler", () => ({ projectToTrack: (_position: unknown, samples: readonly unknown[]) => { seams.projectedSamples.push(samples as unknown[]); return { sampleIndex: 0, progress: 0, distanceSquared: 0 }; } }));

import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import type { Marble } from "../domain/types";
import { createRaceScene } from "./MarbleRaceScene";

const marble = (id: number): Marble => ({ id, ownerId: `owner-${id}`, color: "#fff", symbol: "●" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const addListener = vi.spyOn(EventTarget.prototype, "addEventListener");
const removeListener = vi.spyOn(EventTarget.prototype, "removeEventListener");
const startScene = async (selection: Parameters<typeof createRaceScene>[2] = { kind: "custom", track: createValidTrackDesign("Scene") }) => {
  const scene = createRaceScene(document.createElement("canvas"), (event) => { seams.emitted.push(event.type); seams.order.push(`emit:${event.type}`); }, selection);
  await settle(); scene.start([marble(1)], 11); await settle(); return scene;
};

describe("race scene lifecycle boundary", () => {
  beforeEach(() => {
    seams.frames.length = 0; seams.courseCalls.length = 0; seams.order.length = 0; seams.emitted.length = 0; seams.projectedSamples.length = 0; seams.courseSamples = undefined; seams.worlds.length = 0; seams.runs.length = 0; seams.worldSteps = 0; seams.rendererDisposals = 0; seams.failWorld = false; seams.failRun = false; seams.badBody = false; addListener.mockClear(); removeListener.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { seams.frames.push(callback); return seams.frames.length; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("emits a custom build error before creating a renderer", () => {
    const bad = createValidTrackDesign("Bad"); const cells = [...bad.cells]; cells[1] = null;
    const scene = createRaceScene(document.createElement("canvas"), (event) => seams.emitted.push(event.type), { kind: "custom", track: { ...bad, cells } });
    expect(seams.emitted).toEqual(["error"]); scene.dispose(); expect(seams.frames).toHaveLength(0); expect(seams.rendererDisposals).toBe(0);
  });

  it("uses custom samples, orders fixed work, pauses it, and runs past custom timeout", async () => {
    const scene = await startScene(); const now = performance.now(); scene.setPaused(true); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
    expect(seams.order.filter((entry) => /^(before|world:|after)/.test(entry))).toEqual([]); expect(seams.worldSteps).toBe(0);
    scene.setPaused(false); seams.frames.shift()?.(now + 34); expect(seams.order.slice(-4, -1)).toEqual(["before:1", "world:2", "after:1"]); expect(seams.projectedSamples).toContain(seams.courseSamples);
    seams.frames.shift()?.(now + 60_100); expect(seams.emitted).not.toContain("timeout"); scene.dispose();
  });

  it("restarts and tears down every instance exactly once", async () => {
    const scene = await startScene(); scene.restartRemaining([marble(1)]); await settle(); scene.dispose(); scene.dispose();
    expect(seams.runs.map((run) => run.disposeCount)).toEqual([1, 1]); expect(seams.worlds.map((world) => world.freeCount)).toEqual([1, 1, 1]);
    expect(seams.order.filter((entry) => entry === "course-dispose")).toHaveLength(1); expect(seams.rendererDisposals).toBe(1); expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(1); expect(removeListener).toHaveBeenCalledTimes(addListener.mock.calls.length);
  });

  it("emits one DNF and cleans up before a begin or initialization error", async () => {
    const scene = await startScene(); const now = performance.now(); seams.badBody = true; seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17); seams.frames.shift()?.(now + 34);
    expect(seams.emitted.filter((event) => event === "dnf")).toHaveLength(1); scene.dispose();

    seams.order.length = 0; seams.emitted.length = 0; seams.failRun = true;
    const failedStart = await startScene();
    expect(seams.emitted).toEqual(["error"]);
    const lastWorldFree = seams.order.reduce((last, entry, index) => entry.startsWith("world-free:") ? index : last, -1);
    expect(lastWorldFree).toBeGreaterThan(-1); expect(seams.order.indexOf("emit:error")).toBeGreaterThan(lastWorldFree);
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("course-dispose"));
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("renderer-dispose"));
    const startCleanup = [...seams.order]; failedStart.dispose(); expect(seams.order).toEqual(startCleanup);

    seams.order.length = 0; seams.emitted.length = 0; seams.failRun = false; seams.failWorld = true;
    const failedInit = createRaceScene(document.createElement("canvas"), (event) => { seams.emitted.push(event.type); seams.order.push(`emit:${event.type}`); }, { kind: "custom", track: createValidTrackDesign("Init") }); await settle();
    expect(seams.emitted).toEqual(["error"]);
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("course-dispose"));
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("renderer-dispose"));
    const initCleanup = [...seams.order]; failedInit.dispose(); expect(seams.order).toEqual(initCleanup);
  });
});
