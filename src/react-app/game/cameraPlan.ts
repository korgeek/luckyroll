import type { TrackSample, Vec3 } from "./track/trackTypes";

export type CameraShotName = "overview" | "bird" | "side" | "profile" | "leader" | "trailer" | "finish";
export type TrackBounds = Readonly<{ center: Vec3; radius: number }>;
export type CameraShot = { position: { x: number; y: number; z: number }; lookAt: { x: number; y: number; z: number }; near: number; far: number };
export type RouteCrowdTarget = Readonly<{ id: string | number; distance: number; done?: boolean; eliminated?: boolean }>;
export type RouteCrowdState = Readonly<{ distance: number; runStart: number; runEnd: number; pace: "slow" | "fast" }>;
export type RouteCrowdDirector = Readonly<{ update: (traffic: readonly RouteCrowdTarget[], originalCount: number) => RouteCrowdState; reset: () => void }>;
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

const normalized = (value: Vec3, fallback: Vec3): Vec3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > 1e-9 ? { x: value.x / length, y: value.y / length, z: value.z / length } : fallback;
};

const dot = (left: Vec3, right: Vec3): number => left.x * right.x + left.y * right.y + left.z * right.z;

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

const frameAtDistance = (samples: readonly TrackSample[], distance: number): Pick<TrackSample, "position" | "tangent" | "side" | "up" | "channelDepth" | "width"> | undefined => {
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
  return { position: mix(left.position, right.position), tangent: normalized(mix(left.tangent, right.tangent), left.tangent), side: normalized(mix(left.side, right.side), left.side), up: normalized(mix(left.up, right.up), left.up), channelDepth: left.channelDepth + (right.channelDepth - left.channelDepth) * t, width: left.width + (right.width - left.width) * t };
};

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

const deriveRouteRuns = (samples: readonly TrackSample[]): readonly Readonly<{ start: number; end: number; straight: boolean }>[] => {
  if (!samples.length) return [];
  const modular = samples as readonly (TrackSample & { kind?: string })[];
  if (modular.some((sample) => sample.kind !== undefined)) {
    const runs: { start: number; end: number; straight: boolean }[] = [];
    let start = 0; let straight = modular[0]!.kind !== "curve";
    for (let index = 1; index < modular.length; index += 1) {
      const nextStraight = modular[index]!.kind !== "curve";
      if (nextStraight === straight) continue;
      runs.push({ start: modular[start]!.distance, end: modular[index - 1]!.distance, straight }); start = index; straight = nextStraight;
    }
    runs.push({ start: modular[start]!.distance, end: modular[modular.length - 1]!.distance, straight });
    return runs;
  }
  const runs: { start: number; end: number; straight: boolean }[] = [];
  let start = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (dot(normalized(samples[start]!.tangent, { x: 1, y: 0, z: 0 }), normalized(samples[index]!.tangent, { x: 1, y: 0, z: 0 })) < 0.965) {
      const end = samples[index - 1]!.distance;
      runs.push({ start: samples[start]!.distance, end, straight: end - samples[start]!.distance >= 12 }); start = index;
    }
  }
  const end = samples[samples.length - 1]!.distance;
  runs.push({ start: samples[start]!.distance, end, straight: end - samples[start]!.distance >= 12 });
  return runs;
};

const densestRouteDistance = (traffic: readonly RouteCrowdTarget[]): number | undefined => {
  const distances = traffic.filter((member) => !member.done && !member.eliminated && Number.isFinite(member.distance)).map((member) => member.distance).sort((left, right) => left - right);
  if (!distances.length) return undefined;
  let best = [distances[0]!]; let group = best;
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index]! - group[group.length - 1]! <= 8) { group.push(distances[index]!); if (group.length > best.length) best = group; }
    else { group = [distances[index]!]; if (group.length > best.length) best = group; }
  }
  return best.reduce((sum, distance) => sum + distance, 0) / best.length;
};

export const createRouteCrowdDirector = (samples: readonly TrackSample[]): RouteCrowdDirector => {
  const runs = deriveRouteRuns(samples); let runIndex = 0; let passed = new Set<string | number>(); let lastDistance = runs[0]?.start ?? 0;
  return Object.freeze({
    update: (traffic, originalCount) => {
      const run = runs[Math.min(runIndex, Math.max(0, runs.length - 1))] ?? { start: lastDistance, end: lastDistance, straight: true };
      for (const member of traffic) if (!member.done && !member.eliminated && Number.isFinite(member.distance) && member.distance >= run.end) passed.add(member.id);
      const unavailable = traffic.filter((member) => (member.done || member.eliminated) && !passed.has(member.id)).length;
      const required = Math.max(1, Number.isFinite(originalCount) && originalCount > 0 ? originalCount * 0.8 : traffic.length * 0.8);
      const dense = densestRouteDistance(traffic);
      if (runIndex < runs.length - 1 && (run.straight ? passed.size + unavailable >= required : dense !== undefined && dense >= run.end)) { runIndex += 1; passed = new Set(); }
      const current = runs[Math.min(runIndex, Math.max(0, runs.length - 1))] ?? run;
      lastDistance = dense === undefined ? lastDistance : current.straight ? Math.min(dense, current.end) : dense;
      return Object.freeze({ distance: lastDistance, runStart: current.start, runEnd: current.end, pace: current.straight ? "slow" : "fast" });
    },
    reset: () => { runIndex = 0; passed = new Set(); lastDistance = runs[0]?.start ?? 0; },
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

export const writeRouteCrowdFollowShot = (target: CameraShot, routeDistance: number, samples: readonly TrackSample[], bounds: TrackBounds, minimumClearance = 5, pace: "slow" | "fast" = "slow", verticalFovDegrees = 60, aspect = 1): CameraShot => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds : fallbackBounds;
  const frame = frameAtDistance(samples, routeDistance) ?? samples[0];
  if (!frame) return writeCameraShot(target, "overview", safeBounds);
  const up = finiteVector(frame.up) ? frame.up : { x: 0, y: 1, z: 0 };
  const followDistance = pace === "fast" ? 6 : 10;
  const lead = pace === "fast" ? 6 : 5;
  const fov = Math.min(179, Math.max(1, Number.isFinite(verticalFovDegrees) ? verticalFovDegrees : 60)) * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(fov / 2) * Math.max(0.1, Number.isFinite(aspect) ? aspect : 1));
  const fitDistance = frame.width * 0.62 / Math.sin(horizontal / 2);
  const clearance = Math.max(minimumClearance, frame.channelDepth + 1, Math.sqrt(Math.max(0, fitDistance * fitDistance - (followDistance + lead) ** 2)));
  const anchor = frameAtDistance(samples, routeDistance - followDistance) ?? frame;
  target.position.x = anchor.position.x + anchor.up.x * clearance;
  target.position.y = anchor.position.y + anchor.up.y * clearance;
  target.position.z = anchor.position.z + anchor.up.z * clearance;
  target.lookAt.x = frame.position.x + frame.tangent.x * lead + up.x * 0.45;
  target.lookAt.y = frame.position.y + frame.tangent.y * lead + up.y * 0.45;
  target.lookAt.z = frame.position.z + frame.tangent.z * lead + up.z * 0.45;
  writeClip(target, safeBounds);
  return enforceCameraClearance(target, up, clearance);
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
