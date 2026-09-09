import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LiveStanding } from "../game/MarbleRaceScene";
import appCss from "../App.css?raw";
import { RaceHud } from "./RaceHud";
import { RANK_POINTS } from "../domain/race";

const participants = [
	{ id: "a", name: "Ari", color: "#f00", symbol: "◆" },
	{ id: "b", name: "Bea", color: "#0ff", symbol: "●" },
];
const standings: LiveStanding[] = [
	{ marble: { id: 8, ownerId: "a", color: "#f00", symbol: "◆" }, gap: 0 },
	{ marble: { id: 3, ownerId: "b", color: "#0ff", symbol: "●" }, gap: 4.25 },
];

afterEach(cleanup);

describe("RaceHud", () => {
	it("projects live player points from active marbles followed by reverse finishers, without duplicates", () => {
		const finished = [standings[1].marble, { ...standings[1].marble, id: 4 }, standings[0].marble];
		const active = { ...standings[1], marble: { ...standings[1].marble, id: 5 } };
		const { rerender } = render(<RaceHud payoutMode="top3" elapsedMs={2000} fps={60} eliminatedCount={0} total={100} standings={[active, standings[0]]} finished={finished} participants={participants} />);
		expect(screen.getByLabelText("Live provisional player points")).toHaveTextContent("LIVE · POINTS · TOP 3");
		expect(screen.getByText("PROVISIONAL")).toBeInTheDocument();
		const bea = screen.getByText("Bea").closest("li");
		expect(bea).toHaveTextContent(`${RANK_POINTS[0] + RANK_POINTS[2] + RANK_POINTS[3]} PTS`);
		expect(screen.getByText("Ari").closest("li")).toHaveTextContent(`${RANK_POINTS[1]} PTS`);
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
		expect(screen.queryByText("WINNING")).not.toBeInTheDocument();
		rerender(<RaceHud payoutMode="top3" elapsedMs={3000} fps={60} eliminatedCount={0} total={100} standings={[]} finished={[...finished, active.marble]} participants={participants} />);
		expect(screen.getByText("Bea").closest("li")).toBe(bea);
		expect(bea).toHaveTextContent(`${RANK_POINTS[0] + RANK_POINTS[2] + RANK_POINTS[3]} PTS`);
	});

	it("limits projected scoring to ten marbles and shows only the top three players", () => {
		const players = [...participants, { ...participants[0], id: "c", name: "Cleo" }, { ...participants[1], id: "d", name: "Dara" }, { ...participants[0], id: "e", name: "Excluded" }];
		const live = Array.from({ length: 11 }, (_, index) => ({ marble: { ...standings[0].marble, id: index + 1, ownerId: index === 10 ? "e" : index < 3 ? players[index].id : "d" }, gap: index }));
		render(<RaceHud payoutMode="top3" elapsedMs={2000} fps={60} eliminatedCount={0} total={100} standings={live} finished={[]} participants={players} />);
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
		expect(screen.queryByText("Excluded")).not.toBeInTheDocument();
		expect(screen.getByText("Dara").closest("li")).toHaveTextContent(`${RANK_POINTS.slice(3).reduce((sum, points) => sum + points, 0)} PTS`);
		expect(screen.getByRole("list")).toHaveStyle({ height: "66px" });
	});

	it.each(["winner", "equal"] as const)("preserves the marble standings in %s mode", (payoutMode) => {
		render(<RaceHud payoutMode={payoutMode} elapsedMs={2000} fps={60} eliminatedCount={0} total={100} standings={standings} finished={[]} participants={participants} />);
		expect(screen.getByText("TOP 10")).toBeInTheDocument();
		expect(screen.getByText("Ari · #8")).toBeInTheDocument();
		expect(screen.queryByText("PROVISIONAL")).not.toBeInTheDocument();
	});

	it("shows reverse standings and preserves keyed rows when places swap", () => {
		const { rerender } = render(<RaceHud elapsedMs={1234} fps={59.7} eliminatedCount={1} total={100} standings={standings} finished={[]} participants={participants} />);
		const marbleEight = screen.getByText("Ari · #8").closest("li");
		expect(screen.getByText("WINNING")).toBeInTheDocument();
		expect(screen.getByText("TOP 10")).toBeInTheDocument();
		expect(screen.getByText("60 FPS")).toBeInTheDocument();
		expect(screen.getByText("+4.3u")).toBeInTheDocument();
		expect(marbleEight).toHaveStyle({ transform: "translateY(0px)" });

		rerender(<RaceHud elapsedMs={2000} fps={58.4} eliminatedCount={1} total={100} standings={[{ ...standings[1], gap: 0 }, { ...standings[0], gap: 2 }]} finished={[]} participants={participants} />);
		expect(screen.getByText("Ari · #8").closest("li")).toBe(marbleEight);
		expect(marbleEight).toHaveStyle({ transform: "translateY(22px)" });
		expect(screen.getByText("DONE 0/100")).toBeInTheDocument();
		expect(screen.queryByText(/LEADING|LAST:/)).not.toBeInTheDocument();
	});

	it("removes stale active duplicates, rebases gaps, and appends real reverse-ranked finishers", () => {
		render(<RaceHud elapsedMs={2000} fps={60} eliminatedCount={0} total={100} standings={[{ ...standings[0], gap: 3 }, { ...standings[1], gap: 7.25 }]} finished={[standings[0].marble]} participants={participants} />);
		expect(screen.getAllByText("Ari · #8")).toHaveLength(1);
		expect(screen.getByText("Bea · #3").closest("li")).toHaveTextContent("WINNING");
		expect(screen.getByText("Ari · #8").closest("li")).toHaveTextContent("FIN");
		expect(screen.queryByText("+4.3u")).not.toBeInTheDocument();
		expect(screen.getByText("DONE 1/100")).toBeInTheDocument();
	});

	it("shows only the latest ten finishers in reverse finish order", () => {
		const finished = Array.from({ length: 12 }, (_, index) => ({ ...standings[index % 2].marble, id: index + 1 }));
		render(<RaceHud elapsedMs={2000} fps={60} eliminatedCount={0} total={100} standings={[]} finished={finished} participants={participants} />);
		const rows = screen.getAllByRole("listitem");
		expect(rows).toHaveLength(10);
		expect(rows[0]).toHaveTextContent("#12FIN");
		expect(rows[9]).toHaveTextContent("#3FIN");
		expect(screen.queryByText(/#2$/)).not.toBeInTheDocument();
	});

	it("crops the live board to ten rows, or five on portrait phones", () => {
		expect(appCss).toMatch(/\.live-standings ol\{[^}]*height:220px/);
		expect(appCss).toMatch(/@media \(orientation:portrait\) and \(max-width:767px\)\{\.live-standings ol\{height:110px\}/);
		expect(appCss).toContain(".standings-phone-title{display:none}");
		expect(appCss).toContain(".standings-desktop-title{display:none}.standings-phone-title{display:inline}");
		expect(appCss).toContain(".race-hud .hud-bottom{flex-direction:column;align-items:flex-end;gap:4px}");
		expect(appCss).toContain(".live-standings li:nth-child(n+6){visibility:hidden}");
		expect(appCss).toContain(".boost-dock");
		expect(appCss).toContain("height:var(--boost-fill)");
	});
});
