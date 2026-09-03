import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  frames: [] as FrameRequestCallback[], courseCalls: [] as unknown[], events: [] as string[],
  body: undefined as { translation: () => { x: number; y: number; z: number }; setEnabled: (enabled: boolean) => void } | undefined,
  world: undefined as { timestep: number; step: () => void; free: () => void } | undefined,
  worldSteps: 0, worldFrees: 0, rendererDisposals: 0, failWorld: false, badBody: false,
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class TestRenderer {
    shadowMap = { enabled: false }; outputColorSpace = actual.SRGBColorSpace; toneMapping = actual.NoToneMapping;
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(): void { /* test seam */ } setSize(): void { /* test seam */ } render(): void { /* test seam */ }
    dispose(): void { seams.rendererDisposals += 1; }
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
      const samples = [sample(0), sample(1)]; const order = seams.events;
      const renderGroup = new Group();
      return {
        kind: selection.kind === "custom" ? "custom" as const : "builtin" as const, samples,
        geometry: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), featurePositions: new Float32Array(), featureNormals: new Float32Array(), featureIndices: new Uint32Array(), samples, profileSegments: 0, triangleCount: 0 },
        renderGroup, attach: () => undefined,
        createRun: (_world: unknown, count: number, _seed: number, remainingRestart: boolean) => {
          order.push(`run:${count}:${remainingRestart}`);
          return {
            launchPositions: Array.from({ length: count }, () => ({ x: 0, y: 1, z: 0, crossOffset: 0, row: 0, column: 0, physicalLaunchPosition: true as const })),
            stepBeforeWorld: () => { order.push("before"); return { raceClockStarted: true }; },
            stepAfterWorld: () => { order.push("after"); return []; }, reset: (restart: boolean) => { order.push(`reset:${restart}`); },
            dispose: () => { order.push("run-dispose"); },
          };
        },
        dispose: () => { order.push("course-dispose"); },
      };
    },
  };
});

vi.mock("./track/trackPhysics", async () => {
  return {
    initializeTrackPhysics: () => seams.failWorld ? Promise.reject(new Error("init failed")) : Promise.resolve(),
    createTrackPhysicsWorld: () => {
      if (seams.failWorld) throw new Error("world failed");
      seams.world = { timestep: 1 / 60, step: () => { seams.worldSteps += 1; seams.events.push("world"); }, free: () => { seams.worldFrees += 1; } };
      return seams.world;
    },
    createMarbleBodies: (_world: unknown, positions: readonly { x: number; y: number; z: number }[]) => {
      seams.body = { translation: () => seams.badBody ? { x: Number.NaN, y: 0, z: 0 } : positions[0], setEnabled: () => undefined }; return [seams.body];
    },
    distanceSquaredToSample: () => 0, insideFinishVolume: () => false,
    createTrackCollider: () => undefined,
  };
});

import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import type { Marble } from "../domain/types";
import { createRaceScene } from "./MarbleRaceScene";

const marble = (id: number): Marble => ({ id, ownerId: `owner-${id}`, color: "#fff", symbol: "●" });
const startScene = async (selection: Parameters<typeof createRaceScene>[2] = { kind: "custom", track: createValidTrackDesign("Scene") }) => {
  const scene = createRaceScene(document.createElement("canvas"), (event) => seams.events.push(event.type), selection);
  await Promise.resolve(); scene.start([marble(1)], 11); await new Promise((resolve) => setTimeout(resolve, 0)); return scene;
};

describe("race scene lifecycle boundary", () => {
  beforeEach(() => {
    seams.frames.length = 0; seams.courseCalls.length = 0; seams.events.length = 0; seams.body = undefined; seams.world = undefined; seams.worldSteps = 0; seams.worldFrees = 0; seams.rendererDisposals = 0; seams.failWorld = false; seams.badBody = false;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { seams.frames.push(callback); return seams.frames.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("emits a custom build error before creating a renderer", () => {
    const bad = createValidTrackDesign("Bad"); const cells = [...bad.cells]; cells[1] = null;
    const scene = createRaceScene(document.createElement("canvas"), (event) => seams.events.push(event.type), { kind: "custom", track: { ...bad, cells } });
    expect(seams.events).toEqual(["error"]); scene.dispose(); expect(seams.frames).toHaveLength(0); expect(seams.rendererDisposals).toBe(0);
  });

  it("orders hooks, pauses all fixed work, and resumes custom ticking", async () => {
    const scene = await startScene(); const now = performance.now(); scene.setPaused(true);
    seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
    expect(seams.events).not.toContain("before"); expect(seams.worldSteps).toBe(0);
    scene.setPaused(false); seams.frames.shift()?.(now + 34);
    expect(seams.events.slice(-4, -1)).toEqual(["before", "world", "after"]); expect(seams.courseCalls[0]).toMatchObject({ options: { debug: false } });
    seams.frames.shift()?.(now + 60_000); expect(seams.events).not.toContain("timeout"); scene.dispose();
  });

  it("restarts remaining marbles with an open reset and disposes once", async () => {
    const scene = await startScene(); scene.restartRemaining([marble(1)]); await Promise.resolve();
    expect(seams.events).toContain("run-dispose"); expect(seams.events).toContain("run:1:true");
    scene.dispose(); scene.dispose(); expect(seams.worldFrees).toBe(3); expect(seams.rendererDisposals).toBe(1); expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(1);
  });

  it("emits one non-finite DNF and tears down an initialization failure", async () => {
    const scene = await startScene(); const now = performance.now(); seams.badBody = true;
    seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17); seams.frames.shift()?.(now + 34);
    expect(seams.events.filter((event) => event === "dnf")).toHaveLength(1);
    scene.dispose();

    seams.failWorld = true;
    const failed = createRaceScene(document.createElement("canvas"), (event) => seams.events.push(event.type), { kind: "custom", track: createValidTrackDesign("Init") });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seams.events.filter((event) => event === "error")).toHaveLength(1);
    failed.dispose();
  });
});
