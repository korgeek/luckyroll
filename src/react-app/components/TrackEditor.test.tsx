import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { createEmptyTrackDesign, createDefaultTrackDesign, type Direction, type ModuleKind, type TrackCell } from "../designer/trackDesign";
import { createEditorState } from "../designer/editorState";
import { TrackEditor } from "./TrackEditor";
import { TrackCellDiagram } from "./TrackCellDiagram";

const props = () => ({ onChange: vi.fn(), onBack: vi.fn(), onSave: vi.fn(), onShare: vi.fn(), onPlay: vi.fn() });
type DiagramCase = readonly [name: string, cell: Exclude<TrackCell, null>, ports: readonly Direction[], path: string, glyph: string];
const diagramGlyphs: Partial<Record<ModuleKind, string>> = { funnel: "⌄", wave: "≈", pinwheel: "✣", booster: "»", bumper: "●" };
const diagramCases: readonly DiagramCase[] = [
  ["curve 0", { kind: "curve", rotation: 0 }, ["north", "east"], "M 50 0 Q 50 50 100 50", ""],
  ["curve 1", { kind: "curve", rotation: 1 }, ["east", "south"], "M 100 50 Q 50 50 50 100", ""],
  ["curve 2", { kind: "curve", rotation: 2 }, ["south", "west"], "M 50 100 Q 50 50 0 50", ""],
  ["curve 3", { kind: "curve", rotation: 3 }, ["west", "north"], "M 0 50 Q 50 50 50 0", ""],
  ...(["straight", "funnel", "wave", "pinwheel", "booster", "bumper"] as const).flatMap((kind): DiagramCase[] => [
    [`${kind} horizontal`, { kind, rotation: 0 }, ["west", "east"], "M 0 50 L 100 50", diagramGlyphs[kind] ?? ""],
    [`${kind} vertical`, { kind, rotation: 1 }, ["north", "south"], "M 50 0 L 50 100", diagramGlyphs[kind] ?? ""],
  ]),
  ["start", { kind: "start", rotation: 0 }, ["east"], "M 50 50 L 100 50", "START"],
  ["finish", { kind: "finish", rotation: 0 }, ["west"], "M 50 50 L 0 50", "FINISH"],
];
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

	it("deduplicates repeated route failures while keeping invalid actions disabled", () => {
		const handlers = props(); const track = createEmptyTrackDesign("Course");
		const cells = track.cells.map((cell, index) => index >= 2 && index <= 36 ? { kind: "straight" as const, rotation: 0 as const } : cell);
		render(<TrackEditor state={createEditorState({ ...track, cells })} {...handlers} />);
		const status = screen.getByRole("status");
		expect(status).toHaveAttribute("aria-live", "polite");
		expect(status.textContent?.match(/Occupied cell is not part of the start-to-finish route\./g)).toHaveLength(1);
		for (const name of ["Save", "Share", "Test Play"]) expect(screen.getByRole("button", { name })).toBeDisabled();
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
		const rotatedStraight = screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 90/i });
		expect(rotatedStraight).not.toHaveTextContent(/STR|90°/);
		expect(rotatedStraight.querySelector("path")).toHaveAttribute("d", "M 50 0 L 50 100");
	});

  it("draws connected ports for a curve and updates them on rotation", async () => {
		const user = userEvent.setup(); render(<ControlledEditor track={createDefaultTrackDesign("Course")} />);
		const curve = screen.getByRole("gridcell", { name: /row 3 column 1, curve module, rotation 0/i });
		expect(curve).not.toHaveTextContent(/CUR|0°/);
		expect(curve.querySelector("path")).toHaveAttribute("d", "M 50 0 Q 50 50 100 50");
		expect(curve.querySelector('[data-port="north"]')).toBeTruthy();
		expect(curve.querySelector('[data-port="east"]')).toBeTruthy();
		await user.click(curve);
		const rotated = screen.getByRole("gridcell", { name: /row 3 column 1, curve module, rotation 90/i });
		expect(rotated).not.toHaveTextContent(/CUR|90°/);
		expect(rotated.querySelector("path")).toHaveAttribute("d", "M 100 50 Q 50 50 50 100");
		expect(rotated.querySelector('[data-port="east"]')).toBeTruthy();
		expect(rotated.querySelector('[data-port="south"]')).toBeTruthy();
  });

  it.each(diagramCases)("draws %s from canonical ports", (_name, cell, ports, path, glyph) => {
    const { container } = render(<TrackCellDiagram cell={cell} />);
    expect(container.querySelector("path")).toHaveAttribute("d", path);
    expect([...container.querySelectorAll("[data-port]")].map((port) => port.getAttribute("data-port"))).toEqual(ports);
    expect(container).toHaveTextContent(glyph);
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
			expect(screen.getByRole("gridcell", { name: /row 1 column 2, straight module, rotation 0/i }).querySelector("svg")).toBeTruthy();
			fireEvent.click(screen.getByRole("button", { name: "Clear" }));
			expect(screen.getByRole("gridcell", { name: /row 1 column 2, empty/i })).toHaveTextContent("+");
		} finally { vi.useRealTimers(); }
	});
});
