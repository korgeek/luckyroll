import type { TrackSample, Vec3 } from "./track/trackTypes";

export type CameraShotName = "overview" | "side" | "profile" | "leader" | "trailer" | "finish";
export type TrackBounds = Readonly<{ center: Vec3; radius: number }>;
export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; near: number; far: number };
export type RaceCameraDirector = Readonly<{ select: (elapsedMs: number, leadingProgress: number) => CameraShotName; reset: () => void }>;

const fallbackBounds: TrackBounds = Object.freeze({ center: Object.freeze({ x: 0, y: 0, z: 0 }), radius: 1 });

const finitePosition = (sample: TrackSample): sample is TrackSample & { position: { x: number; y: number; z: number } } =>
  Number.isFinite(sample?.position?.x) && Number.isFinite(sample?.position?.y) && Number.isFinite(sample?.position?.z);

export const getTrackBounds = (samples: readonly TrackSample[]): TrackBounds => {
  const points = samples.filter(finitePosition);
  if (points.length === 0) return fallbackBounds;
  const minimum = { x: points[0].position.x, y: points[0].position.y, z: points[0].position.z };
  const maximum = { ...minimum };
  points.forEach(({ position }) => {
    minimum.x = Math.min(minimum.x, position.x); minimum.y = Math.min(minimum.y, position.y); minimum.z = Math.min(minimum.z, position.z);
    maximum.x = Math.max(maximum.x, position.x); maximum.y = Math.max(maximum.y, position.y); maximum.z = Math.max(maximum.z, position.z);
  });
  const center = Object.freeze({ x: (minimum.x + maximum.x) / 2, y: (minimum.y + maximum.y) / 2, z: (minimum.z + maximum.z) / 2 });
  const radius = Math.max(1, ...points.map(({ position }) => Math.hypot(position.x - center.x, position.y - center.y, position.z - center.z)));
  return Object.freeze({ center, radius });
};

const focusFor = (bounds: TrackBounds, focus?: Vec3): Vec3 =>
  focus && Number.isFinite(focus.x) && Number.isFinite(focus.y) && Number.isFinite(focus.z) ? focus : bounds.center;

const offsets: Readonly<Record<CameraShotName, Readonly<Vec3>>> = Object.freeze({
  overview: { x: 0.88, y: 1.42, z: 1.16 }, side: { x: 1.72, y: 0.56, z: 0.16 }, profile: { x: 0.22, y: 0.44, z: 1.8 },
  leader: { x: 0.76, y: 0.56, z: 0.92 }, trailer: { x: -0.76, y: 0.5, z: 0.92 }, finish: { x: -0.68, y: 0.7, z: 1.08 },
});

export const writeCameraShot = (target: CameraShot, name: CameraShotName, bounds: TrackBounds, focus?: Vec3): CameraShot => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds : fallbackBounds;
  const lookAt = focusFor(safeBounds, focus);
  const offset = offsets[name];
  target.lookAt.x = lookAt.x; target.lookAt.y = lookAt.y; target.lookAt.z = lookAt.z;
  target.position.x = lookAt.x + offset.x * safeBounds.radius;
  target.position.y = lookAt.y + offset.y * safeBounds.radius;
  target.position.z = lookAt.z + offset.z * safeBounds.radius;
  target.near = Math.max(0.05, safeBounds.radius * 0.012);
  target.far = safeBounds.radius * 4.5 + 20;
  return target;
};

export const getCameraShot = (name: CameraShotName, bounds: TrackBounds, focus?: Vec3): CameraShot =>
  writeCameraShot({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 10 }, name, bounds, focus);

export const selectProductionCameraShot = (elapsedMs: number, leadingProgress: number): CameraShotName => {
  if (leadingProgress >= 0.85) return "finish";
  const cycle = Math.floor(Math.max(0, elapsedMs) / 6_000) % 3;
  return cycle === 0 ? "overview" : cycle === 1 ? "leader" : "trailer";
};

export const createRaceCameraDirector = (): RaceCameraDirector => {
  let finishLatched = false;
  return Object.freeze({
    select: (elapsedMs: number, leadingProgress: number) => {
      finishLatched ||= leadingProgress >= 0.85;
      return finishLatched ? "finish" : selectProductionCameraShot(elapsedMs, leadingProgress);
    },
    reset: () => { finishLatched = false; },
  });
};

export const hasCameraClipChanged = (previous: Pick<CameraShot, "near" | "far">, next: Pick<CameraShot, "near" | "far">): boolean =>
  previous.near !== next.near || previous.far !== next.far;
