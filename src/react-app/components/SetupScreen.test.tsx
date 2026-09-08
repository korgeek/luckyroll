import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SetupScreen } from "./SetupScreen";
import { createDefaultTrackDesign } from "../designer/trackDesign";

describe("SetupScreen", () => {
	it("starts a prize race using the entered player names", async () => {
		const user = userEvent.setup(); const onStart = vi.fn();
		render(<SetupScreen onStart={onStart} />);
		await user.clear(screen.getByLabelText("Player 1")); await user.type(screen.getByLabelText("Player 1"), "Jin");
		await user.clear(screen.getByLabelText("Player 2")); await user.type(screen.getByLabelText("Player 2"), "Mia");
		await user.type(screen.getByLabelText("Prize Pool"), "10000"); await user.click(screen.getByRole("button", { name: "START RACE" }));
		expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "race", prizePool: 10_000, participants: expect.arrayContaining([expect.objectContaining({ name: "Jin" }), expect.objectContaining({ name: "Mia" })]) }));
	});

	it("summarizes the selected track without rendering the track library", () => {
		render(<SetupScreen onStart={vi.fn()} tracks={[{ ...createDefaultTrackDesign("Garden Run"), id: "garden", updatedAt: 1 }]} selectedTrackId="garden" onManageTracks={vi.fn()} />);
		expect(screen.getByText("Garden Run")).toBeInTheDocument();
		expect(screen.getByText("1 saved track")).toBeInTheDocument();
		expect(screen.queryByRole("list", { name: "Saved tracks" })).not.toBeInTheDocument();
	});
});
