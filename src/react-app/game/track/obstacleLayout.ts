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

const validSample = (sample: unknown): sample is TrackSample => {
  if (typeof sample !== "object" || sample === null) return false;
  const candidate = sample as TrackSample;
  return Number.isFinite(candidate.index) && Number.isFinite(candidate.distance) &&
    Number.isFinite(candidate.width) && Number.isFinite(candidate.channelDepth) && Number.isFinite(candidate.bankRadians) &&
    ["launch", "run", "descent", "mixing-hall", "splitter", "finish"].includes(candidate.zone) &&
    isFiniteVector(candidate.position) && isFiniteVector(candidate.tangent) && isFiniteVector(candidate.side) && isFiniteVector(candidate.up);
};

const validLayoutMeasurements = (layout: ObstacleLayout): boolean => {
  const values = [
    layout.start.progress, layout.start.radius, layout.start.shuffleMs, layout.start.wallHeight,
    layout.pegHall.progress, layout.pegHall.hallWidth, layout.pegHall.pegRadius,
    layout.pushers.progress, layout.pushers.hallWidth, layout.pushers.radius, layout.pushers.reach, layout.pushers.travel, layout.pushers.phaseOffset,
    layout.branch.startProgress, layout.branch.endProgress, layout.branch.mergeProgress,
    layout.vortex.progress, layout.vortex.radius, layout.vortex.outletDiameter, layout.vortex.verticalDrop,
    ...layout.pegHall.pegs.flatMap((peg) => [peg.along, peg.lateral]),
  ];
  return values.every(Number.isFinite);
};

const invalidSamples = (message: string) => Object.freeze({
  ok: false as const,
  failures: Object.freeze([Object.freeze({ code: "invalid-samples" as const, message })]),
});

const closestSample = (samples: readonly TrackSample[], progress: number): TrackSample => {
  const lastIndex = samples.length - 1;
  const target = Math.max(0, Math.min(1, progress));
  return samples.reduce((nearest, candidate) =>
    Math.abs(candidate.index / lastIndex - target) < Math.abs(nearest.index / lastIndex - target) ? candidate : nearest,
  );
};

