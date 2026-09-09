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

export const frameAtDistance = (samples: readonly TrackSample[], distance: number): Pick<TrackSample, "position" | "tangent" | "side" | "up" | "channelDepth" | "width"> | undefined => {
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

export const routeCameraSpeedLimit = (samples: readonly TrackSample[], distance: number): number => {
  const before = frameAtDistance(samples, distance - 12);
  const ahead = frameAtDistance(samples, distance + 12);
  const turn = before && ahead ? Math.max(0, 1 - dot(before.tangent, ahead.tangent)) : 0;
  return 22 - Math.min(1, turn * 1.5) * 10;
};

export const advanceCameraRoute = (motion: { distance: number; velocity: number }, destination: number, deltaMs: number, speedLimit = 30, destinationVelocity?: number): number => {
  const dt = Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0)) / 1000;
  const error = destination - motion.distance;
  const following = destinationVelocity !== undefined && destinationVelocity >= 0;
  if (following && error >= 0 && motion.velocity < 0) motion.velocity = 0;
  const brakingSpeed = following ? Math.sqrt(16 * Math.abs(error) + 64 * dt * dt) - 8 * dt : Math.sqrt(16 * Math.abs(error));
  const desired = Math.max(-speedLimit, Math.min(speedLimit, (destinationVelocity ?? 0) + Math.sign(error) * Math.min(speedLimit, Math.abs(error) * 1.8, brakingSpeed)));
  motion.velocity += Math.max(-8 * dt, Math.min(8 * dt, desired - motion.velocity));
  motion.distance += motion.velocity * dt;
  if (following && error < 0 && motion.distance < destination) { motion.distance = destination; motion.velocity = Math.max(0, motion.velocity); }
  return motion.distance;
};

export const writeStartCameraShot = (target: CameraShot, frame: TrackSample, bounds: TrackBounds, fov = 60, aspect = 1, launchProgress = 0): CameraShot => {
  const halfFov = Math.min(fov * Math.PI / 360, Math.atan(Math.tan(fov * Math.PI / 360) * Math.max(0.1, aspect)));
  const distance = Math.hypot(frame.width / 2, 6) * 1.15 / Math.sin(halfFov);
  const progress = Math.max(0, Math.min(1, launchProgress));
  const forward = 0.46 - progress * 0.08;
  const side = -(0.25 + progress * 0.03);
  const up = Math.sqrt(1 - forward * forward - side * side);
  for (const key of ["x", "y", "z"] as const) {
    target.lookAt[key] = frame.position[key] + frame.tangent[key] * (4 + progress) + frame.up[key] * 1.5;
    target.position[key] = target.lookAt[key] + distance * (frame.tangent[key] * forward + frame.side[key] * side + frame.up[key] * up);
  }
  writeClip(target, bounds); target.near = 0.1;
  return target;
};

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

export const deriveRouteRuns = (samples: readonly TrackSample[]): readonly Readonly<{ start: number; end: number; straight: boolean }>[] => {
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
  const runs = deriveRouteRuns(samples); let lastDistance = runs[0]?.start ?? 0;
  return Object.freeze({
    update: (traffic) => {
      lastDistance = densestRouteDistance(traffic) ?? lastDistance;
      const current = runs.find(run => run.end > lastDistance) ?? runs[runs.length - 1] ?? { start: lastDistance, end: lastDistance, straight: true };
      return { distance: lastDistance, runStart: current.start, runEnd: current.end, pace: current.straight ? "slow" : "fast" };
    },
    reset: () => { lastDistance = runs[0]?.start ?? 0; },
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

export const writeRouteCrowdFollowShot = (target: CameraShot, routeDistance: number, samples: readonly TrackSample[], bounds: TrackBounds, minimumClearance = 5, pace: "slow" | "fast" = "slow", verticalFovDegrees = 60, aspect = 1, close = false): CameraShot => {
  const safeBounds = Number.isFinite(bounds.radius) && bounds.radius > 0 ? bounds : fallbackBounds;
  const frame = frameAtDistance(samples, routeDistance) ?? samples[0];
  if (!frame) return writeCameraShot(target, "overview", safeBounds);
  const up = finiteVector(frame.up) ? frame.up : { x: 0, y: 1, z: 0 };
  const followDistance = close ? 10 : 14;
  const lead = pace === "fast" ? 8 : 6;
  const fov = Math.min(179, Math.max(1, Number.isFinite(verticalFovDegrees) ? verticalFovDegrees : 60)) * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(fov / 2) * Math.max(0.1, Number.isFinite(aspect) ? aspect : 1));
  const fitDistance = frame.width * (close ? 0.65 : 0.75) / Math.sin(horizontal / 2);
  const clearance = Math.max(12, minimumClearance, frame.channelDepth + 4, Math.sqrt(Math.max(0, fitDistance * fitDistance - (followDistance + lead) ** 2)));
  const anchor = frameAtDistance(samples, routeDistance - followDistance) ?? frame;
  target.position.x = anchor.position.x + anchor.up.x * clearance;
  target.position.y = anchor.position.y + anchor.up.y * clearance;
  target.position.z = anchor.position.z + anchor.up.z * clearance;
  const ahead = frameAtDistance(samples, routeDistance + lead) ?? frame;
  target.lookAt.x = ahead.position.x + ahead.up.x * 0.45;
  target.lookAt.y = ahead.position.y + ahead.up.y * 0.45;
  target.lookAt.z = ahead.position.z + ahead.up.z * 0.45;
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

export type FeatureBroadcastZone = Readonly<{ key: string; kind: "bumper" | "pinwheel"; entryDistance: number; exitDistance: number }>;

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
    zones.push({ key, kind: first.kind as "bumper" | "pinwheel", entryDistance, exitDistance });
  });
  return zones.sort((left, right) => left.entryDistance - right.entryDistance);
};

