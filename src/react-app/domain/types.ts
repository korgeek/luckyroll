export type Participant = { id: string; name: string; color: string; symbol: string };
export type Marble = { id: number; ownerId: string; color: string; symbol: string };
export type RankedMarble = Marble & { rank: number; finishOrder: number };
export type Team = { id: string; name: string; color: string; members: Participant[] };
