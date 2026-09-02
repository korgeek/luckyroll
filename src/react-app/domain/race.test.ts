import { describe, expect, it } from "vitest";
import { allocateMarbles, prizeByOwner, reverseRank } from "./race";
import type { Participant, RankedMarble } from "./types";

const players: Participant[] = [
	{ id: "a", name: "A", color: "#f0f", symbol: "●" },
	{ id: "b", name: "B", color: "#0ff", symbol: "▲" },
	{ id: "c", name: "C", color: "#ff0", symbol: "■" },
];

describe("race rules", () => {
	it("splits 100 marbles with no more than one marble difference", () => {
		const marbles = allocateMarbles(players);
		expect(marbles.filter((marble) => marble.ownerId === "a")).toHaveLength(34);
		expect(marbles.filter((marble) => marble.ownerId === "b")).toHaveLength(33);
		expect(marbles.filter((marble) => marble.ownerId === "c")).toHaveLength(33);
	});
	it("makes the final finisher rank first and sums multiple prizes for one owner", () => {
		const finishOrder = [{ id: 1, ownerId: "a", color: "#f0f", symbol: "●" }, { id: 2, ownerId: "b", color: "#0ff", symbol: "▲" }, { id: 3, ownerId: "a", color: "#f0f", symbol: "●" }];
		expect(reverseRank(finishOrder).map((marble) => marble.rank)).toEqual([1, 2, 3]);
		const rankings: RankedMarble[] = [{ ...finishOrder[2], rank: 1, finishOrder: 3 }, { ...finishOrder[1], rank: 2, finishOrder: 2 }, { ...finishOrder[0], rank: 3, finishOrder: 1 }];
		expect(prizeByOwner(rankings, 1_000)).toEqual({ a: 600, b: 200 });
	});
});
