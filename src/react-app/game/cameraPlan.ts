import type { TrackSample, Vec3 } from "./track/trackTypes";

export type CameraShotName = "overview" | "bird" | "side" | "profile" | "leader" | "trailer" | "finish";
export type TrackBounds = Readonly<{ center: Vec3; radius: number }>;
export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; near: number; far: number };
export type RaceFocusTarget = Readonly<{ id: string | number; progress: number }>;
export type RaceFocusDirector = Readonly<{ select: <Target extends RaceFocusTarget>(live: readonly Target[], leaderProgress: number, nowMs: number) => Target | undefined; reset: () => void }>;
export type CameraControlOffsets = Readonly<{ yaw: number; pitch: number; zoom: number; panX?: number; panY?: number }>;

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

export const getBirdViewUp = (samples: readonly TrackSample[]): Vec3 => {
  const start = samples[0]?.position;
  const finish = samples[samples.length - 1]?.position;
  if (start === undefined || finish === undefined) return { x: 0, y: 0, z: -1 };
  const length = Math.hypot(start.x - finish.x, start.z - finish.z);
  return length > 1e-9
    ? { x: (start.x - finish.x) / length, y: 0, z: (start.z - finish.z) / length }
    : { x: 0, y: 0, z: -1 };
};

const focusFor = (bounds: TrackBounds, focus?: Vec3): Vec3 =>
  focus && Number.isFinite(focus.x) && Number.isFinite(focus.y) && Number.isFinite(focus.z) ? focus : bounds.center;

const finiteVector = (value: Vec3 | undefined): value is Vec3 =>
  Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);

const writeClip = (target: CameraShot, bounds: TrackBounds): void => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds : fallbackBounds;
  target.near = Math.max(0.05, safeBounds.radius * 0.012);
  target.far = safeBounds.radius * 4.5 + 20;
};

export const writeBirdViewFit = (target: CameraShot, bounds: TrackBounds, verticalFovDegrees: number, aspect: number): CameraShot => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 && finiteVector(bounds.center) ? bounds : fallbackBounds;
  const fov = Math.min(179, Math.max(1, Number.isFinite(verticalFovDegrees) ? verticalFovDegrees : 60));
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfVertical = fov * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * safeAspect);
  const distance = 1.06 * safeBounds.radius / Math.sin(Math.min(halfVertical, halfHorizontal));
  target.lookAt.x = safeBounds.center.x; target.lookAt.y = safeBounds.center.y; target.lookAt.z = safeBounds.center.z;
  target.position.x = safeBounds.center.x; target.position.y = safeBounds.center.y + distance; target.position.z = safeBounds.center.z + 0.001;
  writeClip(target, safeBounds);
  target.far = Math.max(target.far, Math.hypot(target.position.x - safeBounds.center.x, target.position.y - safeBounds.center.y, target.position.z - safeBounds.center.z) + safeBounds.radius * 2);
  return target;
};

