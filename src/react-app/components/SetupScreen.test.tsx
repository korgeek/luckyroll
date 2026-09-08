import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupScreen } from "./SetupScreen";
import { createDefaultTrackDesign } from "../designer/trackDesign";
import appCss from "../App.css?raw";

describe("SetupScreen", () => {
	afterEach(cleanup);
	it("starts the race without legacy team mode fields", async () => {
		const user = userEvent.setup(); const onStart = vi.fn();
		render(<SetupScreen onStart={onStart} />);
		await user.clear(screen.getByLabelText("Player 1")); await user.type(screen.getByLabelText("Player 1"), "Jin");
		await user.clear(screen.getByLabelText("Player 2")); await user.type(screen.getByLabelText("Player 2"), "Mia");
		await user.type(screen.getByLabelText("Prize Pool"), "10000"); await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ prizePool: 10_000, participants: expect.arrayContaining([expect.objectContaining({ name: "Jin" }), expect.objectContaining({ name: "Mia" })]) }));
		expect(onStart.mock.calls[0][0]).not.toHaveProperty("mode");
		expect(onStart.mock.calls[0][0]).not.toHaveProperty("teamCount");
	});

	it("formats prize-pool digits without changing the submitted number", async () => {
		const user = userEvent.setup(); const onStart = vi.fn();
		render(<SetupScreen onStart={onStart} />);
		const prize = screen.getByLabelText("Prize Pool");
		await user.type(prize, "10000");
		expect(prize).toHaveValue("10,000");
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ prizePool: 10_000 }));
	});

	it("keeps prize-pool digit edits and caret movement stable around separators", async () => {
		const user = userEvent.setup(); render(<SetupScreen onStart={vi.fn()} />);
		const prize = screen.getByLabelText<HTMLInputElement>("Prize Pool");
		await user.type(prize, "10000"); await user.clear(prize);
		expect(prize).toHaveValue("");
		await user.paste("abc12,345xyz");
		expect(prize).toHaveValue("12,345");
		prize.focus(); prize.setSelectionRange(1, 1); await user.keyboard("9");
		expect(prize).toHaveValue("192,345"); expect(prize.selectionStart).toBe(2);
		await user.clear(prize); await user.type(prize, "12345"); prize.setSelectionRange(3, 5); await user.keyboard("9");
		expect(prize).toHaveValue("1,295"); expect(prize.selectionStart).toBe(4);
		prize.setSelectionRange(2, 2); await user.keyboard("{Backspace}");
		expect(prize).toHaveValue("295");
		await user.clear(prize); await user.type(prize, "1234"); prize.setSelectionRange(1, 1); await user.keyboard("{Delete}");
		expect(prize).toHaveValue("134");
	});

	it("restores separators after a comma-only native edit", async () => {
		const user = userEvent.setup(); render(<SetupScreen onStart={vi.fn()} />);
		const prize = screen.getByLabelText<HTMLInputElement>("Prize Pool");
		await user.type(prize, "12345");
		fireEvent.change(prize, { target: { value: "12345", selectionStart: 2 } });
		expect(prize).toHaveValue("12,345"); expect(prize.selectionStart).toBe(2);
	});

	it("uses a fixed 100-marble setup without count controls", async () => {
		const user = userEvent.setup(); const onStart = vi.fn();
		render(<SetupScreen onStart={onStart} />);
		expect(screen.queryByLabelText("Marbles")).not.toBeInTheDocument();
		expect(screen.getByText("100 marbles split as evenly as possible.")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		expect(onStart.mock.calls[0][0]).not.toHaveProperty("marbleCount");
	});

	it("identifies the first screen as the main menu", () => {
		render(<SetupScreen onStart={vi.fn()} />);
		expect(screen.getByRole("region", { name: "Main menu" })).toBeInTheDocument();
	});

	it("puts the animated start invitation before player inputs and honors reduced motion", () => {
		render(<SetupScreen onStart={vi.fn()} />);
		const start = screen.getByRole("button", { name: "START RACE · Default Track" });
		const firstPlayer = screen.getByLabelText("Player 1");
		expect(start).toHaveClass("setup-start");
		expect(start.compareDocumentPosition(firstPlayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(appCss).toMatch(/\.setup-start\{[^}]*animation:/);
		expect(appCss).toMatch(/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.setup-start\{animation:none\}/);
	});

	it("does not offer team split controls", () => {
		render(<SetupScreen onStart={vi.fn()} />);
		expect(screen.queryByRole("button", { name: "Team Split" })).not.toBeInTheDocument();
		expect(screen.queryByText(/teams/i)).not.toBeInTheDocument();
	});

	it("summarizes the selected track without rendering the track library", () => {
		render(<SetupScreen onStart={vi.fn()} tracks={[{ ...createDefaultTrackDesign("Garden Run"), id: "garden", updatedAt: 1 }]} selectedTrackId="garden" onManageTracks={vi.fn()} />);
		expect(screen.getByText("Garden Run")).toBeInTheDocument();
		expect(screen.getByText("1 saved track")).toBeInTheDocument();
		expect(screen.queryByRole("list", { name: "Saved tracks" })).not.toBeInTheDocument();
	});

	it("labels Start with the selected track and changes it from a compact picker", async () => {
		const user = userEvent.setup();
		const onSelectTrack = vi.fn();
		render(<SetupScreen onStart={vi.fn()} tracks={[{ ...createDefaultTrackDesign("Garden Run"), id: "garden", updatedAt: 1 }]} selectedTrackId="garden" onSelectTrack={onSelectTrack} />);
		expect(screen.getByRole("button", { name: "START RACE · Garden Run" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Change Track" }));
		expect(screen.getByRole("dialog", { name: "Choose a track" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Select Default Track" }));
		expect(onSelectTrack).toHaveBeenCalledWith(undefined);
	});
});
