// Frame-rate hysteresis only changes rendering quality; simulation time is untouched.
export const createAdaptiveQuality = (maxLevel = 2) => {
  let level = 0;
  let elapsed = 0; let frames = 0;
  let slowMs = 0; let recoveredMs = 0;
  let warmupMs = 1000;
  const resetWindow = () => { elapsed = 0; frames = 0; slowMs = 0; recoveredMs = 0; warmupMs = 1000; };
  return {
    reset() { level = 0; resetWindow(); },
    sample(frameMs: number, eligible: boolean) {
      // Pauses, background tabs and loading stalls must never lower quality.
      if (!eligible || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) { resetWindow(); return level; }
      if (warmupMs > 0) { warmupMs -= frameMs; return level; }
      elapsed += frameMs; frames += 1;
      if (elapsed < 500) return level;
      const fps = frames * 1000 / elapsed;
      slowMs = fps < 45 ? slowMs + elapsed : 0;
      recoveredMs = fps >= 57 ? recoveredMs + elapsed : 0;
      if (slowMs >= 2000 && level < maxLevel) { level += 1; resetWindow(); }
      else if (recoveredMs >= 10000 && level > 0) { level -= 1; resetWindow(); }
      elapsed = 0; frames = 0;
      return level;
    },
  };
};