const frameForSample = (sample: TrackSample): ResolvedFrame => {
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
  if (!samples.every((sample, offset) => validSample(sample) && sample.index === offset)) {
    return invalidSamples("Obstacle layout requires finite, complete samples with canonical sequential indexes.");
  }
  if (!validLayoutMeasurements(layout)) {
    return Object.freeze({
      ok: false as const,
      failures: Object.freeze([Object.freeze({ code: "non-finite-layout" as const, message: "Obstacle layout measurements must be finite." })]),
    });
  }

  const startSample = closestSample(samples, layout.start.progress);
  const pegSample = closestSample(samples, layout.pegHall.progress);
  const pusherSample = closestSample(samples, layout.pushers.progress);
  const startFrame = frameForSample(startSample);
  const pegFrame = frameForSample(pegSample);
  const pusherFrame = frameForSample(pusherSample);
  const branch: ResolvedBranchLayout = Object.freeze({
    start: frameForSample(closestSample(samples, layout.branch.startProgress)),
    end: frameForSample(closestSample(samples, layout.branch.endProgress)),
    merge: frameForSample(closestSample(samples, layout.branch.mergeProgress)),
  });
  const vortexFrame = frameForSample(closestSample(samples, layout.vortex.progress));
  const start: ResolvedStart = Object.freeze({
    frame: startFrame, radius: layout.start.radius, shuffleMs: layout.start.shuffleMs, wallHeight: layout.start.wallHeight,
  });
  const pegHall: ResolvedHall = Object.freeze({
    frame: pegFrame,
    width: layout.pegHall.hallWidth,
    baseSurfaceWidth: pegSample.width,
  });
  const pegs: readonly ResolvedPeg[] = Object.freeze(layout.pegHall.pegs.map((peg) => Object.freeze({
    along: peg.along,
    lateral: peg.lateral,
    radius: layout.pegHall.pegRadius,
    center: offsetInFrame(pegFrame, peg.along, peg.lateral),
  })));
  const pushers: ResolvedPusherLayout = Object.freeze({
    frame: pusherFrame,
    hallWidth: layout.pushers.hallWidth,
    baseSurfaceWidth: pusherSample.width,
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
  if (!hasFiniteResolvedMeasurements(candidate)) {
    return Object.freeze({
      ok: false as const,
      failures: Object.freeze([Object.freeze({ code: "non-finite-layout" as const, message: "Resolved obstacle measurements must be finite." })]),
    });
  }
  const intrinsicFailures = validateIntrinsicObstacleLayout(candidate);
  if (intrinsicFailures.length > 0) return Object.freeze({ ok: false as const, failures: intrinsicFailures });
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

const frameValues = (frame: ResolvedFrame): readonly number[] => [
  frame.sampleIndex,
  frame.position.x, frame.position.y, frame.position.z,
  frame.tangent.x, frame.tangent.y, frame.tangent.z,
  frame.side.x, frame.side.y, frame.side.z,
  frame.up.x, frame.up.y, frame.up.z,
];

const hasFiniteResolvedMeasurements = (resolved: ValidResolvedObstacleLayout): boolean => {
  const pusherPoseValues = [0, 0.25, 0.5, 0.75, 1].flatMap((phase) => {
    const pose = resolvePusherPose(resolved.pushers, phase);
    return [
      pose.phase, pose.passage,
      pose.left.depth, pose.left.center.x, pose.left.center.y, pose.left.center.z,
      pose.right.depth, pose.right.center.x, pose.right.center.y, pose.right.center.z,
    ];
  });
  return [
    ...frameValues(resolved.start.frame),
    resolved.start.radius, resolved.start.shuffleMs, resolved.start.wallHeight,
    ...frameValues(resolved.pegHall.frame),
    resolved.pegHall.width, resolved.pegHall.baseSurfaceWidth,
    ...resolved.pegs.flatMap((peg) => [peg.along, peg.lateral, peg.radius, peg.center.x, peg.center.y, peg.center.z]),
    ...frameValues(resolved.pushers.frame),
    resolved.pushers.hallWidth, resolved.pushers.baseSurfaceWidth, resolved.pushers.radius, resolved.pushers.reach, resolved.pushers.travel, resolved.pushers.phaseOffset,
    ...pusherPoseValues,
    ...frameValues(resolved.branch.start), ...frameValues(resolved.branch.end), ...frameValues(resolved.branch.merge),
    ...frameValues(resolved.vortex.frame),
    resolved.vortex.radius, resolved.vortex.outletDiameter, resolved.vortex.verticalDrop,
  ].every(Number.isFinite);
};

const validateIntrinsicObstacleLayout = (resolved: ValidResolvedObstacleLayout): readonly ObstacleLayoutFailure[] => {
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

export const validateObstacleLayout = (resolved: ResolvedObstacleLayout): readonly ObstacleLayoutFailure[] => {
  if (!resolved.ok) return resolved.failures;
  const failures: ObstacleLayoutFailure[] = [];
  if (!hasFiniteResolvedMeasurements(resolved)) {
    failures.push(Object.freeze({ code: "non-finite-layout", message: "Resolved obstacle measurements must be finite." }));
    return Object.freeze(failures);
  }
  if (resolved.pegHall.baseSurfaceWidth < resolved.pegHall.width) {
    failures.push(Object.freeze({
      code: "device-surface-width",
      message: `Peg hall base surface width ${resolved.pegHall.baseSurfaceWidth} requires the planned ${resolved.pegHall.width}-wide device surface.`,
    }));
  }
  if (resolved.pushers.baseSurfaceWidth < resolved.pushers.hallWidth) {
    failures.push(Object.freeze({
      code: "device-surface-width",
      message: `Pusher hall base surface width ${resolved.pushers.baseSurfaceWidth} requires the planned ${resolved.pushers.hallWidth}-wide device surface.`,
    }));
  }
  failures.push(...validateIntrinsicObstacleLayout(resolved));
  return Object.freeze(failures);
};
