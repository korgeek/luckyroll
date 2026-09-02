import * as THREE from "three";
import type { Marble } from "../domain/types";
import { applyDrag, applyZoom, initialCameraControls } from "./cameraControls";
import { getTrackBounds, selectProductionCameraShot, writeCameraShot, type CameraShot, type CameraShotName } from "./cameraPlan";
import { createColorBatches } from "./marbleBatches";
import { selectQualityProfile } from "./quality";
import { RACE_TIMEOUT_MS } from "./raceTiming";
import { buildValidatedTrack, type BuiltTrack } from "./track/trackBuild";
import { createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, initializeTrackPhysics, insideFinishVolume, launchPositionsFor } from "./track/trackPhysics";
import { createTrackRenderGroup, disposeTrackRenderGroup } from "./track/trackRender";
import { projectToTrack } from "./track/trackSampler";
import { createLaunchSlots } from "./track/trackSpec";
import type { TrackSample, Vec3 } from "./track/trackTypes";

export type SceneEvent =
  | { type: "tick"; elapsedMs: number; finishedCount: number; remaining: Marble[]; leader?: Marble; trailer?: Marble }
  | { type: "finish"; marble: Marble }
  | { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; reset: () => void; dispose: () => void };
type Ball = { marble: Marble; body: any; done: boolean; progress: number; position: Vec3; mesh: THREE.InstancedMesh; renderIndex: number };
type TranslatingBody = Readonly<{ translation: () => Vec3 }>;

const FINISH_PROGRESS = 0.995;

export type SceneTrackResources = Readonly<{ built: BuiltTrack; renderGroup: THREE.Group }>;
type SceneTrackColliderCreator = (world: any, geometry: BuiltTrack["geometry"]) => unknown;
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
  const built = buildValidatedTrack({ features: true });
  return Object.freeze({ built, renderGroup: createTrackRenderGroup(built.geometry, { debug }) });
};

export const attachSceneTrackCollider = (
  world: any,
  resources: SceneTrackResources,
  createCollider: SceneTrackColliderCreator = createTrackCollider,
): unknown => createCollider(world, resources.built.geometry);

