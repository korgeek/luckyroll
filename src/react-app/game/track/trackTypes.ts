export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type LaunchSlot = Vec3 &
  Readonly<{ crossOffset: number; row: number; column: number }>;

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

export type TrackGeometry = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
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
    | "winding"
    | "disconnected"
    | "clearance"
    | "rail-gap"
    | "finish-entry";
  sampleIndex?: number;
  message: string;
}>;
