import { generateTrackGeometry } from "./trackGeometry";
import { resolveObstacleLayout } from "./obstacleLayout";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec, DEFAULT_TRACK_FEATURE_LAYOUT } from "./trackSpec";
import type { TrackFeatureLayout, TrackGeometry, TrackSample, TrackSpec, ValidResolvedObstacleLayout } from "./trackTypes";
import { assertValidTrack } from "./trackValidation";

export type BuiltTrack = Readonly<{
  spec: TrackSpec;
  samples: readonly TrackSample[];
  geometry: TrackGeometry;
  obstacleLayout: ValidResolvedObstacleLayout;
}>;

export const buildValidatedTrack = (options: { features?: boolean; featureLayout?: TrackFeatureLayout } = {}): BuiltTrack => {
  const spec = createLuckyRollTrackSpec(options);
  const samples = sampleTrack(spec);
  const featureLayout = options.features ? options.featureLayout ?? DEFAULT_TRACK_FEATURE_LAYOUT : undefined;
  const geometry: TrackGeometry = generateTrackGeometry(samples, spec.profileSegments, featureLayout);
  assertValidTrack(spec, samples, geometry);
  const obstacleLayout = resolveObstacleLayout(samples);
  if (!obstacleLayout.ok) {
    throw new Error(obstacleLayout.failures.map((failure) => `${failure.code}: ${failure.message}`).join("\n"));
  }

  return Object.freeze({ spec, samples, geometry, obstacleLayout });
};
