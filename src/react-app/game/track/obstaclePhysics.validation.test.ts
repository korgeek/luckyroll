import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_VALIDATION_SEEDS, runObstacleValidationRace, validateObstacleQualificationSeeds } from "./trackPhysics";

const ledgerPath = resolve(process.cwd(), ".superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md");
const ledgerRows = () => Array.from(readFileSync(ledgerPath, "utf8").matchAll(/^\|\s*(\d+)\s*\|\s*(pending|recorded)\s*\|/gm), ([, seed, state]) => ({ seed: Number(seed), state }));
const runQualification = process.env.RUN_OBSTACLE_QUALIFICATION === "1";

describe.sequential("neon obstacle physics qualification", () => {
  it("refuses unknown, duplicate, or re-recorded seeds while allowing exactly the ledger's pending suffix", () => {
    expect(() => validateObstacleQualificationSeeds([...FIXED_VALIDATION_SEEDS.slice(0, 9), 999])).toThrow("ten fixed seeds");
    expect(() => validateObstacleQualificationSeeds([...FIXED_VALIDATION_SEEDS.slice(0, 9), FIXED_VALIDATION_SEEDS[0]])).toThrow("unique");
    expect(() => validateObstacleQualificationSeeds(FIXED_VALIDATION_SEEDS, [FIXED_VALIDATION_SEEDS[0]])).toThrow("already records");
    expect(validateObstacleQualificationSeeds(FIXED_VALIDATION_SEEDS.slice(1), [FIXED_VALIDATION_SEEDS[0]])).toEqual(FIXED_VALIDATION_SEEDS.slice(1));
  });

  it("reads precisely the ledger's pending seeds without repeating the recorded seed", () => {
    const rows = ledgerRows();
    const seeds = rows.filter((row) => row.state === "pending").map((row) => row.seed);
    const recorded = rows.filter((row) => row.state === "recorded").map((row) => row.seed);
    if (seeds.length === 0) expect(() => validateObstacleQualificationSeeds(seeds, recorded)).toThrow("already records every seed");
    else expect(validateObstacleQualificationSeeds(seeds, recorded)).toEqual(FIXED_VALIDATION_SEEDS.slice(recorded.length));
  });

  it.runIf(runQualification)("runs every pending seed once before asserting aggregate containment, movement, and finisher identity", async () => {
    const rows = ledgerRows();
    const seeds = validateObstacleQualificationSeeds(rows.filter((row) => row.state === "pending").map((row) => row.seed), rows.filter((row) => row.state === "recorded").map((row) => row.seed));
    const results: Awaited<ReturnType<typeof runObstacleValidationRace>>[] = [];
    const runErrors: string[] = [];
    for (const seed of seeds) {
      try {
        const result = await runObstacleValidationRace({ seed, durationSeconds: 60 });
        results.push(result);
        console.info(`QUALIFICATION seed=${seed} finishers=${result.finishOrder.length} elapsed=${result.finishTimesMs[result.finishTimesMs.length - 1] ?? "—"} escapes=${result.escapes.length} stalls=${result.stalls.length} unique=${new Set(result.finishOrder).size === result.finishOrder.length}`);
      } catch (error) {
        runErrors.push(`seed ${seed}: ${error instanceof Error ? error.message : String(error)}`);
        console.info(`QUALIFICATION seed=${seed} ERROR=${runErrors[runErrors.length - 1]}`);
      }
    }
    expect(runErrors).toEqual([]);
    expect(results).toHaveLength(seeds.length);
    expect(results.flatMap((result) => result.escapes)).toEqual([]);
    expect(results.flatMap((result) => result.stalls)).toEqual([]);
    expect(results.every((result) => new Set(result.finishOrder).size === result.finishOrder.length)).toBe(true);
  }, 600_000);
});
