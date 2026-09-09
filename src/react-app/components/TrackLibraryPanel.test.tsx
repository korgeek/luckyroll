import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrackDesign } from "../designer/trackDesign";
import { TrackLibraryPanel } from "./TrackLibraryPanel";

const local = (id: string, name: string, updatedAt: number) => ({ ...createDefaultTrackDesign(name), id, updatedAt });
const handlers = () => ({ onBack: vi.fn(), onNew: vi.fn(), onEdit: vi.fn(), onSelect: vi.fn(), onPlay: vi.fn(), onShare: vi.fn(), onDelete: vi.fn(), onImport: vi.fn() });

describe("TrackLibraryPanel", () => {
	afterEach(cleanup);
	it("returns to the main menu", async () => {
		const h = handlers();
		render(<TrackLibraryPanel tracks={[]} {...h} />);
		await userEvent.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(h.onBack).toHaveBeenCalledOnce();
	});
	it("renders one card per saved track with short visible actions and UUID-only accessible names", async () => {
		const user = userEvent.setup();
		const onEdit = vi.fn();
		render(<TrackLibraryPanel tracks={[local("a", "Same", 2), local("b", "Same", 1)]} selectedTrackId="a" {...handlers()} onEdit={onEdit} />);
		const cards = screen.getAllByRole("listitem");
		expect(cards).toHaveLength(2);
		expect(within(cards[0]).getByText("Same")).toBeInTheDocument();
		expect(within(cards[0]).getAllByRole("button").map((button) => button.textContent)).toEqual(["Selected", "Edit", "Play", "Share", "Delete"]);
		expect(cards[0]).not.toHaveTextContent("Track ID");
		await user.click(screen.getByRole("button", { name: "Edit Same, track b" }));
		expect(onEdit).toHaveBeenCalledWith("b");
	});

	it("sorts custom tracks newest first and keeps 60초 트랙 selection separate", async () => {
		const h = handlers();
		render(<TrackLibraryPanel tracks={[local("old", "Old", 1), local("new", "New", 2)]} {...h} />);
		expect(screen.getAllByRole("listitem").map((item) => item.textContent?.startsWith("New"))).toEqual([true, false]);
		await userEvent.click(screen.getByRole("button", { name: "Selected 60초 트랙" }));
		expect(h.onSelect).toHaveBeenCalledWith(undefined);
	});

	it("keeps an invalid import in its modal with an actionable error", async () => {
		const user = userEvent.setup();
		const h = { ...handlers(), onImport: vi.fn(() => "That track code is invalid.") };
		render(<TrackLibraryPanel tracks={[]} {...h} />);
		await user.click(screen.getByRole("button", { name: "Import Track" }));
		await user.type(screen.getByLabelText("Import track"), "token");
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(h.onImport).toHaveBeenCalledWith("token");
		expect(screen.getByRole("alert")).toHaveTextContent("That track code is invalid.");
		expect(screen.getByLabelText("Import track")).toHaveValue("token");
	});

	it("returns focus to the import button when the modal closes", async () => {
		const user = userEvent.setup();
		render(<TrackLibraryPanel tracks={[]} {...handlers()} />);
		const open = screen.getByRole("button", { name: "Import Track" });
		await user.click(open);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(open).toHaveFocus();
	});
});
