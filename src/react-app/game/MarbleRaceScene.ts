import * as THREE from "three";
import type { Marble } from "../domain/types";
import { applyDrag, applyPan, applyZoom, initialCameraControls, relaxControls } from "./cameraControls";
import { createRaceFocusDirector, getTrackBounds, writeCameraShot, writeControlledTrackFollowShot, writeTrackFollowShot, type CameraShot, type CameraShotName } from "./cameraPlan";
import { createColorBatches } from "./marbleBatches";
import { selectQualityProfile } from "./quality";
import { RACE_TIMEOUT_MS } from "./raceTiming";
import type { BuiltTrack } from "./track/trackBuild";
import { buildObstacleGeometry, type ObstacleGeometryResources } from "./track/obstacleGeometry";
import { createObstaclePhysics, type DevicePose, type ObstaclePhysicsResources } from "./track/obstaclePhysics";
import { createObstacleRenderGroup, disposeObstacleRenderGroup, setDeviceRenderPose } from "./track/obstacleRender";
import { createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, distanceSquaredToSample, initializeTrackPhysics, insideFinishVolume } from "./track/trackPhysics";
import { disposeTrackRenderGroup } from "./track/trackRender";
import { projectToTrack } from "./track/trackSampler";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import { createBuiltInTrackResources, createRaceCourse, type RaceCourse, type RaceCourseRun, type RapierBody, type RapierWorld } from "./raceCourse";

export type SceneEvent =
  | { type: "tick"; elapsedMs: number; finishedCount: number; remaining: Marble[]; leader?: Marble; trailer?: Marble }
  | { type: "finish"; marble: Marble }
  | { type: "dnf"; marble: Marble; reason: "escape" | "non-finite" }
  | { type: "error"; message: string }
  | { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; setPaused: (paused: boolean) => void; reset: () => void; dispose: () => void };
type Ball = { id: number; marble: Marble; body: RapierBody; done: boolean; progress: number; sampleIndex: number; position: Vec3; mesh: THREE.InstancedMesh; renderIndex: number };
type TranslatingBody = Readonly<{ translation: () => Vec3 }>;
export type CameraRankItem = Readonly<{ done: boolean; progress: number }>;

const FINISH_PROGRESS = 0.995;
export const productionSceneStyle = Object.freeze({ background: "#050713", pointLightCount: 2, bloom: false });

export type SceneTrackResources = Readonly<{ built: BuiltTrack; renderGroup: THREE.Group }>;
export type SceneObstacleResources = Readonly<{
  geometry: ObstacleGeometryResources;
  physics: ObstaclePhysicsResources;
  renderGroup: THREE.Group;
  reset: (options?: Readonly<{ gateOpen?: boolean }>) => DevicePose;
  dispose: () => void;
}>;
export type SceneRaceClock = Readonly<{ consumeAfterWorldStep: (pose: Pick<DevicePose, "raceClockStarted">, now: number) => void; elapsedMs: (now: number, pausedDuration?: number, pauseStarted?: number, paused?: boolean) => number; reset: () => void }>;
type SceneTrackColliderCreator = (world: RapierWorld, geometry: BuiltTrack["geometry"]) => unknown;
type SceneStartLifecycleOptions<Request> = Readonly<{
  initialize: () => Promise<void>;
  onReady: () => void;
  onStart: (request: Request) => void;
  onError: (error: unknown) => void;
}>;
type SceneStartLifecycleStatus = "initializing" | "ready" | "failed";

type DebugMetrics = Readonly<{ fps: number; drawCalls: number; triangles: number; active: number; finished: number; shot: CameraShotName }>;
type DebugCameraState = Readonly<{ select: (name: CameraShotName) => void; resume: () => void; isPaused: () => boolean; activeShot: () => CameraShotName }>;
type SceneDebugOverlay = Readonly<{ update: (metrics: DebugMetrics, now: number) => boolean; dispose: () => void }>;

export const isTrackDebugEnabled = (search: string): boolean => new URLSearchParams(search).get("trackDebug") === "1";

export const createDebugCameraState = (enabled: boolean): DebugCameraState => {
  let paused = false;
  let shot: CameraShotName = "overview";
  return Object.freeze({
    select: (name: CameraShotName) => { if (enabled) { shot = name; paused = true; } },
    resume: () => { paused = false; },
    isPaused: () => enabled && paused,
    activeShot: () => shot,
  });
};

export const getRaceElapsedMs = (now: number, startedAt: number, pausedDuration: number, pauseStarted: number, paused: boolean): number =>
  Math.max(0, now - startedAt - pausedDuration - (paused ? now - pauseStarted : 0));

