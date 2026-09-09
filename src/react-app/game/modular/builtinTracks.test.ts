import { expect, it } from "vitest";
import { BUILTIN_TRACKS } from "../../designer/trackDesign";
import { buildModularTrack } from "./modularTrackBuild";
import { runModularValidationRace } from "./modularTrackPhysics";

it.each(BUILTIN_TRACKS.flatMap((preset) => [
  { ...preset, seed: 23, marbleCount: 100 },
  { ...preset, seed: 71, marbleCount: 50 },
]))("finishes $track.name with $marbleCount marbles (seed $seed) within its preset time budget", async ({ id, track, seed, marbleCount }) => {
  const built = buildModularTrack(track);
  if (id === "builtin-30") {
    expect(built.route.route.slice(-5).map(({ cellIndex }) => track.cells[cellIndex]?.kind))
      .toEqual(["curve", "booster", "booster", "bumper", "finish"]);
    const devices = built.route.route.map(({ cellIndex }) => track.cells[cellIndex]?.kind)
      .filter((kind) => kind && !["start", "finish", "straight", "curve"].includes(kind));
    expect(devices).toEqual(["wave", "funnel", "pinwheel", "wave", "funnel", "booster", "booster", "bumper"]);
  }
  const result = await runModularValidationRace({ track, seed, marbleCount, durationSeconds: 90, rush: true });
  const lastFinishMs = result.finishTimesMs[result.finishTimesMs.length - 1];
  console.info(track.name, JSON.stringify({ seed, marbleCount, finished: result.finishOrder.length, firstFinishMs: result.finishTimesMs[0], lastFinishMs, stalls: result.stalls, escapes: result.escapes }));
  expect(result.finishOrder).toHaveLength(marbleCount);
  expect(lastFinishMs).toBeLessThanOrEqual(id ? 60_000 : 90_000);
  expect(result.escapes).toEqual([]);
  expect(result.stalls).toEqual([]);
  expect(result.nonFinite).toEqual([]);
  expect(result.boosterCapViolations).toEqual([]);
}, 300_000);
