import type { TrackDesign } from "../../designer/trackDesign";
import { assertValidTrackDesign, type ValidRoute } from "../../designer/trackValidation";
import { createStartExtensionSamples, sampleModulePath, type ModulePathSample } from "./modulePath";
import { buildModuleGeometry, type ModularTrackGeometry } from "./moduleGeometry";

export type BuiltModularTrack = Readonly<{
  track: TrackDesign;
  route: ValidRoute;
  samples: readonly ModulePathSample[];
  geometry: ModularTrackGeometry;
}>;

export const buildModularTrack = (track: TrackDesign): BuiltModularTrack => {
  const route = assertValidTrackDesign(track);
  const samples = sampleModulePath(track, route);
  const geometry = buildModuleGeometry(createStartExtensionSamples(samples));
  return Object.freeze({ track, route, samples, geometry });
};
