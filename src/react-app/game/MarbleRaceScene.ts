import { createAdaptiveQuality } from "./adaptiveQuality";
import { retroSounds, soundProximity } from "./retroSounds";
import * as THREE from "three";
import type { Marble } from "../domain/types";
import { applyDrag, applyPan, applyZoom, initialCameraControls, relaxControls } from "./cameraControls";
import { alongRouteDistance, cameraLerpAlpha, createRouteCrowdDirector, createActionCameraDirector, deriveFeatureBroadcastZones, deriveRouteRuns, getBirdViewUp, getTrackBounds, writeBirdViewFit, writeCameraShot, writeControlledTrackFollowShot, writeRouteCrowdFollowShot, writeTrackFollowShot, type CameraShot, type CameraShotName, type CameraAction, type ActionCameraSelection } from "./cameraPlan";
import { createColorBatches } from "./marbleBatches";
import { selectQualityProfile } from "./quality";
import { RACE_TIMEOUT_MS } from "./raceTiming";
import type { BuiltTrack } from "./track/trackBuild";
import { buildObstacleGeometry, type ObstacleGeometryResources } from "./track/obstacleGeometry";
import { createObstaclePhysics, type DevicePose, type ObstaclePhysicsResources } from "./track/obstaclePhysics";
import { createObstacleRenderGroup, disposeObstacleRenderGroup, setDeviceRenderPose } from "./track/obstacleRender";
import { createMarbleBodies, createTrackCollider, createTrackPhysicsWorld, distanceSquaredToSample, distanceSquaredToTrackSegments, initializeTrackPhysics, insideFinishVolume } from "./track/trackPhysics";
import { disposeTrackRenderGroup } from "./track/trackRender";
import { createTrackProjector, projectToTrack } from "./track/trackSampler";
import type { TrackSample, Vec3 } from "./track/trackTypes";
import { collectBumperHits, createBuiltInTrackResources, createRaceCourse, type RaceCourse, type RaceCourseRun, type RapierBody, type RapierWorld } from "./raceCourse";
import { applyRaceRushPulse, shouldStartRaceRush } from "./raceRush";

export type LiveStanding = Readonly<{ marble: Marble; gap: number }>;
export type SceneEvent =
  | { type: "prepared" }
  | { type: "rush" }
  | { type: "tick"; elapsedMs: number; fps: number; finishedCount: number; eliminatedCount: number; remaining: Marble[]; standings: readonly LiveStanding[]; boostRemainingMs: number; leader?: Marble; trailer?: Marble }
  | { type: "finish"; marble: Marble }
  | { type: "dnf"; marble: Marble; reason: "escape" | "non-finite" }
  | { type: "error"; message: string }
  | { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; boost: () => boolean; setPaused: (paused: boolean) => void; setBirdView: (enabled: boolean) => void; reset: () => void; dispose: () => void };
type Ball = { id: number; marble: Marble; body: RapierBody; done: boolean; eliminated: boolean; progress: number; sampleIndex: number; position: Vec3; mesh: THREE.InstancedMesh; renderIndex: number };
type TranslatingBody = Readonly<{ translation: () => Vec3 }>;
export type CameraRankItem = Readonly<{ done: boolean; progress: number }>;
export type RaceBoostState = Readonly<{ running: boolean; manualPaused: boolean; debugPaused: boolean; gateOpen: boolean; disposed: boolean; rushActive?: boolean }>;
type BoostableBall = Readonly<{ done: boolean; sampleIndex: number; body: Pick<RapierBody, "linvel" | "setLinvel"> }>;
type StandingBall = Readonly<{ id: number; marble: Marble; done: boolean; sampleIndex: number; position: Vec3 }>;

export { alongRouteDistance } from "./cameraPlan";
export { applyRaceRushPulse, shouldStartRaceRush } from "./raceRush";

const BOOST_CHARGE_STEPS = 300;
const raceBoostAllowed = (state: RaceBoostState): boolean => state.running && !state.manualPaused && !state.debugPaused && state.gateOpen && !state.disposed;

