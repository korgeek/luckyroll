import type { RandomSource } from "./seed";
import type { Participant, Team } from "./types";

const TEAM_META = [{ id: "pink", name: "TEAM PINK", color: "#ff4f8f" }, { id: "cyan", name: "TEAM CYAN", color: "#58e7ff" }, { id: "gold", name: "TEAM GOLD", color: "#ffcf58" }];

export function splitTeams(participants: Participant[], teamCount: 2 | 3, random: RandomSource): Team[] {
	const members = [...participants];
	for (let index = members.length - 1; index > 0; index -= 1) { const swap = Math.floor(random.next() * (index + 1)); [members[index], members[swap]] = [members[swap], members[index]]; }
	return TEAM_META.slice(0, teamCount).map((team, teamIndex) => ({ ...team, members: members.filter((_, index) => index % teamCount === teamIndex) }));
}
