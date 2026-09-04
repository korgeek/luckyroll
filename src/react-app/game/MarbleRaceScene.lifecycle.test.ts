import { beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  frames: [] as FrameRequestCallback[], courseCalls: [] as unknown[], order: [] as string[], emitted: [] as unknown[], projectedSamples: [] as unknown[][], marbleMeshes: [] as THREE.InstancedMesh[],
  courseSamples: undefined as unknown[] | undefined, worlds: [] as { id: number; freeCount: number; timestep: number; step: () => void; free: () => void }[], runs: [] as { id: number; disposeCount: number }[],
  worldSteps: 0, rendererDisposals: 0, failWorld: false, failRun: false, badBody: false, bankedCameraSample: false, cameraCalls: [] as { type: string; args: unknown[] }[],
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class TestRenderer {
    shadowMap = { enabled: false }; outputColorSpace = actual.SRGBColorSpace; toneMapping = actual.NoToneMapping;
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(): void {} setSize(): void {} render(): void {}
    dispose(): void { seams.rendererDisposals += 1; seams.order.push("renderer-dispose"); }
  }
  class TestInstancedMesh extends actual.InstancedMesh {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material, count: number) { super(geometry, material, count); seams.marbleMeshes.push(this); }
  }
  return { ...actual, WebGLRenderer: TestRenderer, InstancedMesh: TestInstancedMesh };
});

import * as THREE from "three";
const cameraPoses: { camera: THREE.PerspectiveCamera; position: THREE.Vector3; lookAt: THREE.Vector3; up: THREE.Vector3 }[] = [];
const cameraLookAt = vi.spyOn(THREE.PerspectiveCamera.prototype, "lookAt").mockImplementation(function (this: THREE.PerspectiveCamera, targetOrX: THREE.Vector3 | number) {
  if (targetOrX instanceof THREE.Vector3) cameraPoses.push({ camera: this, position: this.position.clone(), lookAt: targetOrX.clone(), up: this.up.clone() });
});

vi.mock("./raceCourse", async () => {
  const { Group } = await vi.importActual<typeof import("three")>("three");
  const sample = (index: number) => ({ index, distance: index, position: { x: index, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 }, side: { x: 0, y: 0, z: 1 }, up: seams.bankedCameraSample && index === 0 ? { x: 0, y: 0.8, z: 0.6 } : { x: 0, y: 1, z: 0 }, width: 12, channelDepth: 4, bankRadians: seams.bankedCameraSample && index === 0 ? Math.atan2(0.6, 0.8) : 0, zone: "run" as const });
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
  createMarbleBodies: (_world: unknown, positions: readonly { x: number; y: number; z: number }[]) => positions.map((position) => ({ translation: () => seams.badBody ? { x: Number.NaN, y: 0, z: 0 } : position, rotation: () => ({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }), setEnabled: () => undefined })),
  distanceSquaredToSample: () => 0, insideFinishVolume: () => false, createTrackCollider: () => undefined,
}));

vi.mock("./track/trackSampler", () => ({ projectToTrack: (_position: unknown, samples: readonly unknown[]) => { seams.projectedSamples.push(samples as unknown[]); return { sampleIndex: 0, progress: 0, distanceSquared: 0 }; } }));

vi.mock("./cameraControls", async () => {
  const actual = await vi.importActual<typeof import("./cameraControls")>("./cameraControls");
  return {
    ...actual,
    applyPan: (...args: Parameters<typeof actual.applyPan>) => { seams.cameraCalls.push({ type: "pan", args }); return actual.applyPan(...args); },
    applyZoom: (...args: Parameters<typeof actual.applyZoom>) => { seams.cameraCalls.push({ type: "zoom", args }); return actual.applyZoom(...args); },
    relaxControls: (...args: Parameters<typeof actual.relaxControls>) => { seams.cameraCalls.push({ type: "relax", args }); return actual.relaxControls(...args); },
  };
});

import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import type { Marble } from "../domain/types";
import { createMarbleRollTexture, createRaceScene } from "./MarbleRaceScene";

