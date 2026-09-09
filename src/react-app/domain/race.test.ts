import { describe, expect, it } from "vitest";
import { allocateMarbles, moneyCents, prizeByOwner, reverseRank } from "./race";
import type { Participant, RankedMarble } from "./types";

const players: Participant[] = [
	{ id: "a", name: "A", color: "#f0f", symbol: "●" },
	{ id: "b", name: "B", color: "#0ff", symbol: "▲" },
	{ id: "c", name: "C", color: "#ff0", symbol: "■" },
];

describe("race rules", () => {
	it("pays the winning player or three distinct players using whole shares and gives the winner the remainder", () => {
		const order = allocateMarbles(players);
		const rankings = reverseRank(order, Infinity);
		expect(prizeByOwner(rankings, 100.99, "winner")).toEqual({ c: 100.99 });
		expect(prizeByOwner(rankings, 100.99, "top3")).toEqual({ c: 34.99, b: 33, a: 33 });
		expect(prizeByOwner(rankings, 0.01, "top3")).toEqual({ c: 0.01, b: 0, a: 0 });
		expect(prizeByOwner(rankings.slice(0, 1), 100.99, "equal", players)).toEqual({ c: 34.99, a: 33, b: 33 });
		expect(prizeByOwner([], 100.99, "equal", players)).toEqual({});
		expect(moneyCents("999999999999.99")).toBe(99999999999999);
		expect(() => moneyCents("1.001")).toThrow();
		expect(() => moneyCents("-1")).toThrow();
	});
	it("splits 100 marbles with no more than one marble difference", () => {
		const marbles = allocateMarbles(players);
		expect(marbles.filter((marble) => marble.ownerId === "a")).toHaveLength(34);
		expect(marbles.filter((marble) => marble.ownerId === "b")).toHaveLength(33);
		expect(marbles.filter((marble) => marble.ownerId === "c")).toHaveLength(33);
	});
	it("makes the final finisher rank first and splits equally between players", () => {
		const finishOrder = [{ id: 1, ownerId: "a", color: "#f0f", symbol: "●" }, { id: 2, ownerId: "b", color: "#0ff", symbol: "▲" }, { id: 3, ownerId: "a", color: "#f0f", symbol: "●" }];
		expect(reverseRank(finishOrder).map((marble) => marble.rank)).toEqual([1, 2, 3]);
		const rankings: RankedMarble[] = [{ ...finishOrder[2], rank: 1, finishOrder: 3 }, { ...finishOrder[1], rank: 2, finishOrder: 2 }, { ...finishOrder[0], rank: 3, finishOrder: 1 }];
		expect(prizeByOwner(rankings, 1_000)).toEqual({ a: 500, b: 500 });
	});
});