const offsets: Readonly<Record<CameraShotName, Readonly<Vec3>>> = Object.freeze({
  overview: { x: 0.88, y: 1.42, z: 1.16 }, bird: { x: 0, y: 2.2, z: 0.001 }, side: { x: 1.72, y: 0.56, z: 0.16 }, profile: { x: 0.22, y: 0.44, z: 1.8 },
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
  writeClip(target, safeBounds);
  return target;
};

export const getCameraShot = (name: CameraShotName, bounds: TrackBounds, focus?: Vec3): CameraShot =>
  writeCameraShot({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, near: 0.1, far: 10 }, name, bounds, focus);

const focusPhase = (leaderProgress: number): "leader" | "middle" | "trailer" =>
  leaderProgress < 0.5 ? "leader" : leaderProgress < 0.75 ? "middle" : "trailer";

export const selectFocusRank = (leaderProgress: number, liveCount: number): number => {
  const finalRank = Math.max(0, liveCount - 1);
  if (leaderProgress < 0.5) return 0;
  if (leaderProgress >= 0.75) return finalRank;
  return Math.round(finalRank * Math.max(0, Math.min(1, (leaderProgress - 0.5) / 0.25)));
};

export const createRaceFocusDirector = (): RaceFocusDirector => {
  let selectedId: string | number | undefined;
  let selectedAt = Number.NEGATIVE_INFINITY;
  let finalTrailerId: string | number | undefined;

  const selectById = <Target extends RaceFocusTarget>(live: readonly Target[], id: string | number | undefined): Target | undefined => {
    if (id === undefined) return undefined;
    for (let index = 0; index < live.length; index += 1) {
      if (live[index].id === id) return live[index];
    }
    return undefined;
  };

  return Object.freeze({
    select: <Target extends RaceFocusTarget>(live: readonly Target[], leaderProgress: number, nowMs: number): Target | undefined => {
      if (!live.length) return undefined;
      const finalTrailer = selectById(live, finalTrailerId);
      if (finalTrailer) return finalTrailer;
      if (finalTrailerId !== undefined) {
        const next = live[live.length - 1];
        finalTrailerId = next.id;
        selectedId = next.id;
        selectedAt = nowMs;
        return next;
      }
      const phase = focusPhase(leaderProgress);
      const selected = selectById(live, selectedId);
      if (phase === "trailer") {
        if (selected && nowMs - selectedAt < 1_800) return selected;
        const next = live[live.length - 1];
        finalTrailerId = next.id;
        selectedId = next.id;
        selectedAt = nowMs;
        return next;
      }

      if (selected && nowMs - selectedAt < 1_800) return selected;
      const desiredRank = selectFocusRank(leaderProgress, live.length);
      if (phase === "middle" && selected) {
        let selectedRank = -1;
        for (let index = 0; index < live.length; index += 1) {
          if (live[index].id === selected.id) { selectedRank = index; break; }
        }
        if (selectedRank >= 0 && Math.abs(selectedRank - desiredRank) <= 2) return selected;
      }
      const next = live[desiredRank];
      selectedId = next.id;
      selectedAt = nowMs;
      return next;
    },
    reset: () => { selectedId = undefined; selectedAt = Number.NEGATIVE_INFINITY; finalTrailerId = undefined; },
  });
};

const cameraAnchor = (samples: readonly TrackSample[], sampleIndex: number, behind = 6): TrackSample | undefined => {
  const focusIndex = Math.max(0, Math.min(samples.length - 1, sampleIndex));
  const focus = samples[focusIndex] ?? samples[0];
  if (!focus) return undefined;
  const targetDistance = focus.distance - behind;
  let index = focusIndex;
  while (index > 0 && samples[index]!.distance > targetDistance) index -= 1;
  return samples[index] ?? focus;
};

export const enforceCameraClearance = (target: CameraShot, up: Vec3, minimum = 5, reference: Vec3 = target.lookAt): CameraShot => {
  const surface = finiteVector(reference) ? reference : target.lookAt;
  const height = (target.position.x - surface.x) * up.x + (target.position.y - surface.y) * up.y + (target.position.z - surface.z) * up.z;
  if (height < minimum) {
    const correction = minimum - height + 1e-9;
    target.position.x += up.x * correction; target.position.y += up.y * correction; target.position.z += up.z * correction;
  }
  return target;
};

export const writeTrackFollowShot = (target: CameraShot, marblePosition: Vec3, samples: readonly TrackSample[], sampleIndex: number, bounds: TrackBounds, minimumClearance = 5): CameraShot => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds : fallbackBounds;
  const focus = finiteVector(marblePosition) ? marblePosition : safeBounds.center;
  const frame = samples[Math.max(0, Math.min(samples.length - 1, sampleIndex))] ?? samples[0];
  const up = finiteVector(frame?.up) ? frame.up : { x: 0, y: 1, z: 0 };
  const anchor = cameraAnchor(samples, sampleIndex);
  const anchorPosition = finiteVector(anchor?.position) ? anchor.position : focus;
  const anchorUp = finiteVector(anchor?.up) ? anchor.up : up;
  target.position.x = anchorPosition.x + anchorUp.x * minimumClearance;
  target.position.y = anchorPosition.y + anchorUp.y * minimumClearance;
  target.position.z = anchorPosition.z + anchorUp.z * minimumClearance;
  target.lookAt.x = focus.x + up.x * 0.45;
  target.lookAt.y = focus.y + up.y * 0.45;
  target.lookAt.z = focus.z + up.z * 0.45;
  writeClip(target, safeBounds);
  return enforceCameraClearance(target, up, minimumClearance);
};

export const writeControlledTrackFollowShot = (target: CameraShot, directed: CameraShot, localUp: Vec3, controls: CameraControlOffsets, minimumClearance = 5): CameraShot => {
  const up = finiteVector(localUp) ? localUp : { x: 0, y: 1, z: 0 };
  const yaw = Number.isFinite(controls.yaw) ? controls.yaw : 0;
  const pitch = Number.isFinite(controls.pitch) ? controls.pitch : 0;
  const zoom = Number.isFinite(controls.zoom) ? controls.zoom : 1;
  const panX = typeof controls.panX === "number" && Number.isFinite(controls.panX) ? controls.panX : 0;
  const panY = typeof controls.panY === "number" && Number.isFinite(controls.panY) ? controls.panY : 0;
  const offsetX = directed.position.x - directed.lookAt.x;
  const offsetY = directed.position.y - directed.lookAt.y;
  const offsetZ = directed.position.z - directed.lookAt.z;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const projection = offsetX * up.x + offsetY * up.y + offsetZ * up.z;
  const crossX = up.y * offsetZ - up.z * offsetY;
  const crossY = up.z * offsetX - up.x * offsetZ;
  const crossZ = up.x * offsetY - up.y * offsetX;
  const rightLength = Math.hypot(crossX, crossY, crossZ) || 1;
  const rightX = crossX / rightLength;
  const rightY = crossY / rightLength;
  const rightZ = crossZ / rightLength;
  target.lookAt.x = directed.lookAt.x + rightX * panX + up.x * panY;
  target.lookAt.y = directed.lookAt.y + rightY * panX + up.y * panY;
  target.lookAt.z = directed.lookAt.z + rightZ * panX + up.z * panY;
  target.position.x = target.lookAt.x + (offsetX * cosine + crossX * sine + up.x * projection * (1 - cosine)) * zoom + up.x * pitch * 25;
  target.position.y = target.lookAt.y + (offsetY * cosine + crossY * sine + up.y * projection * (1 - cosine)) * zoom + up.y * pitch * 25;
  target.position.z = target.lookAt.z + (offsetZ * cosine + crossZ * sine + up.z * projection * (1 - cosine)) * zoom + up.z * pitch * 25;
  target.near = directed.near;
  target.far = directed.far;
  return enforceCameraClearance(target, up, minimumClearance, directed.lookAt);
};

export const hasCameraClipChanged = (previous: Pick<CameraShot, "near" | "far">, next: Pick<CameraShot, "near" | "far">): boolean =>
  previous.near !== next.near || previous.far !== next.far;
