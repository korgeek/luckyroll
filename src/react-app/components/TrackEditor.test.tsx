import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyTrackDesign, createDefaultTrackDesign } from "../designer/trackDesign";
import { createEditorState } from "../designer/editorState";
import { TrackEditor } from "./TrackEditor";

const props = () => ({ onChange: vi.fn(), onBack: vi.fn(), onSave: vi.fn(), onShare: vi.fn(), onPlay: vi.fn() });

describe("TrackEditor", () => {
	afterEach(cleanup);
	it("renders all 40 cells and places a palette module", async () => {
		const user = userEvent.setup(); const handlers = props();
		const state = createEditorState(createEmptyTrackDesign("Course"));
		render(<TrackEditor state={state} {...handlers} />);
		expect(screen.getAllByRole("gridcell")).toHaveLength(40);
		await user.click(screen.getByRole("button", { name: "Straight module" }));
		await user.click(screen.getByRole("gridcell", { name: /row 1 column 2, empty/i }));
		expect(handlers.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ cells: expect.arrayContaining([{ kind: "straight", rotation: 0 }]) }) }));
		expect(screen.getByRole("gridcell", { name: /row 1 column 1, fixed start/i })).toBeDisabled();
	});

	it("gates actions and exposes validation errors for an invalid route", () => {
		const handlers = props();
		render(<TrackEditor state={createEditorState(createEmptyTrackDesign("Course"))} {...handlers} />);
		for (const name of ["Save", "Share", "Test Play"]) expect(screen.getByRole("button", { name })).toBeDisabled();
		expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
		expect(screen.getByRole("status")).toHaveTextContent(/empty/i);
	});

	it("supports keyboard placement and movement", async () => {
		const user = userEvent.setup(); const handlers = props();
		render(<TrackEditor state={createEditorState(createEmptyTrackDesign("Course"))} {...handlers} />);
		const cell = screen.getByRole("gridcell", { name: /row 1 column 2, empty/i });
		cell.focus(); await user.keyboard("{Enter}");
		expect(handlers.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ cells: expect.arrayContaining([{ kind: "straight", rotation: 0 }]) }) }));
	});

	it("renders a valid default route with enabled actions", () => {
		render(<TrackEditor state={createEditorState(createDefaultTrackDesign("Course"))} {...props()} />);
		for (const name of ["Save", "Share", "Test Play"]) expect(screen.getByRole("button", { name })).toBeEnabled();
	});
});