export const constrainChannelCameraShot = (target: CameraShot, frame: NonNullable<ReturnType<typeof frameAtDistance>>): CameraShot => {
  const offset = { x: target.position.x - frame.position.x, y: target.position.y - frame.position.y, z: target.position.z - frame.position.z };
  const side = Math.max(-frame.width * 0.12, Math.min(frame.width * 0.12, dot(offset, frame.side)));
  const height = Math.max(Math.min(4.8, frame.channelDepth * 0.5), Math.min(8, frame.channelDepth * 0.8, dot(offset, frame.up)));
  for (const key of ["x", "y", "z"] as const) target.position[key] = frame.position[key] + frame.side[key] * side + frame.up[key] * height;
  const direction = { x: target.lookAt.x - target.position.x, y: target.lookAt.y - target.position.y, z: target.lookAt.z - target.position.z };
  const vertical = dot(direction, frame.up);
  const horizontal = { x: direction.x - frame.up.x * vertical, y: direction.y - frame.up.y * vertical, z: direction.z - frame.up.z * vertical };
  const length = Math.hypot(horizontal.x, horizontal.y, horizontal.z);
  const forward = normalized(horizontal, frame.tangent);
  const pitch = Math.max(35, Math.min(50, Math.atan2(-vertical, length) * 180 / Math.PI)) * Math.PI / 180;
  for (const key of ["x", "y", "z"] as const) target.lookAt[key] = target.position[key] + forward[key] * 6 - frame.up[key] * 6 * Math.tan(pitch);
  target.near = 0.1;
  return target;
};

export const writeRouteRearFollowShot = (target: CameraShot, cameraDistance: number, samples: readonly TrackSample[], bounds: TrackBounds, clearance = 6): CameraShot => {
  const frame = frameAtDistance(samples, cameraDistance);
  if (!frame) return writeCameraShot(target, "overview", bounds);
  for (const key of ["x", "y", "z"] as const) {
    target.position[key] = frame.position[key] + frame.up[key] * clearance;
    target.lookAt[key] = frame.position[key] + frame.tangent[key] * 6 + frame.up[key] * 0.8;
  }
  writeClip(target, bounds);
  return target;
};

export const writeBumperTrackShot = (target: CameraShot, zone: FeatureBroadcastZone, samples: readonly TrackSample[], bounds: TrackBounds, cameraDistance = zone.entryDistance - 3, marble?: Vec3): CameraShot => {
  const anchor = frameAtDistance(samples, cameraDistance);
  const focus = frameAtDistance(samples, zone.entryDistance + (zone.exitDistance - zone.entryDistance) * 0.55);
  if (!anchor || !focus) return writeCameraShot(target, "overview", bounds);
  target.position.x = anchor.position.x + anchor.up.x * 6;
  target.position.y = anchor.position.y + anchor.up.y * 6;
  target.position.z = anchor.position.z + anchor.up.z * 6;
  target.lookAt.x = focus.position.x + focus.up.x * 0.8;
  target.lookAt.y = focus.position.y + focus.up.y * 0.8;
  target.lookAt.z = focus.position.z + focus.up.z * 0.8;
  if (marble) {
    const delta = { x: marble.x - target.lookAt.x, y: marble.y - target.lookAt.y, z: marble.z - target.lookAt.z };
    for (const [axis, limit] of [[focus.side, 0.6], [focus.tangent, 1], [focus.up, 0.3]] as const) {
      const offset = Math.max(-limit, Math.min(limit, (delta.x * axis.x + delta.y * axis.y + delta.z * axis.z) * 0.15));
      for (const key of ["x", "y", "z"] as const) {
        target.lookAt[key] += axis[key] * offset;
        target.position[key] += axis[key] * offset * 0.4;
      }
    }
  }
  writeClip(target, bounds);
  return target;
};