export const refreshCameraRankView = <Item extends CameraRankItem>(live: readonly Item[], ranked: Item[]): Item[] => {
  ranked.length = 0;
  for (let index = 0; index < live.length; index += 1) {
    if (!live[index].done) ranked.push(live[index]);
  }
  ranked.sort((left, right) => right.progress - left.progress);
  return ranked;
};

export const createSceneDebugOverlay = (mount: HTMLElement, debug: DebugCameraState): SceneDebugOverlay => {
  const root = document.createElement("section");
  root.className = "track-debug-overlay";
  root.dataset.trackDebug = "1";
  const controls = document.createElement("div");
  controls.className = "track-debug-controls";
  ([ ["Top", "overview"], ["Side", "side"], ["Profile", "profile"] ] as const).forEach(([label, shot]) => {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label; button.addEventListener("click", () => debug.select(shot)); controls.append(button);
  });
  const resume = document.createElement("button");
  resume.type = "button"; resume.textContent = "Resume"; resume.addEventListener("click", () => debug.resume()); controls.append(resume);
  const metrics = document.createElement("output");
  metrics.className = "track-debug-metrics";
  root.append(controls, metrics); mount.append(root);
  let lastUpdated = Number.NEGATIVE_INFINITY;
  return Object.freeze({
    update: (value: DebugMetrics, now: number) => {
      if (now - lastUpdated < 250) return false;
      lastUpdated = now;
      metrics.textContent = `FPS ${Math.round(value.fps)} · Calls ${value.drawCalls} · Triangles ${value.triangles} · Active ${value.active} · Finished ${value.finished} · Shot ${value.shot}`;
      return true;
    },
    dispose: () => root.remove(),
  });
};

export const createSceneTrackResources = (debug = false): SceneTrackResources => {
  return createBuiltInTrackResources(debug);
};

export const attachSceneTrackCollider = (
  world: RapierWorld,
  resources: SceneTrackResources,
  createCollider: SceneTrackColliderCreator = createTrackCollider,
): unknown => createCollider(world, resources.built.geometry);

export const initializeScenePhysics = (): Promise<void> => initializeTrackPhysics().then(() => undefined);

export const createSceneObstacleResources = (world: RapierWorld, track: SceneTrackResources): SceneObstacleResources => {
  const geometry = buildObstacleGeometry(track.built.geometry, track.built.obstacleLayout);
  const physics = createObstaclePhysics(world, geometry);
  const renderGroup = createObstacleRenderGroup(geometry, physics.controller.initialPose());
  let disposed = false;
  return Object.freeze({
    geometry,
    physics,
    renderGroup,
    reset: (options = {}) => {
      if (disposed) throw new Error("Obstacle scene resources have been disposed.");
      const pose = physics.reset(options);
      setDeviceRenderPose(renderGroup, pose);
      return pose;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      physics.dispose();
      renderGroup.removeFromParent();
      disposeObstacleRenderGroup(renderGroup);
    },
  });
};

export const disposeSceneObstacleResources = (resources: SceneObstacleResources): void => resources.dispose();

export const stepSceneObstacleResources = (world: { timestep: number; step: () => void }, resources: SceneObstacleResources): DevicePose => {
  const pose = resources.physics.stepFixed();
  world.timestep = 1 / 60;
  world.step();
  setDeviceRenderPose(resources.renderGroup, pose);
  return pose;
};

export const createSceneRaceClock = (): SceneRaceClock => {
  let startedAt: number | undefined;
  return Object.freeze({
    consumeAfterWorldStep: (pose, now) => { if (startedAt === undefined && pose.raceClockStarted) startedAt = now; },
    elapsedMs: (now, pausedDuration = 0, pauseStarted = 0, paused = false) => startedAt === undefined ? 0 : getRaceElapsedMs(now, startedAt, pausedDuration, pauseStarted, paused),
    reset: () => { startedAt = undefined; },
  });
};

export const createSceneStartLifecycle = <Request,>(options: SceneStartLifecycleOptions<Request>) => {
  let status: SceneStartLifecycleStatus = "initializing";
  let requested: Request | undefined;
  let disposed = false;
  let initializationError: unknown;
  const ready = options.initialize().then(() => {
    if (disposed) return;
    status = "ready";
    options.onReady();
    const next = requested;
    requested = undefined;
    if (next !== undefined) options.onStart(next);
  }).catch((error: unknown) => {
    requested = undefined;
    if (disposed) return;
    status = "failed";
    initializationError = error;
    options.onError(error);
  });

  return Object.freeze({
    ready,
    requestStart: (request: Request) => {
      if (disposed) return;
      if (status === "ready") {
        options.onStart(request);
      } else if (status === "initializing") {
        requested = request;
      } else {
        options.onError(initializationError);
      }
    },
    reset: () => { requested = undefined; },
    dispose: () => { disposed = true; requested = undefined; },
    status: () => status,
  });
};

