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
    expect(spec.nodes[0].position.y - spec.nodes[spec.nodes.length - 1].position.y).toBeGreaterThanOrEqual(75);
  });

  it("keeps checkpoint membership in separated descending level bands", () => {
    const checkpoints = createLuckyRollTrackSpec().nodes.filter(
      (node): node is typeof node & { checkpoint: NonNullable<typeof node.checkpoint>; level: NonNullable<typeof node.level> } =>
        node.checkpoint !== undefined && node.level !== undefined,
    );
    expect(Object.fromEntries(checkpoints.map((node) => [node.checkpoint, node.level]))).toEqual({
      A: 3,
      1: 3,
      2: 3,
      3: 3,
      4: 3,
      5: 2,
      6: 2,
      7: 2,
      8: 2,
      9: 1,
      10: 1,
      11: 1,
      12: 1,
    });

    const heightsFor = (level: 1 | 2 | 3): number[] =>
      checkpoints.filter((node) => node.level === level).map((node) => node.position.y);
    const upper = heightsFor(3);
    const middle = heightsFor(2);
    const lower = heightsFor(1);
    expect(Math.min(...upper) - Math.max(...middle)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...middle) - Math.max(...lower)).toBeGreaterThanOrEqual(1);
  });

  it("fits 100 simultaneous starts inside the launch U-channel", () => {
    const slots = createLaunchSlots(100);
    expect(slots).toHaveLength(100);
    expect(new Set(slots.map((slot) => `${slot.x}:${slot.z}`)).size).toBe(100);
    expect(slots.every((slot) => Math.abs(slot.crossOffset) <= 8.1)).toBe(true);
  });

  it("keeps every non-launch channel proportional to the rescaled route", () => {
    const normalWidths = createLuckyRollTrackSpec().nodes
      .filter((node) => node.zone !== "launch")
      .map((node) => node.width);

    expect(Math.max(...normalWidths)).toBeLessThanOrEqual(8);
  });

  it("keeps ten launch columns separated inside the widened entry bay", () => {
    const spec = createLuckyRollTrackSpec();
    const launchWidth = spec.nodes[0].width;
    const columns = createLaunchSlots(100).filter((slot) => slot.row === 0);
    const clearance = Math.min(...columns.map((slot) => launchWidth / 2 - Math.abs(slot.crossOffset)));

    expect(columns).toHaveLength(10);
    expect(clearance).toBeGreaterThanOrEqual(0.34);
    expect(new Set(columns.map((slot) => slot.crossOffset)).size).toBe(10);
    expect(Math.min(...columns.slice(1).map((slot, index) => slot.crossOffset - columns[index].crossOffset))).toBeGreaterThanOrEqual(0.68);
  });
});
