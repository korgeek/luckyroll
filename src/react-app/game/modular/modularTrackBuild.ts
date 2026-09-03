import type { TrackDesign } from "../../designer/trackDesign";
import { assertValidTrackDesign, type ValidRoute } from "../../designer/trackValidation";
import { sampleModulePath, type ModulePathSample } from "./modulePath";
import { buildModuleGeometry, validateModuleGeometry, type ModularTrackGeometry } from "./moduleGeometry";

export type BuiltModularTrack = Readonly<{
  track: TrackDesign;
  route: ValidRoute;
  samples: readonly ModulePathSample[];
  geometry: ModularTrackGeometry;
}>;

export const buildModularTrack = (track: TrackDesign): BuiltModularTrack => {
  const route = assertValidTrackDesign(track);
  const samples = sampleModulePath(track, route);
  const geometry = buildModuleGeometry(samples);
  const failures = validateModuleGeometry(geometry);
  if (failures.length > 0) throw new Error(failures.map((item) => item.message).join("\n"));
  return Object.freeze({ track, route, samples, geometry });
};
