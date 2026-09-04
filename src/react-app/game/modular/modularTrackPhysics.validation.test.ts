import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_VALIDATION_SEEDS, validateQualificationSeeds } from "../track/trackPhysics";
import { createWorstCaseTrackDesign } from "../../designer/trackDesign.testSupport";

const ledgerPath = resolve(process.cwd(), ".superpowers/sdd/2026-09-04-track-visuals-camera-editor/physics-run-ledger.md");
const ledgerRows = () => Array.from(readFileSync(ledgerPath, "utf8").matchAll(/^\|\s*(\d+)\s*\|\s*(pending|recorded)\s*\|/gm), ([, seed, state]) => ({ seed: Number(seed), state: state as "pending" | "recorded" }));
const runQualification = process.env.RUN_MODULAR_TRACK_QUALIFICATION === "1";

type ModularValidationResult = Readonly<{
  finishOrder: readonly number[];
  escapes: readonly unknown[];
  stalls: readonly unknown[];
  nonFinite: readonly unknown[];
  boosterCapViolations: readonly unknown[];
}>;
type ModularValidationRunner = (options: Readonly<{ track: ReturnType<typeof createWorstCaseTrackDesign>; seed: number; marbleCount: number; durationSeconds: number }>) => Promise<ModularValidationResult>;

const loadModularValidationRace = async (): Promise<ModularValidationRunner> => {
  const module = await import("./modularTrackPhysics");
  const run = (module as typeof module & { runModularValidationRace?: ModularValidationRunner }).runModularValidationRace;
  if (run === undefined) throw new Error("modularTrackPhysics must export runModularValidationRace before qualification.");
  return run;
};

describe.sequential("modular track physics qualification", () => {
  it("accepts only the pending canonical seed suffix", () => {
    const rows = ledgerRows();
    const recorded = rows.filter((row) => row.state === "recorded").map((row) => row.seed);
    const pending = rows.filter((row) => row.state === "pending").map((row) => row.seed);
    if (pending.length === 0) expect(() => validateQualificationSeeds(pending, recorded)).toThrow("already records every seed");
    else expect(validateQualificationSeeds(pending, recorded)).toEqual(FIXED_VALIDATION_SEEDS.slice(recorded.length));
  });

  it.runIf(runQualification)("runs each pending 100-marble seed exactly once", async () => {
    const rows = ledgerRows();
    const seeds = validateQualificationSeeds(rows.filter((row) => row.state === "pending").map((row) => row.seed), rows.filter((row) => row.state === "recorded").map((row) => row.seed));
    const run = await loadModularValidationRace();
    const results: ModularValidationResult[] = [];
    const errors: Readonly<{ seed: number; message: string }>[] = [];
    for (const seed of seeds) {
      try {
        const result = await run({ track: createWorstCaseTrackDesign(), seed, marbleCount: 100, durationSeconds: 60 });
        console.log(JSON.stringify({ seed, state: "recorded", finishers: result.finishOrder.length, escapes: result.escapes.length, stalls: result.stalls.length, nonFinite: result.nonFinite.length, capViolations: result.boosterCapViolations.length, result: "PASS" }));
        results.push(result);
      } catch (error) {
        const failure = { seed, message: error instanceof Error ? error.message : String(error) };
        console.log(JSON.stringify({ seed, state: "recorded", result: "ERROR", error: failure.message }));
        errors.push(failure);
      }
    }
    expect(errors).toEqual([]);
    expect(results.flatMap((result) => result.nonFinite)).toEqual([]);
    expect(results.flatMap((result) => result.escapes)).toEqual([]);
    expect(results.flatMap((result) => result.stalls)).toEqual([]);
    expect(results.flatMap((result) => result.boosterCapViolations)).toEqual([]);
    expect(results.every((result) => new Set(result.finishOrder).size === result.finishOrder.length)).toBe(true);
  }, 600_000);
});
