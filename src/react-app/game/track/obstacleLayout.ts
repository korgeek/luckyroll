import type {
  ObstacleLayout,
  ObstacleLayoutFailure,
  ResolvedBranchLayout,
  ResolvedFrame,
  ResolvedHall,
  ResolvedPeg,
  ResolvedPusherLayout,
  ResolvedPusherPose,
  ResolvedObstacleLayout,
  ResolvedStart,
  ResolvedVortex,
  TrackSample,
  ValidResolvedObstacleLayout,
  Vec3,
} from "./trackTypes";

export const MARBLE_RADIUS = 0.34;
export const MARBLE_DIAMETER = 0.68;
export const MIN_DEVICE_CLEARANCE = 2.04;

const freezeVector = (vector: Vec3): Vec3 => Object.freeze({ ...vector });

export const NEON_OBSTACLE_LAYOUT: ObstacleLayout = Object.freeze({
  start: Object.freeze({ progress: 0, radius: 8.5, shuffleMs: 1500, wallHeight: 1.5 }),
  pegHall: Object.freeze({
    progress: 0.31,
    hallWidth: 18,
    pegRadius: 0.42,
    pegs: Object.freeze([
      Object.freeze({ along: -3, lateral: -5.8 }),
      Object.freeze({ along: -2, lateral: -2.9 }),
      Object.freeze({ along: -1, lateral: 0 }),
      Object.freeze({ along: 0, lateral: 2.9 }),
      Object.freeze({ along: 1, lateral: 5.8 }),
      Object.freeze({ along: 2, lateral: -2.9 }),
      Object.freeze({ along: 3, lateral: 2.9 }),
    ]),
  }),
  pushers: Object.freeze({ progress: 0.43, hallWidth: 18, radius: 0.55, reach: 5.8, travel: 2.2, phaseOffset: Math.PI }),
  branch: Object.freeze({ startProgress: 0.56, endProgress: 0.67, mergeProgress: 0.7 }),
  vortex: Object.freeze({ progress: 0.79, radius: 7.8, outletDiameter: 1.36, verticalDrop: 1.36 }),
});

const isFiniteVector = (vector: unknown): vector is Vec3 => {
  if (typeof vector !== "object" || vector === null) return false;
  const candidate = vector as Vec3;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z);
};

const validSample = (sample: TrackSample | undefined): sample is TrackSample =>
  sample !== undefined &&
  Number.isFinite(sample.index) && Number.isFinite(sample.distance) && Number.isFinite(sample.width) &&
  isFiniteVector(sample.position) && isFiniteVector(sample.tangent) && isFiniteVector(sample.side) && isFiniteVector(sample.up);

const invalidSamples = (message: string) => Object.freeze({
  ok: false as const,
  failures: Object.freeze([Object.freeze({ code: "invalid-samples" as const, message })]),
});

const closestFrame = (samples: readonly TrackSample[], progress: number): ResolvedFrame => {
  const lastIndex = samples.length - 1;
  const target = Math.max(0, Math.min(1, progress));
  const sample = samples.reduce((nearest, candidate) =>
    Math.abs(candidate.index / lastIndex - target) < Math.abs(nearest.index / lastIndex - target) ? candidate : nearest,
  );
  return Object.freeze({
    sampleIndex: sample.index,
    position: freezeVector(sample.position),
    tangent: freezeVector(sample.tangent),
    side: freezeVector(sample.side),
    up: freezeVector(sample.up),
  });
};

const offsetInFrame = (frame: ResolvedFrame, along: number, lateral: number, vertical = 0): Vec3 => freezeVector({
  x: frame.position.x + frame.tangent.x * along + frame.side.x * lateral + frame.up.x * vertical,
  y: frame.position.y + frame.tangent.y * along + frame.side.y * lateral + frame.up.y * vertical,
  z: frame.position.z + frame.tangent.z * along + frame.side.z * lateral + frame.up.z * vertical,
});

