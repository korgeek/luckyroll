import { describe, expect, it } from "vitest";
import { applyRaceRushPulse, shouldStartRaceRush } from "./raceRush";

const ball = (id: number, progress: number, velocity: { x: number; y: number; z: number }) => {
  let current = velocity;
  return { value: { id, progress, done: false, eliminated: false, position: { x: progress, y: 0, z: 0 }, sampleIndex: 0, body: { linvel: () => current, setLinvel: (next: typeof current) => { current = next; } } }, velocity: () => current };
};

describe("race RUSH", () => {
  it("uses the half-field threshold and adds capped reverse-rank forward pulses", () => {
    const back = ball(1, 1, { x: 10, y: 2, z: -4 }); const front = ball(2, 9, { x: 41.8, y: 3, z: -5 });
    expect(shouldStartRaceRush(50, 100)).toBe(true);
    expect(shouldStartRaceRush(51, 100)).toBe(false);
    applyRaceRushPulse([front.value, back.value], [{ distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } }]);
    expect(back.velocity()).toEqual({ x: 13, y: 2, z: -4 });
    expect(front.velocity()).toEqual({ x: 42, y: 3, z: -5 });
  });

  it("uses actual route distance when same-sample marbles have reverse ID order", () => {
    const rear = ball(99, 5, { x: 10, y: 0, z: 0 }); const front = ball(1, 5, { x: 10, y: 0, z: 0 });
    rear.value.position = { x: 1, y: 0, z: 0 }; front.value.position = { x: 9, y: 0, z: 0 };
    applyRaceRushPulse([front.value, rear.value], [
      { distance: 0, position: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } },
      { distance: 10, position: { x: 10, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } },
    ]);
    expect(rear.velocity().x).toBe(13);
    expect(front.velocity().x).toBe(10.5);
  });
});
