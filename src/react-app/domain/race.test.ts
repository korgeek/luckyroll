import { describe, expect, it } from "vitest";
import { allocateMarbles, moneyCents, prizeByOwner, reverseRank, topPlayerScores } from "./race";
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
		expect(prizeByOwner(rankings, 100.99, "top3")).toEqual({ c: 100.99 });
		expect(prizeByOwner(rankings, 0.01, "top3")).toEqual({ c: 0.01 });
		expect(prizeByOwner(rankings.slice(0, 1), 100.99, "equal", players)).toEqual({ c: 34.99, a: 33, b: 33 });
		expect(prizeByOwner([], 100.99, "equal", players)).toEqual({});
		expect(moneyCents("999999999999.99")).toBe(99999999999999);
		expect(() => moneyCents("1.001")).toThrow();
		expect(() => moneyCents("-1")).toThrow();
	});
	it("scores only the last ten marbles and pays the three highest point totals 6:3:1", () => {
		const rankings = ["a", "b", "b", "c", "c", "c", "a", "a", "a", "d", "d", "d"].map((ownerId, index) => ({ id: index + 1, ownerId, color: "#fff", symbol: "●", rank: index + 1, finishOrder: 12 - index }));
		expect(topPlayerScores(rankings)).toEqual([
			{ ownerId: "a", points: 19, bestRank: 1 }, { ownerId: "c", points: 18, bestRank: 4 }, { ownerId: "b", points: 17, bestRank: 2 }, { ownerId: "d", points: 1, bestRank: 10 },
		]);
		expect(prizeByOwner(rankings, 100.99, "top3")).toEqual({ a: 60.99, c: 30, b: 10 });
		expect(prizeByOwner(rankings, 0.01, "top3")).toEqual({ a: 0.01, c: 0, b: 0 });
	});
	it("lets accumulated points beat the last finisher and normalizes two eligible players to 6:3", () => {
		const rankings = ["a", "b", "b"].map((ownerId, index) => ({ id: index + 1, ownerId, color: "#fff", symbol: "●", rank: index + 1, finishOrder: 3 - index }));
		expect(topPlayerScores(rankings).map(({ ownerId, points }) => [ownerId, points])).toEqual([["b", 17], ["a", 10]]);
		expect(prizeByOwner(rankings, 100.99, "top3")).toEqual({ b: 67.99, a: 33 });
		expect(prizeByOwner(rankings, 100.99, "winner")).toEqual({ a: 100.99 });
	});
	it("breaks tied point totals by the best individual marble rank", () => {
		const rankings = [{ ownerId: "b", rank: 2 }, { ownerId: "b", rank: 10 }, { ownerId: "a", rank: 1 }].map((marble, index) => ({ ...marble, id: index + 1, color: "#fff", symbol: "●", finishOrder: 11 - marble.rank }));
		expect(topPlayerScores(rankings).map(({ ownerId, points }) => [ownerId, points])).toEqual([["a", 10], ["b", 10]]);
		expect(prizeByOwner(rankings, 80, "top3")).toEqual({ a: 54, b: 26 });
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
