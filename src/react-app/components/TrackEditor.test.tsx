import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { createEmptyTrackDesign, createDefaultTrackDesign } from "../designer/trackDesign";
import { createEditorState } from "../designer/editorState";
import { TrackEditor } from "./TrackEditor";

const props = () => ({ onChange: vi.fn(), onBack: vi.fn(), onSave: vi.fn(), onShare: vi.fn(), onPlay: vi.fn() });
const ControlledEditor = ({ track }: { track: ReturnType<typeof createDefaultTrackDesign> }) => {
	const [state, setState] = useState(() => createEditorState(track));
	return <TrackEditor state={state} onChange={setState} onBack={vi.fn()} onSave={vi.fn()} onShare={vi.fn()} onPlay={vi.fn()} />;
};

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

	it("moves by arrow, rotates occupied cells, and shows kind plus direction", async () => {
		const user = userEvent.setup(); render(<ControlledEditor track={createDefaultTrackDesign("Course")} />);
		const cell = screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 0/i }); cell.focus(); await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toHaveAttribute("aria-label", expect.stringMatching(/row 1 column 3/i));
		const occupied = screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 0/i }); await user.click(occupied);
		expect(screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 90/i })).toHaveTextContent(/STR/);
		expect(screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 90/i })).toHaveTextContent(/90°/);
	});

	it("opens long-press actions and cancels pending presses on movement, up, and cancel", () => {
		vi.useFakeTimers();
		try {
			render(<ControlledEditor track={createEmptyTrackDesign("Course")} />);
			const cell = screen.getByRole("gridcell", { name: /row 1 column 2, empty/i });
			expect(screen.getByRole("button", { name: "Replace" })).toBeVisible(); expect(screen.getByRole("button", { name: "Clear" })).toBeVisible();
			fireEvent.pointerDown(cell); fireEvent.pointerMove(cell); act(() => vi.advanceTimersByTime(500)); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			fireEvent.pointerDown(cell); fireEvent.pointerUp(cell); act(() => vi.advanceTimersByTime(500)); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			fireEvent.pointerDown(cell); fireEvent.pointerCancel(cell); act(() => vi.advanceTimersByTime(500)); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			fireEvent.pointerDown(cell); act(() => vi.advanceTimersByTime(500)); expect(screen.getByRole("dialog")).toBeInTheDocument();
			fireEvent.click(screen.getByRole("button", { name: "Replace" }));
			expect(screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 0/i })).toHaveTextContent(/STR/);
			fireEvent.click(screen.getByRole("button", { name: "Clear" }));
			expect(screen.getByRole("gridcell", { name: /row 1 column 2, empty/i })).toHaveTextContent("+");
		} finally { vi.useRealTimers(); }
	});
});