const marble = (id: number): Marble => ({ id, ownerId: `owner-${id}`, color: "#fff", symbol: "●" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const prepareCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
  Object.defineProperty(canvas, "hasPointerCapture", { value: () => false });
  Object.defineProperty(canvas, "releasePointerCapture", { value: vi.fn() });
  return canvas;
};
const latestPose = (camera: THREE.PerspectiveCamera) => { const poses = cameraPoses.filter((pose) => pose.camera === camera); return poses[poses.length - 1]; };
const pointerEvent = (type: string, values: { pointerId: number; clientX: number; clientY: number; button?: number }): PointerEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, { pointerId: { value: values.pointerId }, clientX: { value: values.clientX }, clientY: { value: values.clientY }, button: { value: values.button ?? 0 } });
  return event;
};
const canvasDrag = (canvas: HTMLCanvasElement): void => {
  canvas.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, button: 2 }));
  canvas.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 30, clientY: 4, button: 2 }));
};
const addListener = vi.spyOn(EventTarget.prototype, "addEventListener");
const removeListener = vi.spyOn(EventTarget.prototype, "removeEventListener");
const startScene = async (selection: Parameters<typeof createRaceScene>[2] = { kind: "custom", track: createValidTrackDesign("Scene") }) => {
  const scene = createRaceScene(document.createElement("canvas"), (event) => { seams.emitted.push(event); seams.order.push(`emit:${event.type}`); }, selection);
  await settle(); scene.start([marble(1)], 11); await settle(); return scene;
};

