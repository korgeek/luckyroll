import { expect } from "vitest";
import { runValidationRace } from "./trackPhysics";

export const validateSeedsTwice = async (seeds: readonly number[]): Promise<void> => {
  for (const run of [1, 2]) {
    for (const seed of seeds) {
      const result = await runValidationRace({ seed, marbleCount: 100, durationSeconds: 60 });
      const lastFinishMs = result.finishTimesMs[result.finishTimesMs.length - 1];

      console.info(
        `[track-physics] run=${run} seed=${seed} completed=${result.finishOrder.length} lastFinishMs=${lastFinishMs ?? "none"} escapes=${result.escapes.length} stalls=${result.stalls.length}`,
      );

      expect(result.escapes, `run ${run} seed ${seed}`).toEqual([]);
      expect(result.stalls, `run ${run} seed ${seed}`).toEqual([]);
      expect(new Set(result.finishOrder).size, `run ${run} seed ${seed}`).toBe(100);
      expect(result.finishOrder, `run ${run} seed ${seed}`).toHaveLength(100);
    }
  }
};