export const createRaceBoost = () => {
  let remainingSteps = BOOST_CHARGE_STEPS;
  return Object.freeze({
    remainingMs: () => remainingSteps * 1000 / 60,
    step: (state: RaceBoostState, fraction = 1) => { if (remainingSteps && raceBoostAllowed(state)) remainingSteps = Math.max(0, remainingSteps - Math.max(0, Number.isFinite(fraction) ? fraction : 0)); },
    activate: (state: RaceBoostState, balls: readonly BoostableBall[], samples: readonly Pick<TrackSample, "tangent">[]): boolean => {
      if (remainingSteps || !raceBoostAllowed(state) || state.rushActive) return false;
      let changed = false;
      for (const ball of balls) {
        if (ball.done) continue;
        const velocity = ball.body.linvel(); const tangent = samples[ball.sampleIndex]?.tangent;
        if (!tangent || ![velocity.x, velocity.y, velocity.z, tangent.x, tangent.y, tangent.z].every(Number.isFinite)) continue;
        const forward = velocity.x * tangent.x + velocity.y * tangent.y + velocity.z * tangent.z;
        if (forward <= 0 || forward >= 42) continue;
        const delta = Math.min(42, forward * 1.5) - forward;
        ball.body.setLinvel({ x: velocity.x + tangent.x * delta, y: velocity.y + tangent.y * delta, z: velocity.z + tangent.z * delta }, true);
        changed = true;
      }
      if (changed) remainingSteps = BOOST_CHARGE_STEPS;
      return changed;
    },
    reset: () => { remainingSteps = BOOST_CHARGE_STEPS; },
  });
};

export const createLiveStandings = (balls: readonly StandingBall[], samples: readonly Pick<TrackSample, "distance" | "position">[]): LiveStanding[] => {
  const standing = balls.filter((ball) => !ball.done)
    .map((ball) => ({ ball, distance: alongRouteDistance(ball.position, ball.sampleIndex, samples) }))
    .sort((left, right) => left.distance - right.distance || left.ball.id - right.ball.id);
  const first = standing[0]?.distance ?? 0;
  return standing.slice(0, 10).map(({ ball, distance }) => ({ marble: ball.marble, gap: distance - first }));
};

export const shouldEmitSceneTick = (now: number, lastTick: number, elapsedMs: number, liveCount: number): boolean =>
  now - lastTick >= 100 || elapsedMs >= RACE_TIMEOUT_MS || liveCount === 0;

const FINISH_PROGRESS = 0.995;
export const productionSceneStyle = Object.freeze({ background: "#050713", pointLightCount: 2, bloom: false });

export const createFrameRateCounter = (windowMs = 500) => {
  let startedAt: number | undefined; let frames = 0; let fps = 0;
  return Object.freeze({
    sample: (now: number) => {
      if (!Number.isFinite(now)) return fps;
      if (startedAt === undefined) { startedAt = now; return fps; }
      frames += 1;
      const elapsed = now - startedAt;
      if (elapsed >= windowMs) { fps = frames * 1_000 / elapsed; frames = 0; startedAt = now; }
      return fps;
    },
  });
};

export const createMarbleRollTexture = (): THREE.DataTexture => {
  const width = 32; const height = 16; const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const stripe = Math.abs(x - width * 0.28) < 3 || Math.hypot(x - 23, y - 5) < 2.5;
    const value = stripe ? 70 : 255; const offset = (y * width + x) * 4;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
};

