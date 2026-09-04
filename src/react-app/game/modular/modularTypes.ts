import type { Direction, ModuleKind } from "../../designer/trackDesign";
import type { TrackSample, Vec3 } from "../track/trackTypes";

export type ModulePort = Readonly<{
  cellIndex: number;
  direction: Direction;
  position: Vec3;
  outwardTangent: Vec3;
  curvature: Vec3;
  floorHeight: number;
  clearWidth: number;
  railHeight: number;
}>;

export type ModulePathSample = TrackSample & Readonly<{
  cellIndex: number;
  localU: number;
  centerlineCurvature: Vec3;
  chordError?: number;
  port?: ModulePort;
  ports?: readonly ModulePort[];
}>;

export type { Direction, ModuleKind, TrackSample, Vec3 };

export const MARBLE_DIAMETER = 0.68;
export const MODULE_SIZE = 20;
export const CHANNEL_WIDTH = 12;
export const RAIL_HEIGHT = 8;
export const LANDING_LENGTH = MODULE_SIZE * 0.1;
export const ROUTE_GRADE = 7 * Math.PI / 180;
export const MAX_CURVE_BANK = 24 * Math.PI / 180;
export const START_LENGTH = 10.2;