export const resolveObstacleLayout = (
  samples: readonly TrackSample[],
  layout: ObstacleLayout = NEON_OBSTACLE_LAYOUT,
): ResolvedObstacleLayout => {
  if (samples.length === 0) return invalidSamples("Obstacle layout requires at least one track sample.");
  if (!samples.every(validSample)) return invalidSamples("Obstacle layout requires finite, complete track sample frames.");

  const startFrame = closestFrame(samples, layout.start.progress);
  const pegFrame = closestFrame(samples, layout.pegHall.progress);
  const pusherFrame = closestFrame(samples, layout.pushers.progress);
  const branch: ResolvedBranchLayout = Object.freeze({
    start: closestFrame(samples, layout.branch.startProgress),
    end: closestFrame(samples, layout.branch.endProgress),
    merge: closestFrame(samples, layout.branch.mergeProgress),
  });
  const vortexFrame = closestFrame(samples, layout.vortex.progress);
  const start: ResolvedStart = Object.freeze({
    frame: startFrame, radius: layout.start.radius, shuffleMs: layout.start.shuffleMs, wallHeight: layout.start.wallHeight,
  });
  const pegHall: ResolvedHall = Object.freeze({ frame: pegFrame, width: layout.pegHall.hallWidth });
  const pegs: readonly ResolvedPeg[] = Object.freeze(layout.pegHall.pegs.map((peg) => Object.freeze({
    along: peg.along,
    lateral: peg.lateral,
    radius: layout.pegHall.pegRadius,
    center: offsetInFrame(pegFrame, peg.along, peg.lateral),
  })));
  const pushers: ResolvedPusherLayout = Object.freeze({
    frame: pusherFrame,
    hallWidth: layout.pushers.hallWidth,
    radius: layout.pushers.radius,
    reach: layout.pushers.reach,
    travel: layout.pushers.travel,
    phaseOffset: layout.pushers.phaseOffset,
  });
  const vortex: ResolvedVortex = Object.freeze({
    frame: vortexFrame,
    radius: layout.vortex.radius,
    outletDiameter: layout.vortex.outletDiameter,
    verticalDrop: layout.vortex.verticalDrop,
  });
  const candidate = { ok: true as const, failures: Object.freeze([]), start, pegHall, pegs, pushers, branch, vortex };
  const failures = validateObstacleLayout(candidate);
  if (failures.length > 0) return Object.freeze({ ok: false as const, failures });
  return Object.freeze(candidate) as ValidResolvedObstacleLayout;
};

export const minimumPegSurfaceGap = (pegs: readonly ResolvedPeg[]): number => {
  if (pegs.length < 2) return Number.NEGATIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < pegs.length; first += 1) {
    for (let second = first + 1; second < pegs.length; second += 1) {
      const left = pegs[first]; const right = pegs[second];
      minimum = Math.min(minimum, Math.hypot(left.center.x - right.center.x, left.center.y - right.center.y, left.center.z - right.center.z) - left.radius - right.radius);
    }
  }
  return minimum;
};

export const minimumPegWallGap = (pegs: readonly ResolvedPeg[], hall: ResolvedHall): number =>
  pegs.length === 0 ? Number.NEGATIVE_INFINITY : Math.min(...pegs.map((peg) => hall.width / 2 - Math.abs(peg.lateral) - peg.radius));

const normalizePusherPhase = (phase: number): number => {
  if (!Number.isFinite(phase) || phase <= 0) return 0;
  if (phase <= 1) return phase;
  return phase % 1;
};

const pusherDepth = (pushers: ResolvedPusherLayout, phase: number): number =>
  pushers.reach - pushers.travel * (1 - Math.sin(phase * Math.PI * 2)) / 2;

export const resolvePusherPose = (pushers: ResolvedPusherLayout, phase: number): ResolvedPusherPose => {
  const normalizedPhase = normalizePusherPhase(phase);
  const leftDepth = pusherDepth(pushers, normalizedPhase);
  const rightDepth = pusherDepth(pushers, normalizedPhase + pushers.phaseOffset / (Math.PI * 2));
  return Object.freeze({
    phase: normalizedPhase,
    left: Object.freeze({ center: offsetInFrame(pushers.frame, 0, -pushers.hallWidth / 2 + leftDepth / 2), depth: leftDepth }),
    right: Object.freeze({ center: offsetInFrame(pushers.frame, 0, pushers.hallWidth / 2 - rightDepth / 2), depth: rightDepth }),
    passage: pushers.hallWidth - leftDepth - rightDepth,
  });
};

export const openPusherPassage = (pose: ResolvedPusherPose): number => pose.passage;

export const validateObstacleLayout = (resolved: ResolvedObstacleLayout): readonly ObstacleLayoutFailure[] => {
  if (!resolved.ok) return resolved.failures;
  const failures: ObstacleLayoutFailure[] = [];
  if (minimumPegSurfaceGap(resolved.pegs) < MIN_DEVICE_CLEARANCE) {
    failures.push(Object.freeze({ code: "peg-clearance", message: `Peg surface gap is below ${MIN_DEVICE_CLEARANCE}.` }));
  }
  if (minimumPegWallGap(resolved.pegs, resolved.pegHall) < MIN_DEVICE_CLEARANCE) {
    failures.push(Object.freeze({ code: "wall-clearance", message: `Peg wall gap is below ${MIN_DEVICE_CLEARANCE}.` }));
  }
  for (let phase = 0; phase <= 1; phase += 0.025) {
    if (openPusherPassage(resolvePusherPose(resolved.pushers, phase)) < MIN_DEVICE_CLEARANCE) {
      failures.push(Object.freeze({ code: "pusher-passage", message: `Pusher passage is below ${MIN_DEVICE_CLEARANCE} at phase ${phase.toFixed(3)}.` }));
      break;
    }
  }
  if (Math.abs(resolved.vortex.outletDiameter - MARBLE_DIAMETER * 2) > Number.EPSILON) {
    failures.push(Object.freeze({ code: "vortex-outlet", message: "Vortex outlet diameter must equal 1.36." }));
  }
  if (Math.abs(resolved.vortex.verticalDrop - MARBLE_DIAMETER * 2) > Number.EPSILON) {
    failures.push(Object.freeze({ code: "vortex-drop", message: "Vortex vertical drop must equal 1.36." }));
  }
  return Object.freeze(failures);
};
