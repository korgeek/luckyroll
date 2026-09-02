import { generateTrackGeometry } from "./trackGeometry";
import { sampleTrack } from "./trackSampler";
import { createLuckyRollTrackSpec } from "./trackSpec";
import type { TrackGeometry, TrackSample, TrackSpec } from "./trackTypes";
import { assertValidTrack } from "./trackValidation";

export type BuiltTrack = Readonly<{
  spec: TrackSpec;
  samples: readonly TrackSample[];
  geometry: TrackGeometry;
}>;

export const buildValidatedTrack = (options: { features?: boolean } = {}): BuiltTrack => {
  const spec = createLuckyRollTrackSpec(options);
  const samples = sampleTrack(spec);
  const geometry = generateTrackGeometry(samples, spec.profileSegments);
  assertValidTrack(spec, samples, geometry);

  return Object.freeze({ spec, samples, geometry });
};
