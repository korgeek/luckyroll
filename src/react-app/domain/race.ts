import type { Marble, Participant, RankedMarble } from "./types";

export type PayoutMode = "winner" | "top3" | "equal";
export const PAYOUT_MODES: { id: PayoutMode; label: string }[] = [{ id: "winner", label: "Winner Takes All" }, { id: "top3", label: "Top 3 Split" }, { id: "equal", label: "Equal Split" }];
export const formatMoney = (amount: number): string => amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function moneyCents(value: string): number {
	if (!/^\d{1,12}(\.\d{0,2})?$/.test(value)) throw new Error("Enter an amount with up to 12 whole digits and 2 decimal digits.");
	const [whole, fraction = ""] = value.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function allocateMarbles(participants: Participant[], total = 100): Marble[] {
	if (participants.length < 2 || participants.length > 10) throw new Error("Race needs 2 to 10 players.");
	const base = Math.floor(total / participants.length);
	const extras = total % participants.length;
	let id = 1;
	return participants.flatMap((participant, index) => Array.from({ length: base + (index < extras ? 1 : 0) }, () => ({ id: id++, ownerId: participant.id, color: participant.color, symbol: participant.symbol })));
}

export function reverseRank(finishOrder: readonly Marble[], limit = 10): RankedMarble[] {
	return [...finishOrder].reverse().slice(0, limit).map((marble, index) => ({ ...marble, rank: index + 1, finishOrder: finishOrder.length - index }));
}

export function topPlayerScores(rankings: readonly RankedMarble[]) {
	const scores = new Map<string, { ownerId: string; points: number; bestRank: number }>();
	for (const { ownerId, rank } of rankings) {
		if (rank < 1 || rank > 10) continue;
		const score = scores.get(ownerId) ?? { ownerId, points: 0, bestRank: rank };
		score.points += 11 - rank; score.bestRank = Math.min(score.bestRank, rank); scores.set(ownerId, score);
	}
	return [...scores.values()].sort((a, b) => b.points - a.points || a.bestRank - b.bestRank);
}

export function prizeByOwner(rankings: RankedMarble[], pool: number, mode: PayoutMode = "equal", participants: Participant[] = []): Record<string, number> {
	const cents = moneyCents(String(pool));
	if (mode === "top3") {
		const winners = topPlayerScores(rankings).slice(0, 3);
		const weights = [5, 3, 1].slice(0, winners.length); const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		const shares = weights.map((weight) => Math.floor(Math.floor(cents / 100) * weight / totalWeight) * 100);
		const remainder = cents - shares.reduce((sum, share) => sum + share, 0);
		return Object.fromEntries(winners.map(({ ownerId }, index) => [ownerId, (shares[index] + (index === 0 ? remainder : 0)) / 100]));
	}
	const rankedOwners = [...new Set(rankings.map(({ ownerId }) => ownerId))];
	if (!rankedOwners.length) return {};
	const owners = mode === "equal" ? [...new Set([...rankedOwners, ...participants.map(({ id }) => id)])] : rankedOwners.slice(0, 1);
	const share = Math.floor(Math.floor(cents / 100) / owners.length) * 100;
	return Object.fromEntries(owners.map((owner, index) => [owner, (share + (index === 0 ? cents - share * owners.length : 0)) / 100]));
}

export function remainingMarbles(all: Marble[], finished: Marble[]) {
	const done = new Set(finished.map((marble) => marble.id));
	return all.filter((marble) => !done.has(marble.id));
}
