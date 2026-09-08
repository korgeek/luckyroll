import type { Marble, Participant, RankedMarble } from "./types";

const PRIZE_SHARES = [0.5, 0.2, 0.1, 0.05, 0.05, 0.05, 0.05];

export function allocateMarbles(participants: Participant[], total = 100): Marble[] {
	if (participants.length < 2 || participants.length > 10) throw new Error("Race needs 2 to 10 players.");
	const base = Math.floor(total / participants.length);
	const extras = total % participants.length;
	let id = 1;
	return participants.flatMap((participant, index) => Array.from({ length: base + (index < extras ? 1 : 0) }, () => ({ id: id++, ownerId: participant.id, color: participant.color, symbol: participant.symbol })));
}

export function reverseRank(finishOrder: readonly Marble[]): RankedMarble[] {
	return [...finishOrder].reverse().slice(0, 10).map((marble, index) => ({ ...marble, rank: index + 1, finishOrder: finishOrder.length - index }));
}

export function prizeByOwner(rankings: RankedMarble[], pool: number): Record<string, number> {
	return rankings.reduce<Record<string, number>>((prizes, marble) => {
		prizes[marble.ownerId] ??= 0;
		prizes[marble.ownerId] += pool * (PRIZE_SHARES[marble.rank - 1] ?? 0);
		return prizes;
	}, {});
}

export function remainingMarbles(all: Marble[], finished: Marble[]) {
	const done = new Set(finished.map((marble) => marble.id));
	return all.filter((marble) => !done.has(marble.id));
}
