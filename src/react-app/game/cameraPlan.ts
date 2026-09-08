import type { TrackSample, Vec3 } from "./track/trackTypes";

export type CameraShotName = "overview" | "bird" | "side" | "profile" | "leader" | "trailer" | "finish";
export type TrackBounds = Readonly<{ center: Vec3; radius: number }>;
export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; near: number; far: number };
export type RaceFocusTarget = Readonly<{ id: string | number; progress: number }>;
export type RaceFocusDirector = Readonly<{ select: <Target extends RaceFocusTarget>(live: readonly Target[], leaderProgress: number, nowMs: number) => Target | undefined; reset: () => void }>;
export type CameraControlOffsets = Readonly<{ yaw: number; pitch: number; zoom: number; panX?: number; panY?: number }>;
export type FeatureBroadcastZone = Readonly<{ key: string; kind: "bumper" | "pinwheel"; entryDistance: number; exitDistance: number; center: Vec3; tangent: Vec3; side: Vec3; up: Vec3; length: number; width: number; height: number }>;
export type FeatureTraffic = Readonly<{ id: string | number; distance: number; eliminated: boolean }>;
export type FeatureBroadcastState = Readonly<{ phase: "establishing" | "approach" | "returning-top"; passFraction: number; activationElapsedMs: number }>;

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

const normalized = (value: Vec3, fallback: Vec3): Vec3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-9 ? { x: value.x / length, y: value.y / length, z: value.z / length } : fallback;
};

export const alongRouteDistance = (position: Vec3, sampleIndex: number, samples: readonly Pick<TrackSample, "distance" | "position">[]): number => {
  const candidates = [[sampleIndex - 1, sampleIndex], [sampleIndex, sampleIndex + 1]];
  let best = samples[Math.max(0, Math.min(samples.length - 1, sampleIndex))]?.distance ?? 0;
  let error = Number.POSITIVE_INFINITY;
  for (const [leftIndex, rightIndex] of candidates) {
    const left = samples[leftIndex]; const right = samples[rightIndex];
    if (!left || !right) continue;
    const x = right.position.x - left.position.x; const y = right.position.y - left.position.y; const z = right.position.z - left.position.z;
    const lengthSquared = x * x + y * y + z * z; if (!lengthSquared) continue;
    const t = Math.max(0, Math.min(1, ((position.x - left.position.x) * x + (position.y - left.position.y) * y + (position.z - left.position.z) * z) / lengthSquared));
    const px = left.position.x + x * t; const py = left.position.y + y * t; const pz = left.position.z + z * t;
    const nextError = (position.x - px) ** 2 + (position.y - py) ** 2 + (position.z - pz) ** 2;
    if (nextError < error) { error = nextError; best = left.distance + (right.distance - left.distance) * t; }
  }
  return best;
};

const frameAtDistance = (samples: readonly TrackSample[], distance: number): Pick<TrackSample, "position" | "tangent" | "side" | "up"> | undefined => {
  const first = samples[0]; const last = samples[samples.length - 1];
  if (!first || !last) return undefined;
  if (distance <= first.distance) return first;
  if (distance >= last.distance) return last;
  let rightIndex = 1;
  while (rightIndex < samples.length && samples[rightIndex]!.distance < distance) rightIndex += 1;
  const left = samples[rightIndex - 1]!; const right = samples[rightIndex]!;
  const span = right.distance - left.distance;
  const t = span > 1e-9 ? (distance - left.distance) / span : 0;
  const mix = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  return { position: mix(left.position, right.position), tangent: normalized(mix(left.tangent, right.tangent), left.tangent), side: normalized(mix(left.side, right.side), left.side), up: normalized(mix(left.up, right.up), left.up) };
};

export const deriveFeatureBroadcastZones = (samples: readonly TrackSample[]): FeatureBroadcastZone[] => {
  type FeatureSample = TrackSample & { kind?: string; cellIndex?: number; localU?: number };
  const groups = new Map<string, FeatureSample[]>();
  for (const sample of samples as readonly FeatureSample[]) {
    if ((sample.kind !== "bumper" && sample.kind !== "pinwheel") || !Number.isInteger(sample.cellIndex) || !Number.isFinite(sample.localU)) continue;
    const key = `${sample.kind}:${sample.cellIndex}`;
    const group = groups.get(key); if (group) group.push(sample); else groups.set(key, [sample]);
  }
  const zones: FeatureBroadcastZone[] = [];
  groups.forEach((group, key) => {
    group.sort((left, right) => left.localU! - right.localU!);
    const first = group[0]; const last = group[group.length - 1];
    if (!first || !last || first.localU === last.localU) return;
    const slope = (last.distance - first.distance) / (last.localU! - first.localU!);
    if (!Number.isFinite(slope) || slope <= 0) return;
    const entryDistance = first.distance - first.localU! * slope;
    const exitDistance = last.distance + (1 - last.localU!) * slope;
    const frame = frameAtDistance(group, (entryDistance + exitDistance) / 2);
    if (!frame) return;
    const height = Math.max(1, ...group.map((sample) => sample.channelDepth));
    const center = { x: frame.position.x + frame.up.x * height / 2, y: frame.position.y + frame.up.y * height / 2, z: frame.position.z + frame.up.z * height / 2 };
    zones.push(Object.freeze({ key, kind: first.kind as "bumper" | "pinwheel", entryDistance, exitDistance, center: Object.freeze(center), tangent: Object.freeze(frame.tangent), side: Object.freeze(frame.side), up: Object.freeze(frame.up), length: exitDistance - entryDistance, width: Math.max(...group.map((sample) => sample.width)), height }));
  });
  return zones.sort((left, right) => left.entryDistance - right.entryDistance);
};

