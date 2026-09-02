export type ColorBatch = { color: string; sourceIndexes: number[] };

export function createColorBatches<T extends { color: string }>(marbles: T[]): ColorBatch[] {
	const batches = new Map<string, number[]>();
	marbles.forEach((marble, index) => { const indexes = batches.get(marble.color) ?? []; indexes.push(index); batches.set(marble.color, indexes); });
	return [...batches.entries()].map(([color, sourceIndexes]) => ({ color, sourceIndexes }));
}
