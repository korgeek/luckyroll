import { beforeEach, describe, expect, it, vi } from "vitest";
import { retroSounds } from "./retroSounds";
import type { TrackSample } from "./track/trackTypes";

const seams = vi.hoisted(() => ({
  pixelRatios: [] as number[], frames: [] as FrameRequestCallback[], courseCalls: [] as unknown[], order: [] as string[], emitted: [] as unknown[], projectedSamples: [] as unknown[][], marbleMeshes: [] as THREE.InstancedMesh[],
  courseSamples: undefined as TrackSample[] | undefined, worlds: [] as { id: number; freeCount: number; timestep: number; step: () => void; free: () => void }[], runs: [] as { id: number; disposeCount: number }[],
  worldSteps: 0, rendererDisposals: 0, failWorld: false, failRun: false, badBody: false, badBodyIndex: -1, bankedCameraSample: false, cameraCalls: [] as { type: string; args: unknown[] }[],
	boosterEvent: false, featureSamples: false, starterSamples: false, releaseGate: true, bodyX: 0, bodyVelocity: undefined as number | undefined, rushVelocityWrites: [] as { x: number; y: number; z: number }[],
}));

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  class TestRenderer {
    shadowMap = { enabled: false }; outputColorSpace = actual.SRGBColorSpace; toneMapping = actual.NoToneMapping;
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(value: number): void { seams.pixelRatios.push(value); } setSize(): void {} render(): void {}
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
    collectBumperHits: () => [],
    createBuiltInTrackResources: () => { throw new Error("unused test seam"); },
    createRaceCourse: (selection: { kind: string; track?: { cells: readonly unknown[] } }, options?: unknown) => {
      seams.courseCalls.push({ selection, options });
      if (selection.kind === "custom" && selection.track?.cells[1] === null) throw new Error("invalid route");
		const samples = seams.featureSamples ? [sample(0), { ...sample(1), distance: 12, position: { x: 12, y: 0, z: 0 }, kind: "bumper", cellIndex: 7, localU: 0.1 }, { ...sample(2), distance: 28, position: { x: 28, y: 0, z: 0 }, kind: "bumper", cellIndex: 7, localU: 0.9 }, { ...sample(3), distance: 40, position: { x: 40, y: 0, z: 0 } }] : [sample(0), sample(1)]; seams.courseSamples = samples;
      const runCourse = {
        kind: selection.kind === "custom" ? "custom" as const : "builtin" as const, samples,
        cameraSamples: seams.starterSamples ? [{ ...sample(0), distance: -12, position: { x: -12, y: 0, z: 0 }, channelDepth: 6 }, ...samples].map((frame, index) => ({ ...frame, index })) : undefined,
        geometry: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), featurePositions: new Float32Array(), featureNormals: new Float32Array(), featureIndices: new Uint32Array(), samples, profileSegments: 0, triangleCount: 0 },
        renderGroup: new Group(), attach: () => undefined,
        createRun: (_world: unknown, count: number, _seed: number, remainingRestart: boolean) => {
          if (seams.failRun) throw new Error("run failed");
          const id = seams.runs.length + 1; const run = { id, disposeCount: 0 }; seams.runs.push(run); seams.order.push(`run:${id}:${count}:${remainingRestart}`);
          return {
            launchPositions: Array.from({ length: count }, () => ({ x: 0, y: 1, z: 0, crossOffset: 0, row: 0, column: 0, physicalLaunchPosition: true as const })),
            stepBeforeWorld: () => { seams.order.push(`before:${id}`); return { raceClockStarted: seams.releaseGate }; },
            stepAfterWorld: () => { seams.order.push(`after:${id}`); return seams.boosterEvent ? [{ marbleId: 1, cellIndex: 1, beforeForwardSpeed: 10, afterForwardSpeed: 20 }] : []; }, reset: (restart: boolean) => { seams.order.push(`reset:${id}:${restart}`); },
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
  createMarbleBodies: (_world: unknown, positions: readonly { x: number; y: number; z: number }[]) => positions.map((position, index) => { let velocity = { x: 0, y: 0, z: 0 }; return { translation: () => seams.badBody || seams.badBodyIndex === index ? { x: Number.NaN, y: 0, z: 0 } : seams.featureSamples ? { x: seams.bodyX, y: 0, z: 0 } : position, rotation: () => ({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }), linvel: () => seams.bodyVelocity === undefined ? velocity : { x: seams.bodyVelocity, y: 0, z: 0 }, setLinvel: (next: { x: number; y: number; z: number }) => { velocity = next; seams.rushVelocityWrites.push(next); }, setEnabled: () => undefined, collider: () => ({ setRadius: () => undefined }), recomputeMassPropertiesFromColliders: () => undefined, setTranslation: () => undefined }; }),
  distanceSquaredToSample: () => 0, distanceSquaredToTrackSegments: () => 0, insideFinishVolume: () => false, createTrackCollider: () => undefined,
}));

