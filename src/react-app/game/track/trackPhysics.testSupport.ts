import { expect } from "vitest";
import { runValidationRace } from "./trackPhysics";

export const validateSeedsTwice = async (seeds: readonly number[], features = false): Promise<void> => {
  for (const run of [1, 2]) {
    for (const seed of seeds) {
      const result = await runValidationRace({ seed, marbleCount: 100, durationSeconds: 60, features });

      expect(result.escapes, `run ${run} seed ${seed}`).toEqual([]);
      expect(result.stalls, `run ${run} seed ${seed}`).toEqual([]);
      expect(new Set(result.finishOrder).size, `run ${run} seed ${seed}`).toBe(100);
      expect(result.finishOrder, `run ${run} seed ${seed}`).toHaveLength(100);
    }
  }
};
