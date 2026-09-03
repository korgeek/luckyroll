import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_VALIDATION_SEEDS, runObstacleValidationRace, validateObstacleQualificationSeeds } from "./trackPhysics";

const ledgerPath = resolve(process.cwd(), ".superpowers/sdd/2026-09-03-neon-obstacle-race/physics-run-ledger.md");
const ledgerRows = () => Array.from(readFileSync(ledgerPath, "utf8").matchAll(/^\|\s*(\d+)\s*\|\s*(pending|recorded)\s*\|/gm), ([, seed, state]) => ({ seed: Number(seed), state }));
const runQualification = process.env.RUN_OBSTACLE_QUALIFICATION === "1";

describe.sequential("neon obstacle physics qualification", () => {
  it("refuses unknown, duplicate, or already-recorded seed plans before stepping a world", () => {
    expect(() => validateObstacleQualificationSeeds([...FIXED_VALIDATION_SEEDS.slice(0, 9), 999])).toThrow("ten fixed seeds");
    expect(() => validateObstacleQualificationSeeds([...FIXED_VALIDATION_SEEDS.slice(0, 9), FIXED_VALIDATION_SEEDS[0]])).toThrow("ten fixed seeds");
    expect(() => validateObstacleQualificationSeeds(FIXED_VALIDATION_SEEDS, [FIXED_VALIDATION_SEEDS[0]])).toThrow("already records");
  });

  it("reads a ledger that blocks any second qualification command after a recorded seed", () => {
    const rows = ledgerRows();
    const seeds = rows.map((row) => row.seed);
    const recorded = rows.filter((row) => row.state === "recorded").map((row) => row.seed);
    if (recorded.length === 0) expect(validateObstacleQualificationSeeds(seeds, recorded)).toEqual(FIXED_VALIDATION_SEEDS);
    else expect(() => validateObstacleQualificationSeeds(seeds, recorded)).toThrow("already records");
  });

  it.runIf(runQualification)("runs every fixed seed once and reports containment, movement, and finisher identity", async () => {
    const rows = ledgerRows();
    const seeds = validateObstacleQualificationSeeds(rows.map((row) => row.seed), rows.filter((row) => row.state === "recorded").map((row) => row.seed));
    for (const seed of seeds) {
      const result = await runObstacleValidationRace({ seed, durationSeconds: 60 });
      console.info(`QUALIFICATION seed=${seed} finishers=${result.finishOrder.length} elapsed=${result.finishTimesMs[result.finishTimesMs.length - 1] ?? "—"} escapes=${result.escapes.length} stalls=${result.stalls.length} unique=${new Set(result.finishOrder).size === result.finishOrder.length}`);
      expect(result.escapes, `seed ${seed} escapes`).toEqual([]);
      expect(result.stalls, `seed ${seed} stalls`).toEqual([]);
      expect(new Set(result.finishOrder).size, `seed ${seed} finisher identities`).toBe(result.finishOrder.length);
    }
  }, 600_000);
});
