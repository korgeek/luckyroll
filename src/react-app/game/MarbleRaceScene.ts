import type RAPIER_TYPE from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Marble } from "../domain/types";
import { applyDrag, applyZoom, initialCameraControls } from "./cameraControls";
import { getCameraShot } from "./cameraPlan";
import { createColorBatches } from "./marbleBatches";
import { selectQualityProfile } from "./quality";
import { RACE_TIMEOUT_MS } from "./raceTiming";
import { buildValidatedTrack, type BuiltTrack } from "./track/trackBuild";
import { createMarbleBodies, createTrackCollider, insideFinishVolume, launchPositionsFor } from "./track/trackPhysics";
import { createTrackRenderGroup, disposeTrackRenderGroup } from "./track/trackRender";
import { projectToTrack } from "./track/trackSampler";
import { createLaunchSlots } from "./track/trackSpec";
import type { TrackSample, Vec3 } from "./track/trackTypes";

export type SceneEvent =
  | { type: "tick"; elapsedMs: number; finishedCount: number; remaining: Marble[]; leader?: Marble; trailer?: Marble }
  | { type: "finish"; marble: Marble }
  | { type: "timeout"; remaining: Marble[] };
export type RaceScene = { start: (marbles: Marble[], seed: number) => void; restartRemaining: (marbles: Marble[]) => void; reset: () => void; dispose: () => void };
type Ball = { marble: Marble; body: any; done: boolean; progress: number; mesh: THREE.InstancedMesh; renderIndex: number };
type TranslatingBody = Readonly<{ translation: () => Vec3 }>;

const GRAVITY = { x: 0, y: -16, z: 0 };
const FINISH_PROGRESS = 0.995;

export type SceneTrackResources = Readonly<{ built: BuiltTrack; renderGroup: THREE.Group }>;
type SceneTrackColliderCreator = (world: any, geometry: BuiltTrack["geometry"]) => unknown;

export const createSceneTrackResources = (): SceneTrackResources => {
  const built = buildValidatedTrack();
  return Object.freeze({ built, renderGroup: createTrackRenderGroup(built.geometry, { debug: false }) });
};

export const attachSceneTrackCollider = (
  world: any,
  resources: SceneTrackResources,
  createCollider: SceneTrackColliderCreator = createTrackCollider,
): unknown => createCollider(world, resources.built.geometry);

export const projectRaceBody = (body: TranslatingBody, samples: readonly TrackSample[]) =>
  projectToTrack(body.translation(), samples);

export const hasFinishedTrack = (position: Vec3, samples: readonly TrackSample[]): boolean => {
  const projection = projectToTrack(position, samples);
  return projection.progress >= FINISH_PROGRESS && insideFinishVolume(position, samples[samples.length - 1]);
};

