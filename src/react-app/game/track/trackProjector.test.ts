import { expect, it } from "vitest";
import { createTrackProjector, projectToTrack } from "./trackSampler";
import { buildModularTrack } from "../modular/modularTrackBuild";
import { createDefaultTrackDesign } from "../../designer/trackDesign";

it("matches exhaustive nearest-sample results around every part of the real default track", () => {
  const { samples } = buildModularTrack(createDefaultTrackDesign());
  const project = createTrackProjector(samples);
  for (let i = 0; i < 1200; i++) {
    const p = samples[(i * 37) % samples.length].position;
    const point = { x: p.x + (i % 31) - 15, y: p.y + (i % 17) - 8, z: p.z + (i % 23) - 11 };
    expect(project(point)).toEqual(projectToTrack(point, samples));
  }
  const duplicate = [...samples.slice(0, 40), samples[0]];
  expect(createTrackProjector(duplicate)(samples[0].position)).toEqual(projectToTrack(samples[0].position, duplicate));
  expect(() => createTrackProjector([])({ x: 0, y: 0, z: 0 })).toThrow();
});
