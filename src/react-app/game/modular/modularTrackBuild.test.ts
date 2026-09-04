import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { buildModularTrack } from "./modularTrackBuild";
import { CHANNEL_WIDTH, MODULE_SIZE, START_LENGTH } from "./modulePath";
import { PROFILE_SEGMENTS, profileAt, validateModuleGeometry } from "./moduleGeometry";

describe("modular track build", () => {
  it("builds one validated welded geometry for a valid design", () => {
    const built = buildModularTrack(createValidTrackDesign());
    expect(built.geometry.positions).toBeInstanceOf(Float32Array);
    expect(built.geometry.normals).toBeInstanceOf(Float32Array);
    expect(built.geometry.indices).toBeInstanceOf(Uint32Array);
    expect(validateModuleGeometry(built.geometry)).toEqual([]);
  });

  it("extends geometry upstream without changing the route sample stream", () => {
    const built = buildModularTrack(createValidTrackDesign());
    const first = built.samples[0]!;
    const start = built.geometry.samples[0]!;

    expect(built.geometry.samples).toHaveLength(built.samples.length + 1);
    expect(built.geometry.samples[1]).toBe(first);
    expect(start).toMatchObject({
      index: -1,
      distance: first.distance - START_LENGTH,
      localU: -START_LENGTH / MODULE_SIZE,
      width: CHANNEL_WIDTH,
      bankRadians: 0,
      chordError: 0,
      centerlineCurvature: { x: 0, y: 0, z: 0 },
    });
    expect(start.position).toEqual({
      x: first.position.x - first.tangent.x * START_LENGTH,
      y: first.position.y - first.tangent.y * START_LENGTH,
      z: first.position.z - first.tangent.z * START_LENGTH,
    });
    expect(start.tangent).toBe(first.tangent);
    expect(start.side).toBe(first.side);
    expect(start.up).toBe(first.up);
    expect(start.port).toBeUndefined();
    expect(start.ports).toBeUndefined();
    expect(profileAt(start.width)).toEqual(profileAt(CHANNEL_WIDTH));
    expect(PROFILE_SEGMENTS).toBe(built.geometry.profileSegments);
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