describe("race scene lifecycle boundary", () => {
  beforeEach(() => {
    seams.frames.length = 0; seams.courseCalls.length = 0; seams.order.length = 0; seams.emitted.length = 0; seams.projectedSamples.length = 0; seams.marbleMeshes.length = 0; seams.cameraCalls.length = 0; seams.courseSamples = undefined; seams.worlds.length = 0; seams.runs.length = 0; seams.worldSteps = 0; seams.rendererDisposals = 0; seams.failWorld = false; seams.failRun = false; seams.badBody = false; seams.bankedCameraSample = false; cameraPoses.length = 0; cameraLookAt.mockClear(); addListener.mockClear(); removeListener.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { seams.frames.push(callback); return seams.frames.length; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("emits a custom build error before creating a renderer", () => {
    const bad = createValidTrackDesign("Bad"); const cells = [...bad.cells]; cells[1] = null;
    const scene = createRaceScene(document.createElement("canvas"), (event) => seams.emitted.push(event), { kind: "custom", track: { ...bad, cells } });
    expect(seams.emitted.map((event) => (event as { type: string }).type)).toEqual(["error"]); scene.dispose(); expect(seams.frames).toHaveLength(0); expect(seams.rendererDisposals).toBe(0);
  });

  it("uses custom samples, orders fixed work, pauses it, and times out custom races", async () => {
    const scene = await startScene(); const now = performance.now(); scene.setPaused(true); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
    expect(seams.order.filter((entry) => /^(before|world:|after)/.test(entry))).toEqual([]); expect(seams.worldSteps).toBe(0);
    scene.setPaused(false); seams.frames.shift()?.(now + 34); expect(seams.order.slice(-4, -1)).toEqual(["before:1", "world:2", "after:1"]); expect(seams.projectedSamples).toContain(seams.courseSamples);
    seams.frames.shift()?.(now + 60_100); expect(seams.emitted.map((event) => (event as { type: string }).type)).toContain("timeout"); scene.dispose();
  });

  it("orients bird view along the race and resumes the directed camera frame when disabled", async () => {
    const scene = await startScene();
    const camera = cameraPoses[0].camera;
    const now = performance.now();
    scene.setBirdView(true);
    for (let frame = 0; frame < 160; frame += 1) seams.frames.shift()?.(now + frame * 17);

    expect(camera.up.x).toBeCloseTo(-1, 3);
    expect(camera.up.y).toBeCloseTo(0, 3);
    expect(camera.up.z).toBe(0);
    const birdPosition = camera.position.clone();

    scene.setBirdView(false);
    for (let frame = 160; frame < 320; frame += 1) seams.frames.shift()?.(now + frame * 17);
    expect(camera.up.x).toBeCloseTo(0, 3);
    expect(camera.up.y).toBeCloseTo(1, 3);
    expect(camera.up.z).toBe(0);
    expect(camera.position.distanceTo(new THREE.Vector3(7.5, 3.8, 0))).toBeLessThan(birdPosition.distanceTo(new THREE.Vector3(7.5, 3.8, 0)));
    scene.dispose();
  });

  it("restarts and tears down every instance exactly once", async () => {
    const scene = await startScene(); scene.restartRemaining([marble(1)]); await settle(); scene.dispose(); scene.dispose();
    expect(seams.runs.map((run) => run.disposeCount)).toEqual([1, 1]); expect(seams.worlds.map((world) => world.freeCount)).toEqual([1, 1, 1]);
    expect(seams.order.filter((entry) => entry === "course-dispose")).toHaveLength(1); expect(seams.rendererDisposals).toBe(1); expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(1); expect(removeListener).toHaveBeenCalledTimes(addListener.mock.calls.length);
  });

  it("registers a canvas context-menu guard alongside recoverable pointer controls", async () => {
    const canvas = document.createElement("canvas");
    const scene = createRaceScene(canvas, (event) => { seams.emitted.push(event); }, { kind: "custom", track: createValidTrackDesign("Input") });
    await settle();
    const contextMenu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    expect(canvas.dispatchEvent(contextMenu)).toBe(false);
    expect(addListener.mock.calls.some(([type]) => type === "contextmenu")).toBe(true);
    scene.dispose();
    expect(removeListener.mock.calls.some(([type]) => type === "contextmenu")).toBe(true);
  });

  it("routes right-drag, pinch distance, and idle recovery through camera controls", async () => {
    const canvas = prepareCanvas();
    const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign("Input") });
    await settle();
    scene.start([marble(1)], 11);
    await settle();
    seams.frames.shift()?.(performance.now());
    const beforePanFrame = cameraPoses[cameraPoses.length - 1];

    canvas.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, button: 2 }));
    canvas.dispatchEvent(pointerEvent("pointermove", { pointerId: 1, clientX: 30, clientY: 4, button: 2 }));
    expect(seams.cameraCalls.some(({ type }) => type === "pan")).toBe(true);
    seams.frames.shift()?.(performance.now() + 17);
    const afterPanFrame = cameraPoses[cameraPoses.length - 1];
    expect(afterPanFrame.position.equals(beforePanFrame.position)).toBe(false);
    expect(afterPanFrame.lookAt.equals(beforePanFrame.lookAt)).toBe(false);

    canvas.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 100, clientY: 10 }));
    canvas.dispatchEvent(pointerEvent("pointermove", { pointerId: 2, clientX: 120, clientY: 10 }));
    expect(seams.cameraCalls.find(({ type }) => type === "zoom")?.args[1]).toBeCloseTo(-20, 0);

    const beforeRecovery = seams.cameraCalls.length;
    seams.frames.shift()?.(performance.now() + 10_000);
    const recovery = seams.cameraCalls.slice(beforeRecovery).find(({ type }) => type === "relax");
    expect(recovery?.args[1]).toBeGreaterThan(0);
    expect(recovery?.args[1]).toBeLessThan(1);
    scene.dispose();
  });

  it("keeps reduced-motion camera input until idle, then snaps to rest", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const canvas = prepareCanvas(); const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign("Reduced") });
    await settle(); scene.start([marble(1)], 11); await settle(); seams.frames.shift()?.(1_000);
    canvasDrag(canvas);
    seams.frames.shift()?.(3_999);
    expect(seams.cameraCalls.filter(({ type }) => type === "relax")).toHaveLength(0);
    seams.frames.shift()?.(4_000);
    const relaxes = seams.cameraCalls.filter(({ type }) => type === "relax");
    expect(relaxes[relaxes.length - 1]?.args[1]).toBe(1);
    now.mockRestore(); scene.dispose();
  });

  it("uses lit marble batches and releases their GPU resources on restart and disposal", async () => {
    const scene = createRaceScene(prepareCanvas(), () => undefined, { kind: "custom", track: createValidTrackDesign("Marbles") });
    await settle(); scene.start([marble(1), { ...marble(2), color: "#0f0" }], 11); await settle();
    const first = [...seams.marbleMeshes];
    expect(first).toHaveLength(2);
    first.forEach((mesh) => {
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      const material = mesh.material as THREE.MeshStandardMaterial;
      expect(material.roughness).toBe(0.28); expect(material.metalness).toBe(0.18);
    });
    const marbleTexture = (first[0]!.material as THREE.MeshStandardMaterial).map;
    expect(marbleTexture).toBeInstanceOf(THREE.DataTexture);
    expect(first.every((mesh) => (mesh.material as THREE.MeshStandardMaterial).map === marbleTexture)).toBe(true);
    const marbleTextureDispose = vi.spyOn(marbleTexture!, "dispose");
    const firstGeometryDisposals = first.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    const firstMaterialDisposals = first.map((mesh) => vi.spyOn(mesh.material as THREE.Material, "dispose"));
    scene.restartRemaining([marble(1)]); await settle();
    expect(firstGeometryDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(firstMaterialDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(marbleTextureDispose).not.toHaveBeenCalled();
    const restarted = seams.marbleMeshes[seams.marbleMeshes.length - 1]!;
    const restartedGeometryDispose = vi.spyOn(restarted.geometry, "dispose"); const restartedMaterialDispose = vi.spyOn(restarted.material as THREE.Material, "dispose");
    expect((restarted.material as THREE.MeshStandardMaterial).map).toBe(marbleTexture);
    scene.dispose();
    expect(restartedGeometryDispose).toHaveBeenCalledOnce(); expect(restartedMaterialDispose).toHaveBeenCalledOnce();
    expect(marbleTextureDispose).toHaveBeenCalledOnce();
  });

  it("creates one asymmetric repeating marble roll texture", () => {
    const texture = createMarbleRollTexture();
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(new Set(Array.from(texture.image.data as Uint8Array))).not.toEqual(new Set([255]));
    texture.dispose();
  });

  it("copies each marble body rotation into its rendered instance", async () => {
    const scene = await startScene();
    seams.frames.shift()?.(performance.now());
    const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3();
    seams.marbleMeshes[0]!.getMatrixAt(0, matrix); matrix.decompose(position, quaternion, scale);
    expect(Math.abs(quaternion.dot(new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2)))).toBeCloseTo(1, 5);
    scene.dispose();
  });

  it("sets the banked follow-camera up vector before looking at its target", async () => {
    seams.bankedCameraSample = true;
    const scene = await startScene();
    const camera = cameraPoses[0].camera;

    seams.frames.shift()?.(performance.now());

    expect(latestPose(camera).up.z).toBeGreaterThan(0);
    scene.dispose();
  });

  it("keeps right-drag aimed differently when clearance clamps its position", async () => {
    const noDragCanvas = prepareCanvas();
    const dragCanvas = prepareCanvas();
    const noDrag = createRaceScene(noDragCanvas, () => undefined, { kind: "custom", track: createValidTrackDesign("NoDrag") });
    const dragged = createRaceScene(dragCanvas, () => undefined, { kind: "custom", track: createValidTrackDesign("Dragged") });
    await settle();
    noDrag.start([marble(1)], 11); dragged.start([marble(1)], 11);
    await settle();
    const timestamp = performance.now();
    seams.frames.shift()?.(timestamp); seams.frames.shift()?.(timestamp);
    const noDragCamera = latestPose(cameraPoses[0].camera).camera;
    const dragCamera = latestPose(cameraPoses[1].camera).camera;
    canvasDrag(dragCanvas);
    seams.frames.shift()?.(timestamp + 17); seams.frames.shift()?.(timestamp + 17);

    const noDragPose = latestPose(noDragCamera);
    const dragPose = latestPose(dragCamera);
    expect(dragPose.lookAt.distanceTo(noDragPose.lookAt)).toBeGreaterThan(0);
    noDrag.dispose(); dragged.dispose();
  });

  it("emits one DNF and cleans up before a begin or initialization error", async () => {
    const scene = await startScene(); const now = performance.now(); seams.badBody = true; seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17); seams.frames.shift()?.(now + 34);
    expect(seams.emitted.filter((event) => (event as { type: string }).type === "dnf")).toHaveLength(1); scene.dispose();

    seams.order.length = 0; seams.emitted.length = 0; seams.failRun = true;
    const failedStart = await startScene();
    expect(seams.emitted.map((event) => (event as { type: string }).type)).toEqual(["error"]);
    const lastWorldFree = seams.order.reduce((last, entry, index) => entry.startsWith("world-free:") ? index : last, -1);
    expect(lastWorldFree).toBeGreaterThan(-1); expect(seams.order.indexOf("emit:error")).toBeGreaterThan(lastWorldFree);
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("course-dispose"));
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("renderer-dispose"));
    const startCleanup = [...seams.order]; failedStart.dispose(); expect(seams.order).toEqual(startCleanup);

    seams.order.length = 0; seams.emitted.length = 0; seams.failRun = false; seams.failWorld = true;
    const failedInit = createRaceScene(document.createElement("canvas"), (event) => { seams.emitted.push(event); seams.order.push(`emit:${event.type}`); }, { kind: "custom", track: createValidTrackDesign("Init") }); await settle();
    expect(seams.emitted.map((event) => (event as { type: string }).type)).toEqual(["error"]);
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("course-dispose"));
    expect(seams.order.indexOf("emit:error")).toBeGreaterThan(seams.order.indexOf("renderer-dispose"));
    const initCleanup = [...seams.order]; failedInit.dispose(); expect(seams.order).toEqual(initCleanup);
  });

  it("reports a DNF as eliminated rather than finished", async () => {
    const scene = await startScene();
    seams.badBody = true;
    seams.frames.shift()?.(performance.now());
    expect(seams.emitted.find((event) => (event as { type: string }).type === "tick")).toMatchObject({ type: "tick", finishedCount: 0, eliminatedCount: 1 });
    scene.dispose();
  });
});