export type CameraTraffic = Readonly<{ id: number; distance: number; sampleIndex: number; done: boolean; eliminated: boolean }>;
export type CameraAction = Readonly<{ kind: "boost" | "rush"; targetIds: readonly number[]; exitDistance: number }>;
export type ActionCameraSelection = Readonly<{ mode: "crowd" | "feature" | "boost" | "rush" | "finale"; targetId?: number; zoneKey?: string; framing: "wide" | "close" }>;
type ActionCameraInput = Readonly<{ traffic: readonly CameraTraffic[]; crowd: RouteCrowdState; originalCount: number; activeMs: number; enabled: boolean; action?: CameraAction }>;

export const createActionCameraDirector = (zones: readonly FeatureBroadcastZone[]) => {
  const completed = new Set<string>();
  const passed = new Set<number>();
  let selected: ActionCameraSelection = { mode: "crowd", framing: "wide" };
  let cohort: readonly number[] = []; let exitDistance = 0; let selectedAt = 0;
  const clear = () => { selected = { mode: "crowd", framing: "wide" }; cohort = []; passed.clear(); };
  return {
    update: (input: ActionCameraInput): ActionCameraSelection => {
      const { traffic, crowd, activeMs, action } = input;
      if (!input.enabled) { clear(); return selected; }
      if (!Number.isFinite(activeMs) || !Number.isFinite(crowd.distance)) return selected;
      const live = traffic.filter(b => !b.done && !b.eliminated && Number.isFinite(b.distance));
      if (!live.length) { clear(); return selected; }
      const rear = live.reduce((a, b) => a.distance < b.distance || a.distance === b.distance && a.id < b.id ? a : b);
      if (live.length <= input.originalCount * 0.2) {
        selected = { mode: "finale", targetId: rear.id, framing: "close" }; return selected;
      }
      const byId = new Map(traffic.map(b => [b.id, b]));
      for (const id of cohort) {
        const b = byId.get(id);
        if (!b || b.done || b.eliminated || !Number.isFinite(b.distance) || b.distance >= exitDistance) passed.add(id);
      }
      const fraction = cohort.length ? passed.size / cohort.length : 0;
      const zone = zones.find(z => z.key === selected.zoneKey);
      const occupied = zone && live.some(b => b.distance >= zone.entryDistance && b.distance <= zone.exitDistance);
      const expired = selected.mode === "feature" ? (zone?.kind === "bumper" ? live.every(b => b.distance > zone.exitDistance) : !occupied || fraction >= 0.8)
        : selected.mode === "boost" || selected.mode === "rush" ? fraction >= (selected.mode === "rush" ? 1 : 0.8) : false;
      if (expired) clear();
      if (selected.mode === "feature" && fraction >= 0.5) selected = { ...selected, framing: "wide" };
      else if (selected.mode === "feature" && zone?.kind === "pinwheel" && crowd.distance >= zone.entryDistance + (zone.exitDistance - zone.entryDistance) * 0.2 && activeMs - selectedAt >= 1_800) selected = { ...selected, framing: "close" };
      for (const z of zones) if (z.kind === "bumper" ? live.every(b => b.distance > z.exitDistance) : crowd.distance > z.exitDistance) completed.add(z.key);
      const candidate = zones.find(z => !completed.has(z.key) && (z.kind === "bumper" || crowd.distance >= z.entryDistance && crowd.distance <= z.exitDistance) && live.some(b => b.distance >= z.entryDistance && b.distance <= z.exitDistance));
      if (candidate && (selected.mode !== "feature" || candidate.kind === "bumper" && zone?.kind !== "bumper")) {
        clear(); if (candidate.kind !== "bumper") completed.add(candidate.key); selectedAt = activeMs;
        cohort = live.filter(b => Math.abs(b.distance - crowd.distance) <= 12).map(b => b.id);
        exitDistance = candidate.exitDistance;
        selected = { mode: "feature", zoneKey: candidate.key, framing: "wide" };
      } else if (action && selected.mode !== "feature" && (selected.mode === "crowd" || action.kind === "rush" && selected.mode === "boost") && Number.isFinite(action.exitDistance)) {
        const ids = action.targetIds.filter(id => live.some(b => b.id === id && b.distance < action.exitDistance));
        if (ids.length) {
          clear(); cohort = ids; exitDistance = action.exitDistance; selectedAt = activeMs;
          selected = { mode: action.kind, targetId: action.kind === "rush" ? ids[0] : undefined, framing: "close" };
        }
      }
      const bumper = zones.find(z => z.key === selected.zoneKey && z.kind === "bumper");
      if (selected.mode === "feature" && bumper) {
        const inside = live.filter(b => b.distance >= bumper.entryDistance && b.distance <= bumper.exitDistance);
        const target = inside.find(b => b.id === selected.targetId) ?? inside[0];
        selected = { ...selected, targetId: target?.id };
      }
      return selected;
    },
    reset: () => { clear(); completed.clear(); selectedAt = 0; },
  };
};
