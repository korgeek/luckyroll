import { generateTrackGeometry } from "./trackGeometry";
import { resolveObstacleLayout, validateObstacleLayout } from "./obstacleLayout";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec, DEFAULT_TRACK_FEATURE_LAYOUT } from "./trackSpec";
import type { ObstaclePlacementValidation, TrackFeatureLayout, TrackGeometry, TrackSample, TrackSpec, ValidResolvedObstacleLayout } from "./trackTypes";
import { assertValidTrack } from "./trackValidation";

export type BuiltTrack = Readonly<{
  spec: TrackSpec;
  samples: readonly TrackSample[];
  geometry: TrackGeometry;
  obstacleLayout: ValidResolvedObstacleLayout;
  obstaclePlacement: ObstaclePlacementValidation;
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
  const obstaclePlacementFailures = validateObstacleLayout(obstacleLayout);
  const obstaclePlacement: ObstaclePlacementValidation = Object.freeze({
    ok: obstaclePlacementFailures.length === 0,
    failures: obstaclePlacementFailures,
  });

  return Object.freeze({ spec, samples, geometry, obstacleLayout, obstaclePlacement });
};