export const createFeatureBroadcastDirector = (zones: readonly FeatureBroadcastZone[]) => {
  const completed = new Set<string>(); const passed = new Set<string | number>(); let active: FeatureBroadcastZone | undefined; let startingCount = 0; let activationElapsedMs = 0; let returningTop = false;
  return Object.freeze({
    update: (traffic: readonly FeatureTraffic[], deltaMs = 0): FeatureBroadcastZone | undefined => {
      if (!active) {
        active = zones.find((zone) => !completed.has(zone.key) && traffic.some((marble) => !marble.eliminated && marble.distance >= zone.entryDistance));
        if (active) { startingCount = Math.max(1, traffic.length); activationElapsedMs = 0; returningTop = false; }
      } else activationElapsedMs += Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);
      if (!active) return undefined;
      for (const marble of traffic) if (!marble.eliminated && marble.distance > active.exitDistance) passed.add(marble.id);
      const pending = traffic.some((marble) => !marble.eliminated && marble.distance <= active!.exitDistance);
      if (passed.size / startingCount >= 0.5) returningTop = true;
      if ((active.kind === "pinwheel" ? passed.size > startingCount * 0.8 || !pending : !pending)) { completed.add(active.key); active = undefined; passed.clear(); }
      return active;
    },
    getFeatureBroadcastState: (): FeatureBroadcastState | undefined => active && Object.freeze({ phase: returningTop ? "returning-top" : activationElapsedMs < 1_200 ? "establishing" : "approach", passFraction: passed.size / startingCount, activationElapsedMs }),
    reset: () => { completed.clear(); passed.clear(); active = undefined; startingCount = 0; activationElapsedMs = 0; returningTop = false; },
  });
};

export const shouldPresentFeatureBroadcast = (state: Readonly<{ birdView: boolean; reducedMotion: boolean; debugPaused: boolean; recentManualInput: boolean }>): boolean =>
  !state.birdView && !state.reducedMotion && !state.debugPaused && !state.recentManualInput;

export const cameraLerpAlpha = (perFrameAlpha: number, deltaMs: number): number =>
  1 - Math.pow(1 - Math.max(0, Math.min(1, perFrameAlpha)), Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0) / (1000 / 60));

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

export const writeFeatureBroadcastShot = (target: CameraShot, zone: FeatureBroadcastZone, verticalFovDegrees: number, aspect: number, elapsedMs: number, currentCameraPosition?: Vec3, broadcast?: FeatureBroadcastState): CameraShot => {
  const fov = Math.min(179, Math.max(1, Number.isFinite(verticalFovDegrees) ? verticalFovDegrees : 60));
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfVertical = fov * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * safeAspect);
  const radius = Math.max(1, Math.hypot(zone.length / 2, zone.width / 2, zone.height / 2));
  const distance = 1.08 * radius / Math.sin(Math.min(halfVertical, halfHorizontal));
  const glide = Math.sin((Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1800) * 1.2;
  const approach = broadcast?.phase === "approach" ? Math.max(0, Math.min(1, (broadcast.activationElapsedMs - 1_200) / 2_000)) : 0;
  const returningTop = broadcast?.phase === "returning-top";
  const view = broadcast ? normalized({ x: zone.up.x * 1.3 + zone.side.x * approach * 0.7, y: zone.up.y * 1.3 + zone.side.y * approach * 0.7, z: zone.up.z * 1.3 + zone.side.z * approach * 0.7 }, zone.up) : normalized({ x: zone.side.x * 0.2 + zone.up.x, y: zone.side.y * 0.2 + zone.up.y, z: zone.side.z * 0.2 + zone.up.z }, zone.up);
  const shotDistance = broadcast ? distance * (returningTop ? 1.15 : 1.15 - approach * 0.33) : distance;
  const aimDown = broadcast ? -zone.height / 4 : 0;
  target.lookAt.x = zone.center.x + zone.tangent.x * glide + zone.up.x * aimDown; target.lookAt.y = zone.center.y + zone.tangent.y * glide + zone.up.y * aimDown; target.lookAt.z = zone.center.z + zone.tangent.z * glide + zone.up.z * aimDown;
  target.position.x = target.lookAt.x + view.x * shotDistance; target.position.y = target.lookAt.y + view.y * shotDistance; target.position.z = target.lookAt.z + view.z * shotDistance;
  target.near = Math.max(0.05, radius * 0.012); target.far = Math.max(shotDistance + radius * 2 + 20, finiteVector(currentCameraPosition) ? Math.hypot(currentCameraPosition.x - zone.center.x, currentCameraPosition.y - zone.center.y, currentCameraPosition.z - zone.center.z) + radius * 2 : 0);
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
  const routeDistance = alongRouteDistance(focus, sampleIndex, samples);
  const frame = frameAtDistance(samples, routeDistance) ?? samples[Math.max(0, Math.min(samples.length - 1, sampleIndex))] ?? samples[0];
  const up = finiteVector(frame?.up) ? frame.up : { x: 0, y: 1, z: 0 };
  const anchor = frameAtDistance(samples, routeDistance - 6);
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
