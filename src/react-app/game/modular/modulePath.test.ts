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
const quintic = (p0: number, p1: number, d0: number, d1: number, t: number): number => {
  const t2 = t * t; const t3 = t2 * t; const t4 = t3 * t; const t5 = t4 * t;
  return p0 * (1 - 10 * t3 + 15 * t4 - 6 * t5) + d0 * (t - 6 * t3 + 8 * t4 - 3 * t5)
    + p1 * (10 * t3 - 15 * t4 + 6 * t5) + d1 * (-4 * t3 + 7 * t4 - 3 * t5);
};
const analyticPoint = (cellIndex: number, kind: string, entry: keyof typeof directionVector, exit: keyof typeof directionVector, localU: number) => {
  const entryPort = portPosition(cellIndex, entry); const exitPort = portPosition(cellIndex, exit);
  const incoming = directionVector[opposite(entry)]; const outgoing = directionVector[exit];
  if (kind === "curve" && localU > 0.1 && localU < 0.9) {
    const p0 = add(entryPort, scale(incoming, 2)); const p1 = add(exitPort, scale(outgoing, -2));
    const d0 = scale(incoming, 16); const d1 = scale(outgoing, 16); const t = (localU - 0.1) / 0.8;
    return boardToWorld({
      x: quintic(p0.x, p1.x, d0.x, d1.x, t), y: quintic(p0.y, p1.y, d0.y, d1.y, t), z: quintic(p0.z, p1.z, d0.z, d1.z, t),
    });
  }
  if (kind === "wave" && localU > 0.1 && localU < 0.9) {
    const chord = normalize({ x: exitPort.x - entryPort.x, y: 0, z: exitPort.z - entryPort.z });
    const side = normalize({ x: -chord.z, y: 0, z: chord.x }); const u = (localU - 0.1) / 0.8;
    const offset = 0.15 * 12 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
    return boardToWorld(add(add(entryPort, scale(chord, 20 * localU)), scale(side, offset)));
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

  it("samples the funnel waist and its 0.10S hold", () => {
    const track = createValidTrackDesign();
    const samples = sampleModulePath(track, assertValidTrackDesign(track)).filter((sample) => sample.cellIndex === 2);
    const waist = samples.filter((sample) => sample.width === 9.6);
    const taper = samples.filter((sample) => sample.localU > 0.1 && sample.localU < 0.45);

    expect(moduleWidthAt("funnel", 0.45)).toBeCloseTo(9.6, 12);
    expect(moduleWidthAt("funnel", 0.55)).toBeCloseTo(9.6, 12);
    expect(waist.map((sample) => sample.localU)).toEqual(expect.arrayContaining([0.45, 0.5, 0.55]));
    expect(taper.length).toBeGreaterThan(2);
    expect(taper.some((sample) => sample.width > 9.6 && sample.width < 12)).toBe(true);
    expect(waist[waist.length - 1].distance - waist[0].distance).toBeCloseTo(2, 6);
    expect(moduleWidthAt("funnel", 0)).toBe(12);
    expect(moduleWidthAt("funnel", 1)).toBe(12);
  });

  it("keeps adaptive tangent turns and midpoint chord errors within bounds", () => {
    const track = createWorstCaseTrackDesign();
    const route = assertValidTrackDesign(track);
    const samples = sampleModulePath(track, route);
    const turns = samples.slice(1).map((sample, index) => Math.acos(Math.min(1, Math.max(-1, dot(samples[index].tangent, sample.tangent)))));
    const maxTurn = Math.max(...turns);
    const chordErrors = samples.slice(1).map((sample, index) => {
      const previous = samples[index];
      if (previous.cellIndex !== sample.cellIndex || previous.localU <= 0.1 || sample.localU >= 0.9) return 0;
      const step = route.route.find((candidate) => candidate.cellIndex === sample.cellIndex);
      const kind = track.cells[sample.cellIndex]?.kind;
      if (step === undefined || kind !== "curve" && kind !== "wave") return 0;
      const expected = analyticPoint(sample.cellIndex, kind, step.entry ?? "west", step.exit ?? "east", (previous.localU + sample.localU) / 2);
      return expected === undefined ? 0 : distance(expected, midpoint(previous.position, sample.position));
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