export function createRaceScene(canvas: HTMLCanvasElement, emit: (event: SceneEvent) => void): RaceScene {
  const profile = selectQualityProfile({ width: window.innerWidth, devicePixelRatio: window.devicePixelRatio });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
  renderer.shadowMap.enabled = profile.shadows;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05071a");
  scene.fog = new THREE.Fog("#05071a", 115, 280);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
  const cameraLook = new THREE.Vector3(0, 10, 4);
  camera.position.set(24, 58, 105); camera.lookAt(cameraLook);
  scene.add(new THREE.AmbientLight("#bcdcff", 3.7));
  scene.add(new THREE.HemisphereLight("#e8fcff", "#260a39", 3.6));
  const key = new THREE.DirectionalLight("#ffffff", 3.5); key.position.set(12, 42, 36); scene.add(key);
  const cyan = new THREE.PointLight("#3df5ff", 120, 105, 1.7); cyan.position.set(0, 27, 38); scene.add(cyan);
  const pink = new THREE.PointLight("#ff4f9a", 100, 95, 1.6); pink.position.set(-9, 18, -21); scene.add(pink);
  const gold = new THREE.PointLight("#ffcb54", 92, 80, 1.5); gold.position.set(4, 8, -58); scene.add(gold);
  const sceneTrack = createSceneTrackResources();
  const track = sceneTrack.renderGroup;
  const marbleGroup = new THREE.Group();
  scene.add(track, marbleGroup);
  let rapier: typeof RAPIER_TYPE; let world: any; let balls: Ball[] = []; let renderMeshes: THREE.InstancedMesh[] = [];
  let running = false; let timedOut = false; let startedAt = 0; let last = performance.now(); let disposed = false;
  let requested: { marbles: Marble[]; seed: number } | undefined;
  let controls = initialCameraControls; let activePointer: number | undefined; let pointerX = 0; let pointerY = 0;
  const dummy = new THREE.Object3D();
  const resize = () => { const width = canvas.clientWidth || window.innerWidth; const height = canvas.clientHeight || window.innerHeight; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  window.addEventListener("resize", resize); canvas.style.touchAction = "none"; resize();
  const onPointerDown = (event: PointerEvent) => { activePointer = event.pointerId; pointerX = event.clientX; pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; controls = applyDrag(controls, event.clientX - pointerX, event.clientY - pointerY); pointerX = event.clientX; pointerY = event.clientY; };
  const onPointerUp = (event: PointerEvent) => { if (event.pointerId !== activePointer) return; activePointer = undefined; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  const onWheel = (event: WheelEvent) => { event.preventDefault(); controls = applyZoom(controls, event.deltaY); };
  canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp); canvas.addEventListener("wheel", onWheel, { passive: false });
  const clearMarbles = () => disposeTrackRenderGroup(marbleGroup);
  const createWorld = () => new rapier.World(GRAVITY);

  const begin = (marbles: Marble[], seed: number) => {
    if (!world) return;
    world.free();
    world = createWorld();
    attachSceneTrackCollider(world, sceneTrack);
    track.visible = true;
    clearMarbles();
    const renderBindings = new Map<number, { mesh: THREE.InstancedMesh; renderIndex: number }>(); renderMeshes = [];
    createColorBatches(marbles).forEach((batch) => {
      const colorMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshBasicMaterial({ color: batch.color, fog: false, toneMapped: false }), batch.sourceIndexes.length);
      colorMesh.frustumCulled = false; colorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); marbleGroup.add(colorMesh); renderMeshes.push(colorMesh);
      batch.sourceIndexes.forEach((sourceIndex, renderIndex) => renderBindings.set(sourceIndex, { mesh: colorMesh, renderIndex }));
    });
    const bodies = createMarbleBodies(
      world,
      launchPositionsFor(createLaunchSlots(marbles.length), sceneTrack.built.geometry, seed),
    );
    balls = marbles.map((marble, index) => ({ marble, body: bodies[index], done: false, progress: 0, ...renderBindings.get(index)! }));
    running = true; timedOut = false; startedAt = performance.now(); camera.position.set(50, 72, 125); cameraLook.set(0, 12, 18);
  };

  const updateCamera = (elapsedMs: number) => {
    const shot = getCameraShot(Math.min(1, elapsedMs / RACE_TIMEOUT_MS)); const focus = new THREE.Vector3(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z);
    const offset = new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z).sub(focus).applyAxisAngle(new THREE.Vector3(0, 1, 0), controls.yaw).multiplyScalar(controls.zoom); offset.y += controls.pitch * 25;
    camera.position.lerp(focus.add(offset), 0.042); cameraLook.lerp(new THREE.Vector3(shot.lookAt.x, shot.lookAt.y, shot.lookAt.z), 0.05); camera.lookAt(cameraLook);
  };

  const loop = (now: number) => {
    if (disposed) return;
    requestAnimationFrame(loop);
    const delta = Math.min(33, now - last); last = now;
    if (running && world && renderMeshes.length) {
      world.timestep = delta / 1000; world.step(); const active = balls.filter((ball) => !ball.done); const elapsedMs = now - startedAt;
      active.forEach((ball) => {
        const position = ball.body.translation();
        ball.progress = projectRaceBody(ball.body, sceneTrack.built.samples).progress;
        if (hasFinishedTrack(position, sceneTrack.built.samples)) {
          ball.done = true; ball.body.setEnabled(false); emit({ type: "finish", marble: ball.marble });
        }
      });
      balls.forEach((ball) => { const position = ball.body.translation(); dummy.position.set(position.x, position.y, position.z); dummy.scale.setScalar(ball.done ? 0 : 1); dummy.updateMatrix(); ball.mesh.setMatrixAt(ball.renderIndex, dummy.matrix); });
      renderMeshes.forEach((renderMesh) => { renderMesh.instanceMatrix.needsUpdate = true; });
      const live = balls.filter((ball) => !ball.done); const leader = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress > best.progress ? ball : best, undefined); const trailer = live.reduce<Ball | undefined>((best, ball) => !best || ball.progress < best.progress ? ball : best, undefined);
      updateCamera(elapsedMs); emit({ type: "tick", elapsedMs, finishedCount: balls.length - live.length, remaining: live.map((ball) => ball.marble), leader: leader?.marble, trailer: trailer?.marble });
      if (elapsedMs >= RACE_TIMEOUT_MS && !timedOut && live.length) { timedOut = true; running = false; emit({ type: "timeout", remaining: live.map((ball) => ball.marble) }); }
      if (!live.length) running = false;
    }
    renderer.render(scene, camera);
  };

  void import("@dimforge/rapier3d-compat").then(({ default: loaded }) => loaded.init().then(() => { rapier = loaded; if (disposed) return; world = createWorld(); if (requested) { begin(requested.marbles, requested.seed); requested = undefined; } }));
  requestAnimationFrame(loop);
  return {
    start: (marbles, seed) => world ? begin(marbles, seed) : (requested = { marbles, seed }),
    restartRemaining: (marbles) => begin(marbles, Date.now()),
    reset: () => { running = false; balls = []; renderMeshes = []; clearMarbles(); track.visible = false; },
    dispose: () => {
      disposed = true; running = false; world?.free(); disposeTrackRenderGroup(track); clearMarbles(); renderer.dispose();
      window.removeEventListener("resize", resize); canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel);
    },
  };
}