export const initializeScenePhysics = (): Promise<void> => initializeTrackPhysics().then(() => undefined);

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

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void): RaceScene {
  const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
  const debugEnabled = isTrackDebugEnabled(window.location.search);
  const debug = createDebugCameraState(debugEnabled);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
  renderer.shadowMap.enabled = profile.shadows;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d9f7f4");
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const cameraLook = new THREE.Vector3(0, 10, 4);
  camera.position.set(24, 58, 105); camera.lookAt(cameraLook);
  scene.add(new THREE.AmbientLight("#fff6db", 3.2));
  scene.add(new THREE.HemisphereLight("#f5ffff", "#7eb6c7", 3));
  const key = new THREE.DirectionalLight("#ffffff", 3.2); key.position.set(12, 42, 36); scene.add(key);
  const cyan = new THREE.PointLight("#75eee2", 72, 96, 1.3); cyan.position.set(0, 27, 38); scene.add(cyan);
  const gold = new THREE.PointLight("#ffc860", 60, 76, 1.2); gold.position.set(4, 8, -58); scene.add(gold);
  const sceneTrack = createSceneTrackResources(debugEnabled);
  const bounds = getTrackBounds(sceneTrack.built.samples);
  const trackDebug = debugEnabled ? createSceneDebugOverlay(canvas.parentElement ?? document.body, debug) : undefined;
  const track = sceneTrack.renderGroup;
  const marbleGroup = new THREE.Group();
  scene.add(track, marbleGroup);
  let world: any; let balls: Ball[] = []; let renderMeshes: THREE.InstancedMesh[] = [];
  let running = false; let timedOut = false; let startedAt = 0; let last = performance.now(); let disposed = false;
  let pauseStarted = 0; let pausedDuration = 0; let debugWasPaused = false; let activeShot: CameraShotName = "overview";
  let controls = initialCameraControls; let activePointer: number | undefined; let pointerX = 0; let pointerY = 0;
  const dummy = new THREE.Object3D();
  const cameraFocus = new THREE.Vector3(); const cameraOffset = new THREE.Vector3(); const cameraTarget = new THREE.Vector3(); const worldUp = new THREE.Vector3(0, 1, 0);
  const cameraShot: CameraShot = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 };
  const resize = () => { const width = canvas.clientWidth || window.innerWidth; const height = canvas.clientHeight || window.innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  window.addEventListener("resize", resize); canvas.style.touchAction = "none"; resize();
  const onPointerDown = (event: PointerEvent) => { activePointer = event.pointerId; pointerX = event.clientX; pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; controls = applyDrag(controls, event.clientX - pointerX, event.clientY - pointerY); pointerX = event.clientX; pointerY = event.clientY; };
  const onPointerUp = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; activePointer = undefined; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  const onWheel = (event: WheelEvent) => { event.preventDefault(); controls = applyZoom(controls, event.deltaY); };
  canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp); canvas.addEventListener("wheel", onWheel, { passive: false });
  const clearMarbles = () => disposeTrackRenderGroup(marbleGroup);

  const begin = (marbles: Marble[], seed: number) => {
    if (!world) return;
    world.free();
    world = createTrackPhysicsWorld();
    attachSceneTrackCollider(world, sceneTrack);
    track.visible = true;
    clearMarbles();
    const renderBindings = new Map<number, { mesh: THREE.InstancedMesh; renderIndex: number }>(); renderMeshes = [];
    createColorBatches(marbles).forEach((batch) => {
      const colorMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshBasicMaterial({ color: batch.color, fog: false, toneMapped: false }), batch.sourceIndexes.length);
      colorMesh.frustumCulled = false; colorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(colorMesh); renderMeshes.push(colorMesh);
      batch.sourceIndexes.forEach((sourceIndex, renderIndex) => renderBindings.set(sourceIndex, { mesh: colorMesh, renderIndex }));
    });
    const launchPositions = launchPositionsFor(createLaunchSlots(marbles.length), sceneTrack.built.geometry, seed);
    const bodies = createMarbleBodies(
      world,
      launchPositions,
    );
    balls = marbles.map((marble, index) => ({ marble, body: bodies[index], done: false, progress: 0, position: launchPositions[index], ...renderBindings.get(index)! }));
    running = true; timedOut = false; startedAt = performance.now(); pausedDuration = 0; debugWasPaused = debug.isPaused(); pauseStarted = debugWasPaused ? startedAt : 0;
  };

  const updateCamera = (elapsedMs: number, leader?: Ball, trailer?: Ball) => {
    activeShot = debug.isPaused() ? debug.activeShot() : selectProductionCameraShot(elapsedMs, leader?.progress ?? 0);
    const focus = activeShot === "leader" ? leader?.position : activeShot === "trailer" ? trailer?.position : activeShot === "finish" ? sceneTrack.built.samples[sceneTrack.built.samples.length - 1]?.position : undefined;
    writeCameraShot(cameraShot, activeShot, bounds, focus);
    camera.near = cameraShot.near; camera.far = cameraShot.far; camera.updateProjectionMatrix();
    cameraFocus.set(cameraShot.lookAt.x, cameraShot.lookAt.y, cameraShot.lookAt.z);
    cameraOffset.set(cameraShot.position.x, cameraShot.position.y, cameraShot.position.z).sub(cameraFocus).applyAxisAngle(worldUp, controls.yaw).multiplyScalar(controls.zoom);
    cameraOffset.y += controls.pitch * 25;
    cameraTarget.copy(cameraFocus).add(cameraOffset);
    camera.position.lerp(cameraTarget, 0.042); cameraLook.lerp(cameraFocus, 0.05); camera.lookAt(cameraLook);
  };

  const loop = (now: number) => {
    if (disposed) return;
    requestAnimationFrame(loop);
    const delta = Math.min(33, now - last); last = now;
    const paused = debug.isPaused();
    if (running && paused && !debugWasPaused) pauseStarted = now;
    if (running && !paused && debugWasPaused) pausedDuration += now - pauseStarted;
    debugWasPaused = paused;
    if (running && world && renderMeshes.length && !paused) {
      world.timestep = delta / 1000; world.step(); const active = balls.filter((ball) => !ball.done); const elapsedMs = getRaceElapsedMs(now, startedAt, pausedDuration, pauseStarted, false);
      active.forEach((ball) => {
        const raceState = evaluateRaceBody(ball.body, sceneTrack.built.samples);
        ball.progress = raceState.projection.progress; ball.position = raceState.position;
        if (raceState.finished) {
          ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble });
        }
      });
      balls.forEach((ball) => { dummy.position.set(ball.position.x, ball.position.y, ball.position.z); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); });
      renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
      const live = balls.filter((ball) => !ball.done); const leader = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress > best.progress ? ball : best, undefined); const trailer = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress < best.progress ? ball : best, undefined);
      updateCamera(elapsedMs, leader, trailer); emit({ type: "tick", elapsedMs, finishedCount: balls.length - live.length, remaining: live.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble });
      if (elapsedMs >= RACE_TIMEOUT_MS && !timedOut && live.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: live.map((ball) => ball.marble) }); }
      if (!live.length) running = false;
    }
    if (paused) updateCamera(getRaceElapsedMs(now, startedAt, pausedDuration, pauseStarted, true));
    renderer.render(scene, camera);
    if (trackDebug) trackDebug.update({
      fps: 1_000 / Math.max(1, delta), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      active: balls.filter((ball) => !ball.done).length, finished: balls.filter((ball) => ball.done).length, shot: activeShot,
    }, now);
  };

  const starts = createSceneStartLifecycle({
    initialize: initializeScenePhysics,
    onReady: () => { world = createTrackPhysicsWorld(); },
    onStart: ({ marbles, seed }: { marbles: Marble[]; seed: number }) => begin(marbles, seed),
    onError: (error) => { console.error("Lucky Roll physics initialization failed.", error); },
  });
  requestAnimationFrame(loop);
  return {
    start: (marbles, seed) => starts.requestStart({ marbles, seed }),
    restartRemaining: (marbles) => starts.requestStart({ marbles, seed: Date.now() }),
    reset: () => { starts.reset(); running = false; balls = []; renderMeshes = []; clearMarbles(); track.visible = false; },
    dispose: () => {
      disposed = true; starts.dispose(); running = false; world?.free(); trackDebug?.dispose(); disposeTrackRenderGroup(track); clearMarbles(); renderer.dispose();
      window.removeEventListener("resize", resize); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel);
    },
  };
}
