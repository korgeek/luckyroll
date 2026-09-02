import { describe, expect, it } from "vitest";
import { createLaunchSlots, createLuckyRollTrackSpec } from "./trackSpec";

describe("Lucky Roll track specification", () => {
  it("orders the authoritative checkpoints from A through 12", () => {
    const checkpoints = createLuckyRollTrackSpec().nodes
      .flatMap((node) => (node.checkpoint ? [node.checkpoint] : []));
    expect(checkpoints).toEqual([
      "A",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("uses three descending height bands connected by descent nodes", () => {
    const spec = createLuckyRollTrackSpec();
    expect(
      new Set(spec.nodes.flatMap((node) => (node.level ? [node.level] : []))),
    ).toEqual(new Set([1, 2, 3]));
    expect(spec.nodes.filter((node) => node.zone === "descent")).toHaveLength(2);
    expect(
      spec.nodes.every(
        (node, index) =>
          index === 0 || node.position.y < spec.nodes[index - 1].position.y,
      ),
    ).toBe(true);
  });

  it("fits 100 simultaneous starts inside the launch U-channel", () => {
    const slots = createLaunchSlots(100);
    expect(slots).toHaveLength(100);
    expect(new Set(slots.map((slot) => `${slot.x}:${slot.z}`)).size).toBe(100);
    expect(slots.every((slot) => Math.abs(slot.crossOffset) <= 8.1)).toBe(true);
  });
});