export type SceneTrackResources = Readonly<{ built: BuiltTrack; renderGroup: THREE.Group }>;
export type SceneObstacleResources = Readonly<{
  geometry: ObstacleGeometryResources;
  physics: ObstaclePhysicsResources;
  renderGroup: THREE.Group;
  reset: (options?: Readonly<{ gateOpen?: boolean }>) => DevicePose;
  dispose: () => void;
}>;
export type SceneRaceClock = Readonly<{ consumeAfterWorldStep: (pose: Pick<DevicePose, "raceClockStarted">, now: number, pausedDuration?: number) => void; elapsedMs: (now: number, pausedDuration?: number, pauseStarted?: number, paused?: boolean) => number; reset: () => void }>;
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
	let pausedAtStart = 0;
  return Object.freeze({
    consumeAfterWorldStep: (pose, now, pausedDuration = 0) => { if (startedAt === undefined && pose.raceClockStarted) { startedAt = now; pausedAtStart = pausedDuration; } },
    elapsedMs: (now, pausedDuration = 0, pauseStarted = 0, paused = false) => startedAt === undefined ? 0 : getRaceElapsedMs(now, startedAt, Math.max(0, pausedDuration - pausedAtStart), pauseStarted, paused),
    reset: () => { startedAt = undefined; pausedAtStart = 0; },
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

export type FrameProfile = { frameMs: number; physicsMs: number; audioMs: number; trackingMs: number; renderMs: number };
export type ScenePerformanceOptions = { onProfile?: (frame: FrameProfile) => void; pixelRatioScale?: number };

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void, selection: import("../designer/trackDesign").RaceCourseSelection = { kind: "builtin" }, performanceOptions: ScenePerformanceOptions = {}): RaceScene {
  const debugEnabled = isTrackDebugEnabled(window.location.search);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let course: RaceCourse;
  try {
    course = createRaceCourse(selection, { debug: debugEnabled });
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    return { start: () => undefined, restartRemaining: () => undefined, boost: () => false, setPaused: () => undefined, setBirdView: () => undefined, reset: () => undefined, dispose: () => undefined };
  }
  const project = createTrackProjector(course.samples);
  const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
  const quality = createAdaptiveQuality();
  let qualityLevel = 0;
  const debug = createDebugCameraState(debugEnabled);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap) * (performanceOptions.pixelRatioScale ?? 1));
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
  const birdSphere = new THREE.Box3().setFromObject(track).getBoundingSphere(new THREE.Sphere());
  const birdBounds = { center: birdSphere.center, radius: birdSphere.radius };
  const marbleGroup = new THREE.Group();
  const marbleRollTexture = createMarbleRollTexture();
  scene.add(track, marbleGroup);
  let world: RapierWorld | undefined; let raceRun: RaceCourseRun | undefined; let balls: Ball[] = []; let renderMeshes: THREE.InstancedMesh[] = [];
  const liveBalls: Ball[] = [];
  const rankedCameraBalls: Ball[] = [];
  let running = false; let timedOut = false; let last = performance.now(); let fixedAccumulator = 0; let disposed = false;
  let gateOpen = false; let lastTick = 0;
  let manualPaused = false; let birdView = false; let pauseStarted = 0; let pausedDuration = 0; let debugWasPaused = false; let activeShot: CameraShotName = "overview";
  let frameId: number | undefined;
  let controls = initialCameraControls; const pointers = new Map<number, { x: number; y: number }>(); const panPointers = new Set<number>(); let pinchDistance: number | undefined; let lastCameraInputAt = last;
  const dummy = new THREE.Object3D();
  const routeCrowd = createRouteCrowdDirector(course.samples);
  const featureZones = deriveFeatureBroadcastZones(course.samples);
  const actionDirector = createActionCameraDirector(featureZones);
  const routeRuns = deriveRouteRuns(course.samples);
  let pendingAction: CameraAction | undefined;
  let actionShot: ActionCameraSelection = { mode: "crowd", framing: "wide" };
  const signalCameraAction = (kind: CameraAction["kind"]) => {
    const traffic = balls.filter(b => !b.done && !b.eliminated).map(b => ({ id: b.id, distance: alongRouteDistance(b.position, b.sampleIndex, course.samples) }));
    const rear = traffic.reduce<(typeof traffic)[number] | undefined>((a, b) => !a || b.distance < a.distance ? b : a, undefined);
    const distance = kind === "rush" ? rear?.distance : crowdDistance;
    if (distance === undefined) return;
    const exitDistance = routeRuns.find(run => run.end > distance)?.end;
    if (exitDistance === undefined) return;
    pendingAction = { kind, exitDistance, targetIds: kind === "rush" && rear ? [rear.id] : traffic.filter(b => Math.abs(b.distance - distance) <= 12).map(b => b.id) };
  };
  const raceClock = createSceneRaceClock();
  const raceBoost = createRaceBoost();
  const frameRate = createFrameRateCounter();
  const cameraFocus = new THREE.Vector3(); const cameraTarget = new THREE.Vector3(); const cameraUpTarget = new THREE.Vector3(0, 1, 0);
  const cameraShot: CameraShot = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 };
  const controlledCameraShot: CameraShot = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 500 };
  let rushActive = false; let rushOriginalCount = 0; let rushPulseSteps = 0; let crowdDistance = course.samples[0]?.distance ?? 0; let crowdPace: "slow" | "fast" = "slow";
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
  const clearMarbles = () => {
    marbleGroup.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.InstancedMesh;
      if ("material" in renderable) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        if (material instanceof THREE.MeshStandardMaterial) material.map = null;
      }
    });
    disposeTrackRenderGroup(marbleGroup);
  };

  type SceneStartRequest = { marbles: Marble[]; seed: number; remainingRestart?: boolean };
  const bumperContacts = new Set<string>();
  const pinwheelContacts = new Set<string>();
  const resetQualityWindow = () => { quality.sample(0, false); };
  document.addEventListener("visibilitychange", resetQualityWindow);
  const stopRace = () => {
    bumperContacts.clear(); pinwheelContacts.clear();
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
    marbleRollTexture.dispose();
    trackDebug?.dispose();
    if (frameId !== undefined) { cancelAnimationFrame(frameId); frameId = undefined; }
    pointers.forEach((_point, pointerId) => { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); });
    window.removeEventListener("resize", resize); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("contextmenu", onContextMenu); pointers.clear(); panPointers.clear(); pinchDistance = undefined;
    document.removeEventListener("visibilitychange", resetQualityWindow);
    renderer.dispose();
  };

  const begin = (marbles: Marble[], seed: number, remainingRestart = false) => {
    quality.reset();
    bumperContacts.clear(); pinwheelContacts.clear();
    raceRun?.dispose(); raceRun = undefined;
    world?.free(); world = undefined;
    world = createTrackPhysicsWorld();
    course.attach(world);
    raceRun = course.createRun(world, marbles.length, seed, remainingRestart);
    track.visible = true;
    clearMarbles();
    const renderBindings = new Map<number, { mesh: THREE.InstancedMesh; renderIndex: number }>(); renderMeshes = [];
    createColorBatches(marbles).forEach((batch) => {
      const colorMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshStandardMaterial({ color: batch.color, map: marbleRollTexture, roughness: 0.28, metalness: 0.18 }), batch.sourceIndexes.length);
      colorMesh.frustumCulled = false; colorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(colorMesh); renderMeshes.push(colorMesh);
      batch.sourceIndexes.forEach((sourceIndex, renderIndex) => renderBindings.set(sourceIndex, { mesh: colorMesh, renderIndex }));
    });
    const launchPositions = raceRun.launchPositions;
    const bodies = createMarbleBodies(
      world,
      launchPositions,
    );
    balls = marbles.map((marble, index) => ({ id: marble.id, marble, body: bodies[index], done: false, eliminated: false, progress: 0, sampleIndex: 0, position: launchPositions[index], ...renderBindings.get(index)! }));
    liveBalls.length = 0; rankedCameraBalls.length = 0; routeCrowd.reset(); actionDirector.reset(); pendingAction = undefined; actionShot = { mode: "crowd", framing: "wide" }; crowdDistance = course.samples[0]?.distance ?? 0; if (!remainingRestart) rushOriginalCount = marbles.length; rushActive = false; rushPulseSteps = 0; raceClock.reset(); raceBoost.reset(); running = true; timedOut = false; fixedAccumulator = 0; gateOpen = remainingRestart; lastTick = 0; last = performance.now(); pausedDuration = 0; debugWasPaused = debug.isPaused(); pauseStarted = debugWasPaused ? last : 0;
    balls.forEach((ball) => { const rotation = ball.body.rotation(); dummy.position.set(ball.position.x, ball.position.y, ball.position.z); dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w); dummy.scale.setScalar(1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); });
    renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
    emit({ type: "prepared" });
  };

  const updateCamera = (cameraDelta: number) => {
    let localUp = course.samples[0]?.up ?? { x: 0, y: 1, z: 0 };
    let cameraClearance = 5;
    let targetZoom = 1;
    if (birdView) {
      activeShot = "bird"; controls = initialCameraControls;
      localUp = getBirdViewUp(course.samples);
      writeBirdViewFit(cameraShot, birdBounds, camera.fov, camera.aspect);
    } else if (reducedMotion) {
      activeShot = "overview";
      writeCameraShot(cameraShot, activeShot, bounds);
    } else if (debug.isPaused()) {
      activeShot = debug.activeShot();
      writeCameraShot(cameraShot, activeShot, bounds);
    } else {
      const target = rankedCameraBalls.find(b => b.id === actionShot.targetId);
      const sample = target ? course.samples[target.sampleIndex] : course.samples.reduce((nearest, candidate) => Math.abs(candidate.distance - crowdDistance) < Math.abs(nearest.distance - crowdDistance) ? candidate : nearest, course.samples[0]);
      if (sample) {
        const curve = (sample as TrackSample & { kind?: string }).kind === "curve";
        targetZoom = curve ? 1.25 : 1;
        localUp = sample.up;
        cameraClearance = curve ? Math.max(4.5, sample.channelDepth + 0.5) : Math.max(5, sample.channelDepth + 1);
        if (target) {
          activeShot = actionShot.mode === "finale" && sample.zone === "finish" ? "finish" : "trailer";
          writeTrackFollowShot(cameraShot, target.position, course.samples, target.sampleIndex, bounds, cameraClearance);
        } else if (rankedCameraBalls.length || !gateOpen) {
          activeShot = "profile";
          writeRouteCrowdFollowShot(cameraShot, crowdDistance, course.samples, bounds, cameraClearance, actionShot.mode === "boost" ? "fast" : crowdPace, camera.fov, camera.aspect, actionShot.mode === "feature" && actionShot.framing === "close");
        }
        if (curve) {
          cameraShot.position.x -= localUp.x * 0.5;
          cameraShot.position.y -= localUp.y * 0.5;
          cameraShot.position.z -= localUp.z * 0.5;
        }
      } else {
        activeShot = "overview";
        writeCameraShot(cameraShot, activeShot, bounds);
      }
    }
    if (birdView) {
      Object.assign(controlledCameraShot.position, cameraShot.position);
      Object.assign(controlledCameraShot.lookAt, cameraShot.lookAt);
      controlledCameraShot.near = cameraShot.near; controlledCameraShot.far = cameraShot.far;
    } else writeControlledTrackFollowShot(controlledCameraShot, cameraShot, localUp, controls, cameraClearance);
    const nextZoom = camera.zoom + (targetZoom - camera.zoom) * cameraLerpAlpha(0.05, cameraDelta);
    if (Math.abs(nextZoom - camera.zoom) > 0.00001) { camera.zoom = nextZoom; camera.updateProjectionMatrix(); }
    if (camera.near !== controlledCameraShot.near || camera.far !== controlledCameraShot.far) {
      camera.near = controlledCameraShot.near; camera.far = controlledCameraShot.far; camera.updateProjectionMatrix();
    }
    cameraFocus.set(controlledCameraShot.lookAt.x, controlledCameraShot.lookAt.y, controlledCameraShot.lookAt.z);
    cameraTarget.set(controlledCameraShot.position.x, controlledCameraShot.position.y, controlledCameraShot.position.z);
    cameraUpTarget.set(localUp.x, localUp.y, localUp.z);
    const upAlpha = cameraLerpAlpha(0.05, cameraDelta); const positionAlpha = cameraLerpAlpha(crowdPace === "fast" ? 0.09 : 0.03, cameraDelta);
    if (birdView || (cameraUpTarget.x === 0 && cameraUpTarget.y === 1 && cameraUpTarget.z === 0)) camera.up.lerp(cameraUpTarget, upAlpha); else camera.up.lerp(cameraUpTarget, upAlpha).normalize();
    camera.position.lerp(cameraTarget, positionAlpha); cameraLook.lerp(cameraFocus, upAlpha); camera.lookAt(cameraLook);
  };

  const clock = () => performanceOptions.onProfile ? performance.now() : 0;
  const loop = (now: number) => {
    if (disposed) return;
    frameId = requestAnimationFrame(loop);
    let physicsMs = 0; let audioMs = 0; let trackingMs = 0;
    const fps = frameRate.sample(now); const cameraDelta = Math.max(0, now - last); const delta = Math.min(33, cameraDelta); last = now;
    if (now - lastCameraInputAt >= 3_000) controls = relaxControls(controls, reducedMotion ? 1 : delta / 3_000);
    const paused = manualPaused || debug.isPaused();
    const nextQuality = quality.sample(cameraDelta, running && gateOpen && !paused && !document.hidden);
    if (nextQuality !== qualityLevel && performanceOptions.pixelRatioScale === undefined) {
      qualityLevel = nextQuality;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap) * [1, 0.8, 0.65][qualityLevel]);
      resize();
    }
    if (running && paused && !debugWasPaused) pauseStarted = now;
    if (running && !paused && debugWasPaused) pausedDuration += now - pauseStarted;
    debugWasPaused = paused;
    if (running && world && raceRun && renderMeshes.length && !paused) {
      fixedAccumulator += delta;
      while (fixedAccumulator >= 1000 / 60) {
        const physicsStarted = clock();
        const pose = raceRun.stepBeforeWorld();
        world.timestep = 1 / 60;
        world.step();
        const boosterEvents = raceRun.stepAfterWorld(balls.map((ball) => ball.body));
        physicsMs += clock() - physicsStarted;
        const audioStarted = clock();
        for (const event of boosterEvents) {
          const body = balls[event.marbleId - 1]?.body;
          if (body) retroSounds.obstacle("boost", soundProximity(body.translation(), cameraLook));
        }
        for (const hit of collectBumperHits(world, raceRun.bumperColliders ?? [], bumperContacts)) retroSounds.obstacle("bumper", soundProximity(hit, cameraLook));
        for (const hit of collectBumperHits(world, raceRun.pinwheelColliders ?? [], pinwheelContacts)) retroSounds.obstacle("pinwheel", soundProximity(hit, cameraLook, 12));
        for (const hit of raceRun.collectMogulHits?.() ?? []) retroSounds.obstacle("mogul", soundProximity(hit, cameraLook, 12));
        audioMs += clock() - audioStarted;
        const adjudicationStarted = clock();
        raceClock.consumeAfterWorldStep(pose, now, pausedDuration);
        gateOpen = pose.raceClockStarted;
        raceBoost.step({ running, manualPaused, debugPaused: debug.isPaused(), gateOpen, disposed, rushActive });
        balls.forEach((ball) => {
          if (ball.done) return;
          const position = ball.body.translation();
          if (![position.x, position.y, position.z].every(Number.isFinite)) { ball.done = true; ball.eliminated = true; ball.body.setEnabled(false); emit({ type: "dnf", marble: ball.marble, reason: "non-finite" }); return; }
          const raceState = evaluateRaceBody(ball.body, course.samples, project);
          if (!Number.isFinite(raceState.projection.progress) || (distanceSquaredToSample(position, course.samples[raceState.projection.sampleIndex]) > 15 ** 2 && distanceSquaredToTrackSegments(position, course.samples) > 15 ** 2)) { ball.done = true; ball.eliminated = true; ball.body.setEnabled(false); emit({ type: "dnf", marble: ball.marble, reason: "escape" }); return; }
          ball.progress = raceState.projection.progress; ball.sampleIndex = raceState.projection.sampleIndex; ball.position = raceState.position;
          if (raceState.finished) { ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble }); }
        });
        if (!rushActive && gateOpen) {
          const rushBalls = balls.filter((ball) => !ball.done && !ball.eliminated);
          if (shouldStartRaceRush(rushBalls.length, rushOriginalCount)) {
            rushActive = true; signalCameraAction("rush");
            emit({ type: "rush" });
          }
        }
        if (rushActive) {
          if (++rushPulseSteps >= 60) { rushPulseSteps = 0; applyRaceRushPulse(balls, course.samples); }
        }
        physicsMs += clock() - adjudicationStarted;
        fixedAccumulator -= 1000 / 60;
        if (!balls.some((ball) => !ball.done)) break;
      }
      const elapsedMs = raceClock.elapsedMs(now, pausedDuration, pauseStarted, false);
      balls.forEach((ball) => { const rotation = ball.body.rotation(); dummy.position.set(ball.position.x, ball.position.y, ball.position.z); dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); });
      renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
      liveBalls.length = 0;
      balls.forEach((ball) => { if (!ball.done) liveBalls.push(ball); });
      const trackingStarted = clock();
      refreshCameraRankView(liveBalls, rankedCameraBalls);
      const cameraTraffic = balls.map(ball => ({ id: ball.id, distance: alongRouteDistance(ball.position, ball.sampleIndex, course.samples), sampleIndex: ball.sampleIndex, done: ball.done, eliminated: ball.eliminated }));
      const crowdState = routeCrowd.update(cameraTraffic, balls.length);
      crowdDistance = crowdState.distance; crowdPace = crowdState.pace;
      actionShot = actionDirector.update({ traffic: cameraTraffic, crowd: crowdState, originalCount: rushOriginalCount, activeMs: elapsedMs, enabled: !birdView && !reducedMotion && !debug.isPaused() && pointers.size === 0 && now - lastCameraInputAt >= 3_000, action: pendingAction });
      pendingAction = undefined;
      const leader = rankedCameraBalls[0]; const trailer = rankedCameraBalls[rankedCameraBalls.length - 1];
      const eliminatedCount = balls.reduce((count, ball) => count + Number(ball.eliminated), 0);
      const finishedCount = balls.reduce((count, ball) => count + Number(ball.done && !ball.eliminated), 0);
      updateCamera(cameraDelta);
      if (shouldEmitSceneTick(now, lastTick, elapsedMs, liveBalls.length)) {
        lastTick = now;
        emit({ type: "tick", elapsedMs, fps, finishedCount, eliminatedCount, remaining: liveBalls.map((ball) => ball.marble), standings: createLiveStandings(balls, course.samples), boostRemainingMs: raceBoost.remainingMs(), leader: leader?.marble, trailer: trailer?.marble });
      }
      trackingMs += clock() - trackingStarted;
      if (elapsedMs >= RACE_TIMEOUT_MS && !timedOut && liveBalls.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: liveBalls.map((ball) => ball.marble) }); }
      if (!liveBalls.length) running = false;
    }
    if (paused) updateCamera(cameraDelta);
    const renderStarted = clock();
    renderer.render(scene, camera);
    if (running && !paused && !document.hidden) performanceOptions.onProfile?.({ frameMs: cameraDelta, physicsMs, audioMs, trackingMs, renderMs: clock() - renderStarted });
    if (trackDebug) trackDebug.update({
      fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
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
    boost: () => {
      const changed = raceBoost.activate({ running, manualPaused, debugPaused: debug.isPaused(), gateOpen, disposed, rushActive }, balls, course.samples);
      if (changed) signalCameraAction("boost");
      return changed;
    },
    setPaused: (paused) => { manualPaused = paused; if (paused) retroSounds.stop(); },
    setBirdView: (enabled) => { birdView = enabled; if (enabled) controls = initialCameraControls; },
    reset: () => { starts?.reset(); routeCrowd.reset(); actionDirector.reset(); pendingAction = undefined; actionShot = { mode: "crowd", framing: "wide" }; raceClock.reset(); stopRace(); },
    dispose: teardown,
  };
}
