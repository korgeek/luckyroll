import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { validateModuleGeometry } from "./moduleGeometry";

describe("modular track build", () => {
  it("builds one validated welded geometry for a valid design", () => {
    const built = buildModularTrack(createValidTrackDesign());
    expect(built.geometry.positions).toBeInstanceOf(Float32Array);
    expect(built.geometry.normals).toBeInstanceOf(Float32Array);
    expect(built.geometry.indices).toBeInstanceOf(Uint32Array);
    expect(validateModuleGeometry(built.geometry)).toEqual([]);
  });

  it("rejects an invalid route before creating geometry", () => {
    const track = createValidTrackDesign();
    const cells = [...track.cells];
    cells[1] = null;
    expect(() => buildModularTrack({ ...track, cells })).toThrow();
  });

  it("accepts the sampled worst-case route", () => {
    expect(() => buildModularTrack(createWorstCaseTrackDesign())).not.toThrow();
  });
});