export const projectRaceBody = (body: TranslatingBody, samples: readonly TrackSample[]) =>
  projectToTrack(body.translation(), samples);

export const hasFinishedTrack = (position: Vec3, samples: readonly TrackSample[]): boolean => {
  const projection = projectToTrack(position, samples);
  return projection.progress >= FINISH_PROGRESS && insideFinishVolume(position, samples[samples.length - 1]);
};

export const evaluateRaceBody = (
  body: TranslatingBody,
  samples: readonly TrackSample[],
  project: typeof projectToTrack = projectToTrack,
) => {
  const position = body.translation();
  const projection = project(position, samples);
  return Object.freeze({
    position,
    projection,
    finished: projection.progress >= FINISH_PROGRESS && insideFinishVolume(position, samples[samples.length - 1]),
  });
};

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void, selection: import("../designer/trackDesign").RaceCourseSelection = { kind: "builtin" }): RaceScene {
  const debugEnabled = isTrackDebugEnabled(window.location.search);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let course: RaceCourse;
  try {
    course = createRaceCourse(selection, { debug: debugEnabled });
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    return { start: () => undefined, restartRemaining: () => undefined, setPaused: () => undefined, reset: () => undefined, dispose: () => undefined };
  }
  const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
  const debug = createDebugCameraState(debugEnabled);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
  renderer.shadowMap.enabled = profile.shadows;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(productionSceneStyle.background);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const cameraLook = new THREE.Vector3(0, 10, 4);
  camera.position.set(24, 58, 105); camera.lookAt(cameraLook);
  scene.add(new THREE.AmbientLight("#ced8ff", 1.35));
  scene.add(new THREE.HemisphereLight("#7bb9ff", "#060915", 1.8));
  const key = new THREE.DirectionalLight("#dce8ff", 2.3); key.position.set(12, 42, 36); scene.add(key);
  const cyan = new THREE.PointLight("#19d7e7", 30, 58, 1.3); cyan.position.set(0, 27, 38); scene.add(cyan);
  const magenta = new THREE.PointLight("#e73da7", 24, 46, 1.2); magenta.position.set(4, 8, -58); scene.add(magenta);
  const bounds = getTrackBounds(course.samples);
  const trackDebug = debugEnabled ? createSceneDebugOverlay(canvas.parentElement ?? document.body, debug) : undefined;
  const track = course.renderGroup;
  const marbleGroup = new THREE.Group();
  scene.add(track, marbleGroup);
  let world: RapierWorld | undefined; let raceRun: RaceCourseRun | undefined; let balls: Ball[] = []; let renderMeshes: THREE.InstancedMesh[] = [];
  const liveBalls: Ball[] = [];
  const rankedCameraBalls: Ball[] = [];
  let running = false; let timedOut = false; let last = performance.now(); let fixedAccumulator = 0; let disposed = false;
  let manualPaused = false; let pauseStarted = 0; let pausedDuration = 0; let debugWasPaused = false; let activeShot: CameraShotName = "overview";
  let frameId: number | undefined;
  let controls = initialCameraControls; const pointers = new Map<number, { x: number; y: number }>(); const panPointers = new Set<number>(); let pinchDistance: number | undefined; let lastCameraInputAt = last;
  const dummy = new THREE.Object3D();
  const raceFocus = createRaceFocusDirector();
  const raceClock = createSceneRaceClock();
  const cameraFocus = new THREE.Vector3(); const cameraTarget = new THREE.Vector3(); const cameraUpTarget = new THREE.Vector3(0, 1, 0);
  const cameraShot: CameraShot = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 };
  const controlledCameraShot: CameraShot = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 };
  const resize = () => { const width = canvas.clientWidth || window.innerWidth; const height = canvas.clientHeight || window.innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  window.addEventListener("resize", resize); canvas.style.touchAction = "none"; resize();
  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.button === 2) panPointers.add(event.pointerId);
    if (pointers.size === 2) {
      const points = [...pointers.values()]; pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
    lastCameraInputAt = performance.now(); canvas.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const deltaX = event.clientX - previous.x; const deltaY = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const points = [...pointers.values()]; const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchDistance !== undefined) controls = applyZoom(controls, -(distance - pinchDistance));
      pinchDistance = distance;
    } else if (panPointers.has(event.pointerId)) controls = applyPan(controls, deltaX, deltaY);
    else controls = applyDrag(controls, deltaX, deltaY);
    lastCameraInputAt = performance.now();
  };
  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId); panPointers.delete(event.pointerId); if (pointers.size < 2) pinchDistance = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent) => { event.preventDefault(); controls = applyZoom(controls, event.deltaY); lastCameraInputAt = performance.now(); };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp); canvas.addEventListener("wheel", onWheel, { passive: false }); canvas.addEventListener("contextmenu", onContextMenu);
  const clearMarbles = () => disposeTrackRenderGroup(marbleGroup);

  type SceneStartRequest = { marbles: Marble[]; seed: number; remainingRestart?: boolean };
  const stopRace = () => {
    raceRun?.dispose(); raceRun = undefined;
    world?.free(); world = undefined;
    running = false;
    balls = []; liveBalls.length = 0; rankedCameraBalls.length = 0; renderMeshes = [];
    clearMarbles(); track.visible = false;
  };
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    starts?.dispose();
    stopRace();
    course.dispose();
    trackDebug?.dispose();
    if (frameId !== undefined) { cancelAnimationFrame(frameId); frameId = undefined; }
    pointers.forEach((_point, pointerId) => { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); });
    window.removeEventListener("resize", resize); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("contextmenu", onContextMenu); pointers.clear(); panPointers.clear(); pinchDistance = undefined;
    renderer.dispose();
  };

  const begin = (marbles: Marble[], seed: number, remainingRestart = false) => {
    raceRun?.dispose(); raceRun = undefined;
    world?.free(); world = undefined;
    world = createTrackPhysicsWorld();
    course.attach(world);
    raceRun = course.createRun(world, marbles.length, seed, remainingRestart);
    track.visible = true;
    clearMarbles();
    const renderBindings = new Map<number, { mesh: THREE.InstancedMesh; renderIndex: number }>(); renderMeshes = [];
    createColorBatches(marbles).forEach((batch) => {
      const colorMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshStandardMaterial({ color: batch.color, roughness: 0.28, metalness: 0.18 }), batch.sourceIndexes.length);
      colorMesh.frustumCulled = false; colorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(colorMesh); renderMeshes.push(colorMesh);
      batch.sourceIndexes.forEach((sourceIndex, renderIndex) => renderBindings.set(sourceIndex, { mesh: colorMesh, renderIndex }));
    });
    const launchPositions = raceRun.launchPositions;
    const bodies = createMarbleBodies(
      world,
      launchPositions,
    );
    balls = marbles.map((marble, index) => ({ id: marble.id, marble, body: bodies[index], done: false, progress: 0, sampleIndex: 0, position: launchPositions[index], ...renderBindings.get(index)! }));
    liveBalls.length = 0; rankedCameraBalls.length = 0; raceFocus.reset(); raceClock.reset(); running = true; timedOut = false; fixedAccumulator = 0; last = performance.now(); pausedDuration = 0; debugWasPaused = debug.isPaused(); pauseStarted = debugWasPaused ? last : 0;
  };

  const updateCamera = (elapsedMs: number, leaderProgress: number) => {
    let localUp = course.samples[0]?.up ?? { x: 0, y: 1, z: 0 };
    if (reducedMotion) {
      activeShot = "overview";
      writeCameraShot(cameraShot, activeShot, bounds);
    } else if (debug.isPaused()) {
      activeShot = debug.activeShot();
      writeCameraShot(cameraShot, activeShot, bounds);
    } else {
      const target = raceFocus.select(rankedCameraBalls, leaderProgress, elapsedMs);
      if (target) {
        const sample = course.samples[target.sampleIndex] ?? course.samples[0];
        localUp = sample.up;
        activeShot = target === rankedCameraBalls[0] ? "leader" : target === rankedCameraBalls[rankedCameraBalls.length - 1] ? "trailer" : "profile";
        writeTrackFollowShot(cameraShot, target.position, sample, bounds);
      } else {
        activeShot = "overview";
        writeCameraShot(cameraShot, activeShot, bounds);
      }
    }
    writeControlledTrackFollowShot(controlledCameraShot, cameraShot, localUp, controls);
    if (camera.near !== controlledCameraShot.near || camera.far !== controlledCameraShot.far) {
      camera.near = controlledCameraShot.near; camera.far = controlledCameraShot.far; camera.updateProjectionMatrix();
    }
    cameraFocus.set(controlledCameraShot.lookAt.x, controlledCameraShot.lookAt.y, controlledCameraShot.lookAt.z);
    cameraTarget.set(controlledCameraShot.position.x, controlledCameraShot.position.y, controlledCameraShot.position.z);
    cameraUpTarget.set(localUp.x, localUp.y, localUp.z);
    camera.position.lerp(cameraTarget, 0.042); cameraLook.lerp(cameraFocus, 0.05); camera.lookAt(cameraLook);
    camera.up.lerp(cameraUpTarget, 0.05);
  };

  const loop = (now: number) => {
    if (disposed) return;
    frameId = requestAnimationFrame(loop);
    const delta = Math.min(33, now - last); last = now;
    if (reducedMotion) controls = relaxControls(controls, 1);
    else if (now - lastCameraInputAt >= 3_000) controls = relaxControls(controls, delta / 3_000);
    const paused = manualPaused || debug.isPaused();
    if (running && paused && !debugWasPaused) pauseStarted = now;
    if (running && !paused && debugWasPaused) pausedDuration += now - pauseStarted;
    debugWasPaused = paused;
    if (running && world && raceRun && renderMeshes.length && !paused) {
      fixedAccumulator += delta;
      while (fixedAccumulator >= 1000 / 60) {
        const pose = raceRun.stepBeforeWorld();
        world.timestep = 1 / 60;
        world.step();
        raceRun.stepAfterWorld(balls.map((ball) => ball.body));
        raceClock.consumeAfterWorldStep(pose, now);
        fixedAccumulator -= 1000 / 60;
      }
      const elapsedMs = raceClock.elapsedMs(now, pausedDuration, pauseStarted, false);
      balls.forEach((ball) => {
        if (ball.done) return;
        const position = ball.body.translation();
        const finite = [position.x, position.y, position.z].every(Number.isFinite);
        if (!finite) {
          ball.done = true; ball.body.setEnabled(false); emit({ type: "dnf", marble: ball.marble, reason: "non-finite" }); return;
        }
        const raceState = evaluateRaceBody(ball.body, course.samples);
        if (!Number.isFinite(raceState.projection.progress) || distanceSquaredToSample(position, course.samples[raceState.projection.sampleIndex]) > 15 ** 2) {
          ball.done = true; ball.body.setEnabled(false); emit({ type: "dnf", marble: ball.marble, reason: "escape" }); return;
        }
        ball.progress = raceState.projection.progress; ball.sampleIndex = raceState.projection.sampleIndex; ball.position = raceState.position;
        if (raceState.finished) {
          ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble });
        }
      });
      balls.forEach((ball) => { dummy.position.set(ball.position.x, ball.position.y, ball.position.z); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); });
      renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
      liveBalls.length = 0;
      balls.forEach((ball) => { if (!ball.done) liveBalls.push(ball); });
      refreshCameraRankView(liveBalls, rankedCameraBalls);
      const leader = rankedCameraBalls[0]; const trailer = rankedCameraBalls[rankedCameraBalls.length - 1];
      updateCamera(elapsedMs, leader?.progress ?? 0); emit({ type: "tick", elapsedMs, finishedCount: balls.length - liveBalls.length, remaining: liveBalls.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble });
      if (course.kind === "builtin" && elapsedMs >= RACE_TIMEOUT_MS && !timedOut && liveBalls.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: liveBalls.map((ball) => ball.marble) }); }
      if (!liveBalls.length) running = false;
    }
    if (paused) updateCamera(raceClock.elapsedMs(now, pausedDuration, pauseStarted, true), rankedCameraBalls[0]?.progress ?? 0);
    renderer.render(scene, camera);
    if (trackDebug) trackDebug.update({
      fps: 1_000 / Math.max(1, delta), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      active: balls.filter((ball) => !ball.done).length, finished: balls.filter((ball) => ball.done).length, shot: activeShot,
    }, now);
  };

  const starts = createSceneStartLifecycle<SceneStartRequest>({
    initialize: initializeScenePhysics,
    onReady: () => { world = createTrackPhysicsWorld(); },
    onStart: ({ marbles, seed, remainingRestart = false }) => {
      try {
        begin(marbles, seed, remainingRestart);
      } catch (error) {
        teardown();
        emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
    },
    onError: (error) => { teardown(); emit({ type: "error", message: error instanceof Error ? error.message : String(error) }); },
  });
  frameId = requestAnimationFrame(loop);
  return {
    start: (marbles, seed) => starts?.requestStart({ marbles, seed }),
    restartRemaining: (marbles) => starts?.requestStart({ marbles, seed: Date.now(), remainingRestart: true }),
    setPaused: (paused) => { manualPaused = paused; },
    reset: () => { starts?.reset(); raceFocus.reset(); raceClock.reset(); stopRace(); },
    dispose: teardown,
  };
}
