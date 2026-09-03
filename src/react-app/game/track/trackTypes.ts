export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type LaunchSlot = Vec3 &
  Readonly<{ crossOffset: number; row: number; column: number }>;

export type PhysicalLaunchPosition = LaunchSlot &
  Readonly<{ physicalLaunchPosition: true }>;

export type TrackZone =
  | "launch"
  | "run"
  | "descent"
  | "mixing-hall"
  | "splitter"
  | "finish";

export type TrackNode = Readonly<{
  id: string;
  checkpoint?: "A" | `${number}`;
  level?: 1 | 2 | 3;
  position: Vec3;
  width: number;
  channelDepth: number;
  bankRadians: number;
  zone: TrackZone;
}>;

export type TrackSpec = Readonly<{
  nodes: readonly TrackNode[];
  sampleSpacing: number;
  profileSegments: number;
}>;

export type TrackFeatureLayout = Readonly<{
  hallWidth: number;
  dividerRadius: number;
  dividerLength: number;
  dividerHeight: number;
  dividerOffset: number;
  featureGrade?: number;
  edgeLift?: number;
  edgeLiftStartSample?: number;
  edgeLiftEndSample?: number;
  edgeLiftTaperSamples?: number;
  edgeLiftSide?: "both" | "right";
}>;

export type TrackSample = Readonly<{
  index: number;
  distance: number;
  position: Vec3;
  tangent: Vec3;
  side: Vec3;
  up: Vec3;
  width: number;
  channelDepth: number;
  bankRadians: number;
  zone: TrackZone;
}>;

export type ObstacleLayout = Readonly<{
  start: Readonly<{ progress: number; radius: number; shuffleMs: number; wallHeight: number }>;
  pegHall: Readonly<{
    progress: number;
    hallWidth: number;
    pegRadius: number;
    pegs: readonly Readonly<{ along: number; lateral: number }>[];
  }>;
  pushers: Readonly<{
    progress: number;
    hallWidth: number;
    radius: number;
    reach: number;
    travel: number;
    phaseOffset: number;
  }>;
  branch: Readonly<{ startProgress: number; endProgress: number; mergeProgress: number }>;
  vortex: Readonly<{ progress: number; radius: number; outletDiameter: number; verticalDrop: number }>;
}>;

export type ResolvedFrame = Readonly<{
  sampleIndex: number;
  position: Vec3;
  tangent: Vec3;
  side: Vec3;
  up: Vec3;
}>;

export type ResolvedStart = Readonly<{
  frame: ResolvedFrame;
  radius: number;
  shuffleMs: number;
  wallHeight: number;
}>;

export type ResolvedHall = Readonly<{
  frame: ResolvedFrame;
  width: number;
  baseSurfaceWidth: number;
}>;

export type ResolvedPeg = Readonly<{
  along: number;
  lateral: number;
  radius: number;
  center: Vec3;
}>;

export type ResolvedPusherLayout = Readonly<{
  frame: ResolvedFrame;
  hallWidth: number;
  baseSurfaceWidth: number;
  radius: number;
  reach: number;
  travel: number;
  phaseOffset: number;
}>;

export type ResolvedPusherPose = Readonly<{
  phase: number;
  left: Readonly<{ center: Vec3; depth: number }>;
  right: Readonly<{ center: Vec3; depth: number }>;
  passage: number;
}>;

export type ResolvedBranchLayout = Readonly<{
  start: ResolvedFrame;
  end: ResolvedFrame;
  merge: ResolvedFrame;
}>;

export type ResolvedVortex = Readonly<{
  frame: ResolvedFrame;
  radius: number;
  outletDiameter: number;
  verticalDrop: number;
}>;

export type ObstacleLayoutFailure = Readonly<{
  code: "invalid-samples" | "non-finite-layout" | "device-surface-width" | "peg-clearance" | "wall-clearance" | "pusher-passage" | "vortex-outlet" | "vortex-drop";
  message: string;
}>;

export type ObstaclePlacementValidation = Readonly<{
  ok: boolean;
  failures: readonly ObstacleLayoutFailure[];
}>;

export type ValidResolvedObstacleLayout = Readonly<{
  ok: true;
  failures: readonly ObstacleLayoutFailure[];
  start: ResolvedStart;
  pegHall: ResolvedHall;
  pegs: readonly ResolvedPeg[];
  pushers: ResolvedPusherLayout;
  branch: ResolvedBranchLayout;
  vortex: ResolvedVortex;
}>;

export type InvalidResolvedObstacleLayout = Readonly<{
  ok: false;
  failures: readonly ObstacleLayoutFailure[];
}>;

export type ResolvedObstacleLayout = ValidResolvedObstacleLayout | InvalidResolvedObstacleLayout;

export type TrackGeometry = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  featurePositions: Float32Array;
  featureNormals: Float32Array;
  featureIndices: Uint32Array;
  samples: readonly TrackSample[];
  profileSegments: number;
  triangleCount: number;
}>;

export type TrackValidationFailure = Readonly<{
  code:
    | "checkpoint-order"
    | "sample-gap"
    | "uphill"
    | "tight-turn"
    | "degenerate-triangle"
    | "geometry-structure"
    | "feature-geometry"
    | "winding"
    | "disconnected"
    | "non-finite"
    | "invalid-level"
    | "clearance"
    | "rail-gap"
    | "rail-seam"
    | "finish-entry";
  sampleIndex?: number;
  vertexIndex?: number;
  message: string;
}>;
