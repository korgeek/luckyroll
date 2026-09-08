import { describe, expect, it } from "vitest";
import { createValidTrackDesign, createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";
import { assertValidTrackDesign } from "../../designer/trackValidation";
import {
  moduleWidthAt,
  sampleModulePath,
} from "./modulePath";
import { buildModuleGeometry, validateModuleGeometry } from "./moduleGeometry";

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const midpoint = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});
const directionVector = {
  north: { x: 0, y: 0, z: -1 }, east: { x: 1, y: 0, z: 0 }, south: { x: 0, y: 0, z: 1 }, west: { x: -1, y: 0, z: 0 },
} as const;
const opposite = (direction: keyof typeof directionVector): keyof typeof directionVector => ({
  north: "south", east: "west", south: "north", west: "east",
}[direction] as keyof typeof directionVector);
const add = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: { x: number; y: number; z: number }, amount: number) => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const normalize = (a: { x: number; y: number; z: number }) => scale(a, 1 / distance(a, { x: 0, y: 0, z: 0 }));
const portPosition = (cellIndex: number, direction: keyof typeof directionVector) => add(
  { x: (cellIndex % 5 + 0.5) * 20, y: 0, z: (Math.floor(cellIndex / 5) + 0.5) * 20 },
  scale(directionVector[direction], 10),
);
const circularCurvePoint = (p0: { x: number; y: number; z: number }, incoming: { x: number; y: number; z: number }, outgoing: { x: number; y: number; z: number }, localU: number) => {
  const angle = (localU - 0.1) / 0.8 * Math.PI / 2;
  return add(p0, add(scale(incoming, 8 * Math.sin(angle)), scale(outgoing, 8 * (1 - Math.cos(angle)))));
};
const analyticPoint = (cellIndex: number, kind: string, entry: keyof typeof directionVector, exit: keyof typeof directionVector, localU: number) => {
  const entryPort = portPosition(cellIndex, entry); const exitPort = portPosition(cellIndex, exit);
  const incoming = directionVector[opposite(entry)]; const outgoing = directionVector[exit];
  if (kind === "curve" && localU > 0.1 && localU < 0.9) {
    return circularCurvePoint(add(entryPort, scale(incoming, 2)), incoming, outgoing, localU);
  }
  if (kind === "wave" && localU > 0.1 && localU < 0.9) {
    const chord = normalize({ x: exitPort.x - entryPort.x, y: 0, z: exitPort.z - entryPort.z });
    const side = normalize({ x: -chord.z, y: 0, z: chord.x }); const u = (localU - 0.1) / 0.8;
    const offset = 0.15 * 12 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
    return add(add(entryPort, scale(chord, 20 * localU)), scale(side, offset));
  }
  return undefined;
};

