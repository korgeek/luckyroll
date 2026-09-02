import { generateTrackGeometry } from "./trackGeometry";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec, DEFAULT_TRACK_FEATURE_LAYOUT } from "./trackSpec";
import type { TrackFeatureLayout, TrackGeometry, TrackSample, TrackSpec } from "./trackTypes";
import { assertValidTrack } from "./trackValidation";

export type BuiltTrack = Readonly<{
  spec: TrackSpec;
  samples: readonly TrackSample[];
  geometry: TrackGeometry;
}>;

export const buildValidatedTrack = (options: { features?: boolean; featureLayout?: TrackFeatureLayout } = {}): BuiltTrack => {
  const spec = createLuckyRollTrackSpec(options);
  const samples = sampleTrack(spec);
  const featureLayout = options.features ? options.featureLayout ?? DEFAULT_TRACK_FEATURE_LAYOUT : undefined;
  const geometry: TrackGeometry = generateTrackGeometry(samples, spec.profileSegments, featureLayout);
  assertValidTrack(spec, samples, geometry);

  return Object.freeze({ spec, samples, geometry });
};
