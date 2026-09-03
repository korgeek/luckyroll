import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { assertValidTrackDesign } from "../../designer/trackValidation";
import {
  boardToWorld,
  moduleWidthAt,
  sampleModulePath,
} from "./modulePath";

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const midpoint = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

describe("canonical modular module paths", () => {
  it("keeps every welded reciprocal seam and endpoint port descriptor", () => {
    const track = createValidTrackDesign();
    const route = assertValidTrackDesign(track);
    const samples = sampleModulePath(track, route);
    const seams = samples.filter((sample) => sample.ports?.length === 2);

    expect(seams).toHaveLength(route.route.length - 1);
    for (const seam of seams) expect(seam.ports).toHaveLength(2);
    expect(samples.find((sample) => sample.cellIndex === 0 && sample.ports?.some((port) => port.direction === "east"))).toBeDefined();
    expect(samples.find((sample) => sample.ports?.some((port) => port.cellIndex === 39 && port.direction === "west"))).toBeDefined();

    const firstSeam = seams[0];
    const [upstream, downstream] = firstSeam.ports!;
    expect(distance(upstream.position, downstream.position)).toBeLessThanOrEqual(1e-6);
    expect(dot(upstream.outwardTangent, downstream.outwardTangent)).toBeCloseTo(-1, 6);
    expect(distance(upstream.curvature, { x: 0, y: 0, z: 0 })).toBeLessThanOrEqual(1e-6);
    expect(distance(downstream.curvature, { x: 0, y: 0, z: 0 })).toBeLessThanOrEqual(1e-6);
  });

  it("emits the wave interior instead of accepting an aliased midpoint", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track)).filter((sample) => sample.cellIndex === 8);
    const start = samples[0].position;
    const end = samples[samples.length - 1].position;
    const chord = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
    const chordLength = distance(start, end);
    const lateralOffsets = samples.map((sample) => Math.abs(
      chord.x * (sample.position.z - start.z) - chord.z * (sample.position.x - start.x),
    ) / chordLength);

    expect(Math.max(...lateralOffsets)).toBeGreaterThan(0.1);
  });

  it("samples the funnel waist and its 0.10S hold", () => {
    const track = createValidTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track)).filter((sample) => sample.cellIndex === 2);
    const waist = samples.filter((sample) => sample.width === 9.6);

    expect(moduleWidthAt("funnel", 0.45)).toBeCloseTo(9.6, 12);
    expect(moduleWidthAt("funnel", 0.55)).toBeCloseTo(9.6, 12);
    expect(waist.map((sample) => sample.localU)).toEqual(expect.arrayContaining([0.45, 0.5, 0.55]));
    expect(waist[waist.length - 1].distance - waist[0].distance).toBeCloseTo(2, 6);
    expect(moduleWidthAt("funnel", 0)).toBe(12);
    expect(moduleWidthAt("funnel", 1)).toBe(12);
  });

  it("keeps adaptive tangent turns and midpoint chord errors within bounds", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    const turns = samples.slice(1).map((sample, index) => Math.acos(Math.min(1, Math.max(-1, dot(samples[index].tangent, sample.tangent)))));
    const maxTurn = Math.max(...turns);
    const chordErrors = samples.slice(1, -1)
      .map((sample, index) => {
        const centerIndex = index + 1;
        const isParameterMidpoint = Math.abs((samples[centerIndex - 1].localU + samples[centerIndex + 1].localU) / 2 - sample.localU) < 1e-12;
        const avoidsLandingJoin = ![samples[centerIndex - 1].localU, sample.localU, samples[centerIndex + 1].localU].some((localU) => localU === 0.1 || localU === 0.9);
        return isParameterMidpoint && avoidsLandingJoin && samples[centerIndex - 1].cellIndex === sample.cellIndex && sample.cellIndex === samples[centerIndex + 1].cellIndex
          ? distance(sample.position, midpoint(samples[centerIndex - 1].position, samples[centerIndex + 1].position)) : 0;
      });
    const maxChordError = Math.max(...chordErrors);

    expect(maxTurn).toBeLessThanOrEqual(2 * Math.PI / 180 + 1e-9);
    expect(maxChordError).toBeLessThanOrEqual(0.02 * 0.68 + 1e-9);
  });

  it("keeps the board tilt exact and samples every route cell in order", () => {
    const transformed = boardToWorld({ x: 0, y: 0, z: 20 });
    expect(transformed.x).toBe(0);
    expect(transformed.y).toBeCloseTo(-20 * Math.sin(Math.PI / 9), 12);
    expect(transformed.z).toBeCloseTo(20 * Math.cos(Math.PI / 9), 12);

    const track = createValidTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    expect(samples[0].cellIndex).toBe(0);
    expect(samples[samples.length - 1]?.cellIndex).toBe(39);
    expect(new Set(samples.map((sample) => sample.cellIndex)).size).toBe(36);
    expect(samples.some((sample, index) => index > 0 && sample.position.y > samples[index - 1].position.y)).toBe(false);
  });
});