vi.mock("./track/trackSampler", () => {
  const projectToTrack = (position: { x?: number }, samples: readonly unknown[]) => { seams.projectedSamples.push(samples as unknown[]); return { sampleIndex: seams.featureSamples ? Math.max(0, Math.min(3, Math.round((position.x ?? 0) / 13))) : 0, progress: seams.featureSamples ? (position.x ?? 0) / 40 : 0, distanceSquared: 0 }; };
  return { projectToTrack, createTrackProjector: (samples: readonly unknown[]) => (position: { x?: number }) => projectToTrack(position, samples) };
});

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
import * as cameraPlan from "./cameraPlan";

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
    seams.starterSamples = false;
    seams.releaseGate = true;
    seams.bodyVelocity = undefined;
    seams.pixelRatios.length = 0; seams.frames.length = 0; seams.courseCalls.length = 0; seams.order.length = 0; seams.emitted.length = 0; seams.projectedSamples.length = 0; seams.marbleMeshes.length = 0; seams.cameraCalls.length = 0; seams.courseSamples = undefined; seams.worlds.length = 0; seams.runs.length = 0; seams.worldSteps = 0; seams.rendererDisposals = 0; seams.failWorld = false; seams.failRun = false; seams.badBody = false; seams.badBodyIndex = -1; seams.bankedCameraSample = false; seams.boosterEvent = false; seams.featureSamples = false; seams.bodyX = 0; seams.rushVelocityWrites.length = 0; cameraPoses.length = 0; cameraLookAt.mockClear(); addListener.mockClear(); removeListener.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { seams.frames.push(callback); return seams.frames.length; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("shows the modular pusher from in front, then follows the launch into the channel", async () => {
    seams.starterSamples = true;
    const scene = await startScene(); const camera = cameraPoses[0].camera;
    const initial = latestPose(camera);
    expect(initial.position.x).toBeGreaterThan(initial.lookAt.x);
    expect(initial.position.z).toBeLessThan(-4);
    const now = performance.now();
    for (let frame = 1; frame <= 30; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).position.x).toBeGreaterThan(latestPose(camera).lookAt.x);
    for (let frame = 31; frame <= 260; frame++) seams.frames.shift()?.(now + frame * 17);
    const following = latestPose(camera);
    expect(following.lookAt.x).toBeGreaterThan(following.position.x);
    expect(Math.abs(following.position.z)).toBeLessThan(0.1);
    scene.start([marble(1)], 12); await settle();
    expect(latestPose(camera).position.z).toBeLessThan(-4);
    scene.dispose();
  });

  it("starts the follow blend when the pusher is released, without waiting for its stroke to finish", async () => {
    seams.starterSamples = true; seams.releaseGate = false;
    const scene = await startScene(); const camera = cameraPoses[0].camera;
    const initial = latestPose(camera).position.clone(); const now = performance.now();
    for (let frame = 1; frame <= 40; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).position.distanceTo(initial)).toBeLessThan(0.001);
    seams.releaseGate = true;
    for (let frame = 41; frame <= 42; frame++) seams.frames.shift()?.(now + frame * 17);
    const frame = { ...seams.courseSamples![0], distance: -12, position: { x: -12, y: 0, z: 0 }, channelDepth: 6 };
    const starterOnly = cameraPlan.writeStartCameraShot({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 }, frame, cameraPlan.getTrackBounds(seams.courseSamples!), camera.fov, camera.aspect, 17 / 650);
    expect(Math.abs(latestPose(camera).position.z)).toBeLessThan(Math.abs(starterOnly.position.z) - 0.0001);
    scene.dispose();
  });

  it("starts and replays from inside the starting channel when no starter extension exists", async () => {
    const scene = await startScene(); const camera = cameraPoses[0].camera;
    const check = () => {
      const frame = seams.courseSamples![0]; const pose = latestPose(camera);
      expect(pose.position.x).toBeCloseTo(frame.position.x, 5);
      expect(pose.position.z).toBeCloseTo(frame.position.z, 5);
      expect(pose.position.y).toBeGreaterThan(frame.position.y);
      expect(pose.position.y - frame.position.y).toBeLessThan(frame.channelDepth);
      const direction = pose.lookAt.clone().sub(pose.position);
      const pitch = Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)) * 180 / Math.PI;
      expect(pitch).toBeGreaterThanOrEqual(35); expect(pitch).toBeLessThanOrEqual(50);
    };
    check(); scene.start([marble(1)], 12); await settle(); check(); scene.dispose();
  });

  it("keeps zoom and clearance steady across straight and curve sections", async () => {
    const scene = await startScene();
    const now = performance.now();
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    const straight = cameraPoses[cameraPoses.length - 1]!;
    seams.courseSamples!.forEach(sample => Object.assign(sample, { kind: "curve" }));
    for (let frame = 501; frame <= 800; frame++) seams.frames.shift()?.(now + frame * 17);
    const curve = cameraPoses[cameraPoses.length - 1]!;
    expect(curve.camera.zoom).toBe(1);
    expect(curve.position.y).toBeCloseTo(straight.position.y, 2);
    expect(curve.position.y - curve.lookAt.y).toBeGreaterThanOrEqual(4.99);
    scene.setBirdView(true);
    for (let frame = 801; frame <= 1000; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(curve.camera.zoom).toBeCloseTo(1, 2);
    scene.dispose();
  });

  it.each([360 / 800, 1024 / 768])("keeps both lane edges and the pack visible in the running camera at aspect %s", async aspect => {
    seams.featureSamples = true; seams.bodyX = 35;
    const canvas = prepareCanvas(); Object.defineProperties(canvas, { clientWidth: { value: 800 * aspect }, clientHeight: { value: 800 } });
    const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 20 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now();
    for (let frame = 1; frame <= 700; frame++) seams.frames.shift()?.(now + frame * 17);
    const pose = latestPose(cameraPoses[0].camera); const camera = pose.camera;
    expect(pose.position.y).toBeGreaterThan(10);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position, pose.lookAt, pose.up)); camera.updateMatrixWorld();
    for (const lateral of [-5.4, 0, 5.4]) {
      const point = new THREE.Vector3(35, 0.34, lateral).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.95); expect(Math.abs(point.y)).toBeLessThan(0.95); expect(Math.abs(point.z)).toBeLessThan(1);
    }
    scene.dispose();
  });

  it("preserves route position and height when elevated shots switch on a slope", async () => {
    let feature = false;
    const director = vi.spyOn(cameraPlan, "createActionCameraDirector").mockReturnValue({ update: () => feature ? { mode: "feature", zoneKey: "bumper:7", framing: "wide" } : { mode: "crowd", framing: "wide" }, reset: () => undefined });
    seams.featureSamples = true; seams.bodyX = 35;
    const canvas = prepareCanvas(); Object.defineProperties(canvas, { clientWidth: { value: 360 }, clientHeight: { value: 800 } });
    const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign() });
    const scale = Math.hypot(1, 0.15);
    seams.courseSamples!.forEach(sample => { Object.assign(sample.position, { y: -sample.position.x * 0.15 }); Object.assign(sample, { tangent: { x: 1 / scale, y: -0.15 / scale, z: 0 }, up: { x: 0.15 / scale, y: 1 / scale, z: 0 } }); });
    await settle(); scene.start(Array.from({ length: 20 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now(); const camera = cameraPoses[0].camera;
    for (let frame = 1; frame <= 700; frame++) seams.frames.shift()?.(now + frame * 17);
    let before = latestPose(camera).position; feature = true;
    seams.frames.shift()?.(now + 701 * 17);
    expect(Math.abs(latestPose(camera).position.x - before.x)).toBeLessThan(0.4);
    expect(Math.abs(latestPose(camera).position.y - before.y)).toBeLessThan(0.5);
    for (let frame = 702; frame <= 1000; frame++) seams.frames.shift()?.(now + frame * 17);
    before = latestPose(camera).position; feature = false;
    seams.frames.shift()?.(now + 1001 * 17);
    expect(Math.abs(latestPose(camera).position.x - before.x)).toBeLessThan(0.4);
    expect(Math.abs(latestPose(camera).position.y - before.y)).toBeLessThan(0.5);
    scene.dispose(); director.mockRestore();
  });

  it.each([360 / 800, 1024 / 768])("keeps the final marble and its lane visible at aspect %s", async aspect => {
    seams.featureSamples = true; seams.bodyX = 35; seams.bodyVelocity = 0;
    const canvas = prepareCanvas(); Object.defineProperties(canvas, { clientWidth: { value: 800 * aspect }, clientHeight: { value: 800 } });
    const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 100 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now(); const camera = cameraPoses[0].camera;
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    scene.restartRemaining(Array.from({ length: 20 }, (_, index) => marble(index + 1))); await settle();
    for (let frame = 501; frame <= 1000; frame++) seams.frames.shift()?.(now + frame * 17);
    const pose = latestPose(camera);
    expect(pose.position.y).toBeGreaterThanOrEqual(11.9);
    expect(seams.bodyX - pose.position.x).toBeGreaterThanOrEqual(13.9);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position, pose.lookAt, pose.up)); camera.updateMatrixWorld();
    for (const lateral of [-5.4, 0, 5.4]) {
      const point = new THREE.Vector3(35, 0.34, lateral).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(0.95); expect(Math.abs(point.y)).toBeLessThan(0.95); expect(Math.abs(point.z)).toBeLessThan(1);
    }
    scene.dispose();
  });

  it("retreats toward the last marble facing forward when twenty percent remain", async () => {
    seams.featureSamples = true; seams.bodyX = 35; seams.bodyVelocity = 0;
    const scene = createRaceScene(prepareCanvas(), () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 100 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now();
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    const camera = cameraPoses[0].camera; let previous = latestPose(camera).position.x;
    const initial = previous; const initialHeight = latestPose(camera).position.y; let previousVelocity = 0;
    seams.bodyX = 12; scene.restartRemaining(Array.from({ length: 20 }, (_, index) => marble(index + 1))); await settle();
    for (let frame = 501; frame <= 800; frame++) {
      seams.frames.shift()?.(now + frame * 17);
      const pose = latestPose(camera);
      const dt = frame === 501 ? 0.1 : 0.017;
      const velocity = (pose.position.x - previous) / dt;
      expect(Math.abs(velocity)).toBeLessThanOrEqual(30.001);
      expect(Math.abs(velocity - previousVelocity)).toBeLessThanOrEqual(8 * dt + 0.001);
      expect(pose.position.x).toBeGreaterThanOrEqual(-0.001);
      if (frame === 501) { expect(pose.position.y).toBeGreaterThan(initialHeight); expect(pose.position.y - initialHeight).toBeLessThan(2); }
      expect(pose.position.z).toBeCloseTo(0, 5);
      expect(pose.lookAt.x - pose.position.x).toBeGreaterThan(5.9);
      previous = pose.position.x;
      previousVelocity = velocity;
    }
    expect(previous).toBeLessThan(initial - 10);
    expect(previous).toBeCloseTo(0, 2);
    scene.dispose();
  });

  it("hands retreat over to following a last marble whose position keeps advancing", async () => {
    seams.featureSamples = true; seams.bodyX = 35; seams.bodyVelocity = 0;
    const scene = createRaceScene(prepareCanvas(), () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 100 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now(); const camera = cameraPoses[0].camera;
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    seams.bodyX = 4; seams.bodyVelocity = 3;
    scene.restartRemaining(Array.from({ length: 20 }, (_, index) => marble(index + 1))); await settle();
    let previous = latestPose(camera).position.x; let following = false;
    for (let frame = 501; frame <= 980; frame++) {
      seams.bodyX += 3 * 0.017;
      seams.frames.shift()?.(now + frame * 17);
      const position = latestPose(camera).position.x; const destination = Math.max(0, seams.bodyX - 14);
      if (Math.abs(position - destination) < 0.5) following = true;
      if (following) expect(position).toBeGreaterThanOrEqual(previous - 0.001);
      previous = position;
    }
    expect(following).toBe(true);
    expect(Math.abs(previous - (seams.bodyX - 14))).toBeLessThan(0.4);
    scene.dispose();
  });

  it("moves the normal camera along a curved channel instead of its chord", async () => {
    let distance = 10;
    const director = vi.spyOn(cameraPlan, "createRouteCrowdDirector").mockReturnValue({ update: () => ({ distance, runStart: 0, runEnd: 63, pace: "slow" }), reset: () => undefined });
    const scene = await startScene();
    const template = seams.courseSamples![0];
    const samples = Array.from({ length: 41 }, (_, index) => {
      const angle = index * Math.PI / 40;
      return { ...template, index, distance: angle * 20, position: { x: 20 * Math.sin(angle), y: 0, z: 20 * Math.cos(angle) }, tangent: { x: Math.cos(angle), y: 0, z: -Math.sin(angle) }, side: { x: Math.sin(angle), y: 0, z: Math.cos(angle) } };
    });
    seams.courseSamples!.splice(0, seams.courseSamples!.length, ...samples);
    const now = performance.now(); const camera = cameraPoses[0].camera;
    for (let frame = 1; frame <= 600; frame++) seams.frames.shift()?.(now + frame * 17);
    let previousFloor = new THREE.Vector3(latestPose(camera).position.x, 0, latestPose(camera).position.z);
    distance = 55;
    for (let frame = 601; frame <= 780; frame++) {
      seams.frames.shift()?.(now + frame * 17);
      const position = latestPose(camera).position;
      const floor = new THREE.Vector3(position.x, 0, position.z);
      expect(floor.distanceTo(previousFloor)).toBeLessThanOrEqual(22 * 0.017 + 0.001);
      previousFloor = floor;
      const error = Math.min(...samples.slice(1).map((sample, index) => new THREE.Line3(new THREE.Vector3().copy(samples[index].position), new THREE.Vector3().copy(sample.position)).closestPointToPoint(floor, true, new THREE.Vector3()).distanceTo(floor)));
      expect(error).toBeLessThan(0.01);
    }
    scene.dispose(); director.mockRestore();
  });

  it("does not change camera framing when crowd pace enters and leaves a corner", async () => {
    let pace: "slow" | "fast" = "slow";
    const director = vi.spyOn(cameraPlan, "createRouteCrowdDirector").mockReturnValue({ update: () => ({ distance: 35, runStart: 0, runEnd: 40, pace }), reset: () => undefined });
    seams.featureSamples = true; seams.bodyX = 35;
    const scene = createRaceScene(prepareCanvas(), () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 100 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now();
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    const camera = cameraPoses[0].camera; const straight = latestPose(camera);
    pace = "fast";
    for (let frame = 501; frame <= 800; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).position.distanceTo(straight.position)).toBeLessThan(0.01);
    expect(latestPose(camera).lookAt.distanceTo(straight.lookAt)).toBeLessThan(0.01);
    pace = "slow";
    for (let frame = 801; frame <= 1100; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).position.distanceTo(straight.position)).toBeLessThan(0.01);
    scene.dispose(); director.mockRestore();
  });

  it("plays the first marble's physical booster event and stops audio on pause", async () => {
    const obstacle = vi.spyOn(retroSounds, "obstacle").mockImplementation(() => undefined);
    const stop = vi.spyOn(retroSounds, "stop").mockImplementation(() => undefined);
    const scene = await startScene();
    seams.boosterEvent = true;
    const now = performance.now(); seams.frames.shift()?.(now + 17);
    expect(obstacle).toHaveBeenCalledWith("boost", expect.any(Number));
    scene.setPaused(true); expect(stop).toHaveBeenCalled();
    const calls = obstacle.mock.calls.length; seams.frames.shift()?.(now + 34);
    expect(obstacle).toHaveBeenCalledTimes(calls);
    scene.dispose();
    obstacle.mockRestore(); stop.mockRestore();
  });

  it("lowers render resolution on sustained slow frames without altering physics steps", async () => {
    const scene = await startScene();
    const now = performance.now();
    for (let frame = 1; frame <= 220; frame++) seams.frames.shift()?.(now + frame * 33);
    const base = seams.pixelRatios[0];
    expect(seams.pixelRatios).toEqual([base, base * 0.8, base * 0.65]);
    expect(seams.worlds[0].timestep).toBe(1 / 60);
    const before = seams.worldSteps;
    scene.setPaused(true);
    for (let frame = 221; frame <= 320; frame++) seams.frames.shift()?.(now + frame * 33);
    expect(seams.worldSteps).toBe(before);
    expect(seams.pixelRatios).toHaveLength(3);
    scene.dispose();
  });

  it("emits a custom build error before creating a renderer", () => {
    const bad = createValidTrackDesign("Bad"); const cells = [...bad.cells]; cells[1] = null;
    const scene = createRaceScene(document.createElement("canvas"), (event) => seams.emitted.push(event), { kind: "custom", track: { ...bad, cells } });
    expect(seams.emitted.map((event) => (event as { type: string }).type)).toEqual(["error"]); scene.dispose(); expect(seams.frames).toHaveLength(0); expect(seams.rendererDisposals).toBe(0);
  });

  it("uses custom samples, orders fixed work, pauses it, and times out custom races", async () => {
    const scene = await startScene(); const now = performance.now(); scene.setPaused(true); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
    expect(seams.order.filter((entry) => /^(before|world:|after)/.test(entry))).toEqual([]); expect(seams.worldSteps).toBe(0);
    scene.setPaused(false); seams.frames.shift()?.(now + 34); expect(seams.order.filter((entry) => /^(before|world:|after)/.test(entry)).slice(-3)).toEqual(["before:1", "world:2", "after:1"]); expect(seams.projectedSamples).toContain(seams.courseSamples);
    seams.frames.shift()?.(now + 120_100); expect(seams.emitted.map((event) => (event as { type: string }).type)).toContain("timeout"); scene.dispose();
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
    scene.setBirdView(false);
    for (let frame = 160; frame < 320; frame += 1) seams.frames.shift()?.(now + frame * 17);
    expect(camera.up.x).toBeCloseTo(0, 3);
    expect(camera.up.y).toBeCloseTo(1, 3);
    expect(camera.up.z).toBe(0);
    const frame = seams.courseSamples![0]; const settled = latestPose(camera);
    expect(settled.position.y).toBeGreaterThan(frame.channelDepth + 4);
    expect(settled.position.x).toBeCloseTo(frame.position.x, 2);
    expect(settled.lookAt.x).toBeGreaterThan(settled.position.x);
    expect(settled.lookAt.y).toBeLessThan(settled.position.y);
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

	it("reports prepared only after initial marble transforms exist and honors a pre-start hold", async () => {
		const canvas = prepareCanvas(); const scene = createRaceScene(canvas, (event) => { seams.emitted.push(event); seams.order.push(`emit:${event.type}`); }, { kind: "custom", track: createValidTrackDesign("Prepared") });
		await settle(); scene.setPaused(true); scene.start([marble(1)], 11); await settle();
		const preparedIndex = seams.order.indexOf("emit:prepared");
		const runIndex = seams.order.findIndex((entry) => entry.startsWith("run:"));
		expect(preparedIndex).toBeGreaterThan(runIndex);
		const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const scale = new THREE.Vector3();
		seams.marbleMeshes[0]!.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
		expect(position).toEqual(new THREE.Vector3(0, 1, 0)); expect(scale).toEqual(new THREE.Vector3(1, 1, 1));
		const now = performance.now(); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
		expect(seams.worldSteps).toBe(0);
		scene.dispose();
	});

	it("enters RUSH once at the original-field half threshold without doubling fixed steps or changing marble size", async () => {
		const scene = createRaceScene(document.createElement("canvas"), (event) => seams.emitted.push(event), { kind: "custom", track: createValidTrackDesign("Rush physical") });
		await settle(); scene.start(Array.from({ length: 4 }, (_, index) => marble(index + 1)), 11); await settle(); const now = performance.now();
		seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
		// Restart must use the same clock as the simulated animation frames.
		const restartClock = vi.spyOn(performance, "now").mockReturnValue(now + 17);
		try { scene.restartRemaining([marble(1), marble(2)]); await settle(); } finally { restartClock.mockRestore(); }
		seams.frames.shift()?.(now + 34);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(1);
		const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const scale = new THREE.Vector3();
		seams.marbleMeshes[seams.marbleMeshes.length - 1]!.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
		expect(scale).toEqual(new THREE.Vector3(1, 1, 1));
		const before = seams.worldSteps; seams.frames.shift()?.(now + 51);
		expect(seams.worldSteps - before).toBe(1);
		scene.dispose();
	});

	it("waits one active second between RUSH pulses and does not catch up while paused", async () => {
		const scene = createRaceScene(document.createElement("canvas"), (event) => seams.emitted.push(event), { kind: "custom", track: createValidTrackDesign("Rush cadence") });
		await settle(); scene.start(Array.from({ length: 4 }, (_, index) => marble(index + 1)), 11); await settle(); const now = performance.now();
		seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
		// Restart must use the same clock as the simulated animation frames.
		const restartClock = vi.spyOn(performance, "now").mockReturnValue(now + 17);
		try { scene.restartRemaining([marble(1), marble(2)]); await settle(); } finally { restartClock.mockRestore(); }
		seams.frames.shift()?.(now + 34);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(1);
		scene.setPaused(true); seams.frames.shift()?.(now + 10_034); scene.setPaused(false); seams.frames.shift()?.(now + 10_051);
		expect(seams.rushVelocityWrites).toEqual([]);
		for (let frame = 1; frame <= 64; frame += 1) seams.frames.shift()?.(now + 10_051 + frame * 17);
		expect(seams.rushVelocityWrites).toHaveLength(2);
		expect(seams.rushVelocityWrites.map(({ x }) => x).sort((left, right) => left - right)).toEqual([0.5, 3]);
		scene.dispose();
	});

	it("uses the original field size for RUSH after a remaining-marble restart", async () => {
		const scene = createRaceScene(document.createElement("canvas"), (event) => { seams.emitted.push(event); }, { kind: "custom", track: createValidTrackDesign("Rush threshold") });
		await settle(); scene.start(Array.from({ length: 100 }, (_, index) => marble(index + 1)), 11); await settle();
		const now = performance.now(); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(0);
		scene.restartRemaining(Array.from({ length: 50 }, (_, index) => marble(index + 1))); await settle();
		seams.frames.shift()?.(now + 34);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(1);
		seams.frames.shift()?.(now + 51);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(1);
		const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const scale = new THREE.Vector3();
		seams.marbleMeshes[seams.marbleMeshes.length - 1]!.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
		expect(scale).toEqual(new THREE.Vector3(1, 1, 1));
		scene.dispose();
	});

	it("does not emit RUSH when all live marbles DNF in the fixed step", async () => {
		const scene = await startScene(); seams.badBody = true; const now = performance.now(); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
		expect(seams.emitted.filter((event) => (event as { type: string }).type === "rush")).toHaveLength(0);
		scene.dispose();
	});

	it("starts the race clock after a long preparation hold and deducts only later pauses", async () => {
		const scene = await startScene();
		const now = performance.now();
		scene.setPaused(true); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 3_000);
		scene.setPaused(false); seams.frames.shift()?.(now + 3_017); seams.frames.shift()?.(now + 4_017);
		const ticks = () => seams.emitted.filter((event): event is { type: "tick"; elapsedMs: number } => (event as { type: string }).type === "tick");
		const latestTick = () => ticks()[ticks().length - 1];
		expect(latestTick()?.elapsedMs).toBeCloseTo(1_000, -1);

		scene.setPaused(true); seams.frames.shift()?.(now + 4_034); seams.frames.shift()?.(now + 5_034);
		scene.setPaused(false); seams.frames.shift()?.(now + 5_051); seams.frames.shift()?.(now + 6_051);
		expect(latestTick()?.elapsedMs).toBeCloseTo(2_017, -1);
		scene.dispose();
	});

  it.each([3, 25])("keeps bumper-transit gaze local with live marbles at route distance %s", async bodyX => {
    const director = vi.spyOn(cameraPlan, "createActionCameraDirector").mockReturnValue({ update: () => ({ mode: "feature", zoneKey: "bumper:7", targetId: 1, framing: "wide" }), reset: () => undefined });
    seams.featureSamples = true; seams.bodyX = bodyX;
    const scene = createRaceScene(prepareCanvas(), () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 20 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now(); const camera = cameraPoses[0].camera;
    for (let frame = 1; frame <= 20; frame++) seams.frames.shift()?.(now + frame * 17);
    const pose = latestPose(camera);
    expect(pose.position.x).toBeLessThan(1);
    if (bodyX === 3) { expect(pose.lookAt.x).toBeGreaterThan(3); expect(pose.lookAt.x).toBeLessThan(5); }
    else { expect(pose.lookAt.x).toBeGreaterThan(5); expect(pose.lookAt.x).toBeLessThan(8); }
    scene.dispose(); director.mockRestore();
  });

  it("approaches the bumper above the preceding channel and gently follows a marble", async () => {
    seams.featureSamples = true; seams.bodyX = 12;
    const canvas = prepareCanvas(); Object.defineProperties(canvas, { clientWidth: { value: 360 }, clientHeight: { value: 800 } });
    const scene = createRaceScene(canvas, () => undefined, { kind: "custom", track: createValidTrackDesign() });
    await settle(); scene.start(Array.from({ length: 20 }, (_, index) => marble(index + 1)), 11); await settle();
    const now = performance.now();
    for (let frame = 1; frame <= 500; frame++) seams.frames.shift()?.(now + frame * 17);
    const camera = cameraPoses[0].camera;
    expect(latestPose(camera).lookAt.x).toBeGreaterThan(19);
    expect(latestPose(camera).lookAt.x).toBeLessThan(23);
    expect(latestPose(camera).position.x).toBeCloseTo(7, 1);
    expect(latestPose(camera).position.y).toBeGreaterThan(12);
    const before = latestPose(camera).position.x;
    seams.bodyX = 24;
    seams.frames.shift()?.(now + 501 * 17);
    expect(Math.abs(latestPose(camera).position.x - before)).toBeLessThan(0.1);
    for (let frame = 502; frame <= 700; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).lookAt.x).toBeGreaterThan(19);
    expect(latestPose(camera).lookAt.x).toBeLessThan(23);
    expect(latestPose(camera).position.x).toBeCloseTo(7, 1);
    expect(latestPose(camera).position.y).toBeGreaterThan(12);
    seams.bodyX = 35;
    for (let frame = 701; frame <= 900; frame++) seams.frames.shift()?.(now + frame * 17);
    expect(latestPose(camera).lookAt.x).toBeGreaterThan(30);
    scene.dispose();
  });

	it("keeps the route-follow camera through featured modules and manual input", async () => {
		seams.featureSamples = true; seams.bodyX = 12;
		const canvas = prepareCanvas(); Object.defineProperties(canvas, { clientWidth: { value: 320 }, clientHeight: { value: 740 } }); const scene = createRaceScene(canvas, (event) => seams.emitted.push(event), { kind: "custom", track: createValidTrackDesign("Feature") });
		await settle(); scene.start([marble(1)], 11); await settle();
		const camera = cameraPoses[0].camera; const now = performance.now();
		for (let frame = 0; frame < 120; frame += 1) seams.frames.shift()?.(now + frame * 17);
		expect(latestPose(camera).lookAt.x).toBeGreaterThan(7);
		expect(Math.abs(camera.up.x)).toBeLessThan(0.01);
		expect(camera.up.y).toBeGreaterThan(0.99);
		canvasDrag(canvas); seams.bodyX = 31;
		seams.frames.shift()?.(now + 2_100);
		for (let frame = 0; frame < 180; frame += 1) seams.frames.shift()?.(now + 5_100 + frame * 17);
		expect(latestPose(camera).lookAt.x).toBeGreaterThan(26);
		expect(Math.abs(camera.up.x)).toBeLessThan(0.01);
		expect(camera.up.y).toBeGreaterThan(0.99);
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
    const now = performance.now(); seams.frames.shift()?.(now); seams.frames.shift()?.(now + 17);
    const ticks = seams.emitted.filter((event) => (event as { type: string }).type === "tick");
    expect(ticks[ticks.length - 1]).toMatchObject({ type: "tick", finishedCount: 0, eliminatedCount: 1 });
    scene.dispose();
  });
});