describe("canonical modular module paths", () => {
  it("keeps every welded reciprocal seam and endpoint port descriptor", () => {
    const track = createValidTrackDesign();
    const route = assertValidTrackDesign(track);
    const samples = sampleModulePath(track, route);
    const seams = samples.filter((sample) => sample.ports?.length === 2);

    expect(seams).toHaveLength(route.route.length - 1);
    for (const seam of seams) expect(seam.ports).toHaveLength(2);
    const startExternal = samples.find((sample) => sample.cellIndex === 0 && sample.localU === 0)?.port;
    const finishExternal = samples.find((sample) => sample.cellIndex === 39 && sample.localU === 1)?.port;
    expect(startExternal?.direction).toBe("west");
    expect(finishExternal?.direction).toBe("east");

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

  it("samples the funnel waist and its 0.40S hold", () => {
    const track = createValidTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track)).filter((sample) => sample.cellIndex === 2);
	const waist = samples.filter((sample) => sample.width === 8.8);
    const taper = samples.filter((sample) => sample.localU > 0.1 && sample.localU < 0.45);

	expect(moduleWidthAt("funnel", 0.3)).toBeCloseTo(8.8, 12);
	expect(moduleWidthAt("funnel", 0.7)).toBeCloseTo(8.8, 12);
    expect(waist.some((sample) => Math.abs(sample.localU - 0.5) < 0.01)).toBe(true);
    expect(taper.length).toBeGreaterThan(2);
	expect(taper.some((sample) => sample.width > 8.8 && sample.width < 12)).toBe(true);
    expect(waist[waist.length - 1].distance - waist[0].distance).toBeGreaterThan(7);
    expect(moduleWidthAt("funnel", 0)).toBe(12);
    expect(moduleWidthAt("funnel", 1)).toBe(12);
  });

  it("keeps every curve at radius eight without folding the six-unit inner profile", () => {
    const track = createValidTrackDesign();
    const route = assertValidTrackDesign(track);
    const curves = sampleModulePath(track, route).filter((sample) => track.cells[sample.cellIndex]?.kind === "curve");
    for (const sample of curves.filter((item) => item.localU > 0.1 && item.localU < 0.9)) {
      const planarCurvature = Math.hypot(sample.centerlineCurvature.x, sample.centerlineCurvature.z) / Math.cos(7 * Math.PI / 180) ** 2;
      expect(planarCurvature).toBeCloseTo(1 / 8, 5);
      expect(1 / planarCurvature).toBeGreaterThan(12 / 2);
    }
  });

  it("keeps adaptive tangent turns and midpoint chord errors within bounds", () => {
    const track = createWorstCaseTrackDesign();
    const route = assertValidTrackDesign(track);
    const samples = sampleModulePath(track, route);
    const turns = samples.slice(1).map((sample, index) => Math.acos(Math.min(1, Math.max(-1, dot(samples[index].tangent, sample.tangent)))));
    const maxTurn = Math.max(...turns);
    const chordErrors = samples.slice(1).map((sample, index) => {
      const previous = samples[index];
      if (previous.cellIndex !== sample.cellIndex || previous.localU < 0.1 || sample.localU > 0.9) return 0;
      const step = route.route.find((candidate) => candidate.cellIndex === sample.cellIndex);
      const kind = track.cells[sample.cellIndex]?.kind;
      if (step === undefined || kind !== "curve" && kind !== "wave") return 0;
      const expected = analyticPoint(sample.cellIndex, kind, step.entry ?? "west", step.exit ?? "east", (previous.localU + sample.localU) / 2);
      const actual = midpoint(previous.position, sample.position);
      return expected === undefined ? 0 : Math.hypot(expected.x - actual.x, expected.z - actual.z);
      });
    const maxChordError = Math.max(...chordErrors);

    expect(maxTurn).toBeLessThanOrEqual(2 * Math.PI / 180 + 1e-9);
    expect(maxChordError).toBeLessThanOrEqual(0.02 * 0.68 + 1e-9);
  });

  it("grades every route direction downhill and banks only curve interiors", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));
    expect(samples[0].cellIndex).toBe(0);
    expect(samples[samples.length - 1]?.cellIndex).toBe(39);
    expect(new Set(samples.map((sample) => sample.cellIndex)).size).toBe(36);
    expect(samples.every((sample, index) => index === 0 || sample.position.y <= samples[index - 1].position.y + 1e-9)).toBe(true);
    for (const sample of samples) expect(sample.position.y).toBeCloseTo(-sample.distance * Math.sin(7 * Math.PI / 180), 10);
    for (const sample of samples.filter((item) => item.localU <= 0.1 || item.localU >= 0.9)) {
      expect(sample.bankRadians).toBeCloseTo(0, 10);
      expect(sample.up).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }));
    }
    const banked = samples.filter((sample) => track.cells[sample.cellIndex]?.kind === "curve" && sample.localU > 0.1 && sample.localU < 0.9);
    expect(Math.max(...banked.map((sample) => Math.abs(sample.bankRadians)))).toBeCloseTo(24 * Math.PI / 180, 2);
    for (const sample of samples.filter((item) => track.cells[item.cellIndex]?.kind === "straight")) {
      expect(sample.tangent.y).toBeLessThan(0);
      expect(Math.abs(sample.side.y)).toBeLessThan(1e-9);
    }
    expect(validateModuleGeometry(buildModuleGeometry(samples))).toEqual([]);
  }, 15_000);

  it("keeps worst-case graded and banked frames orthonormal", () => {
    const track = createWorstCaseTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track));

    for (const { tangent, side, up } of samples) {
      expect(distance(tangent, { x: 0, y: 0, z: 0 })).toBeCloseTo(1, 10);
      expect(distance(side, { x: 0, y: 0, z: 0 })).toBeCloseTo(1, 10);
      expect(distance(up, { x: 0, y: 0, z: 0 })).toBeCloseTo(1, 10);
      expect(dot(tangent, side)).toBeCloseTo(0, 10);
      expect(dot(tangent, up)).toBeCloseTo(0, 10);
      expect(dot(side, up)).toBeCloseTo(0, 10);
    }
  });
});
