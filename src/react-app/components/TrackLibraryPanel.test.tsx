import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrackDesign } from "../designer/trackDesign";
import { TrackLibraryPanel } from "./TrackLibraryPanel";

const local = (id: string, name: string, updatedAt: number) => ({ ...createDefaultTrackDesign(name), id, updatedAt });
const handlers = () => ({ onNew: vi.fn(), onEdit: vi.fn(), onSelect: vi.fn(), onPlay: vi.fn(), onShare: vi.fn(), onDelete: vi.fn(), onImport: vi.fn() });

describe("TrackLibraryPanel", () => {
	afterEach(cleanup);
	 it("keeps duplicate names addressable by UUID", async () => {
		const user = userEvent.setup();
		const onEdit = vi.fn();
		render(<TrackLibraryPanel tracks={[local("a", "Same", 2), local("b", "Same", 1)]} selectedTrackId="a" {...handlers()} onEdit={onEdit} />);
		await user.click(screen.getByRole("button", { name: "Edit Same, track b" }));
		expect(onEdit).toHaveBeenCalledWith("b");
	});

	it("sorts custom tracks newest first and keeps built-in selection separate", async () => {
		const h = handlers();
		render(<TrackLibraryPanel tracks={[local("old", "Old", 1), local("new", "New", 2)]} {...h} />);
		expect(screen.getAllByRole("listitem").map((item) => item.textContent?.startsWith("New"))).toEqual([true, false]);
		await userEvent.click(screen.getByRole("button", { name: "Built-in track" }));
		expect(h.onSelect).toHaveBeenCalledWith(undefined);
	});

	it("emits import text without owning library state", async () => {
		const user = userEvent.setup();
		const h = handlers();
		render(<TrackLibraryPanel tracks={[]} {...h} />);
		await user.type(screen.getByLabelText("Import track"), "token");
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(h.onImport).toHaveBeenCalledWith("token");
	});
});
