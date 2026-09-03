import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { editorReducer, type EditorAction, type EditorState } from "../designer/editorState";
import type { ModuleKind, TrackCell } from "../designer/trackDesign";

export type TrackEditorProps = Readonly<{
	state: EditorState;
	onChange: (state: EditorState) => void;
	onBack: () => void;
	onSave: () => void;
	onShare: () => void;
	onPlay: () => void;
}>;

const COLUMNS = 5;
const ROWS = 8;
const PALETTE: readonly [ModuleKind, string][] = [
	["straight", "Straight module"], ["curve", "Curve module"], ["funnel", "Funnel module"],
	["wave", "Wave module"], ["pinwheel", "Pinwheel module"], ["booster", "Booster module"], ["bumper", "Bumper module"],
];

const cellLabel = (cell: TrackCell, index: number): string => {
	const row = Math.floor(index / COLUMNS) + 1; const column = index % COLUMNS + 1;
	if (cell?.kind === "start") return `row ${row} column ${column}, fixed start`;
	if (cell?.kind === "finish") return `row ${row} column ${column}, fixed finish`;
	if (cell === null) return `row ${row} column ${column}, empty`;
	return `row ${row} column ${column}, ${cell.kind} module, rotation ${cell.rotation * 90} degrees`;
};

export function TrackEditor({ state, onChange, onBack, onSave, onShare, onPlay }: TrackEditorProps) {
	const timer = useRef<number | undefined>(undefined);
	const longPress = useRef(false);
	const [menuCell, setMenuCell] = useState<number | null>(null);
	const dispatch = (action: EditorAction) => onChange(editorReducer(state, action));
	const clearTimer = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); timer.current = undefined; };
	const startLongPress = (cellIndex: number) => {
		clearTimer(); longPress.current = false;
		timer.current = window.setTimeout(() => { longPress.current = true; setMenuCell(cellIndex); }, 500);
	};
	useEffect(() => clearTimer, []);

	const onCellKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const row = Math.floor(index / COLUMNS); const column = index % COLUMNS;
		let next = index;
		if (event.key === "ArrowUp") next = row > 0 ? index - COLUMNS : index;
		if (event.key === "ArrowDown") next = row < ROWS - 1 ? index + COLUMNS : index;
		if (event.key === "ArrowLeft") next = column > 0 ? index - 1 : index;
		if (event.key === "ArrowRight") next = column < COLUMNS - 1 ? index + 1 : index;
		if (next !== index && (state.draft.cells[next]?.kind === "start" || state.draft.cells[next]?.kind === "finish")) next = index;
		if (next !== index) { event.preventDefault(); dispatch({ type: "focus", cellIndex: next }); document.querySelector<HTMLButtonElement>(`[data-cell-index="${next}"]`)?.focus(); return; }
		if (event.key === "Enter" || event.key === " ") { event.preventDefault(); dispatch({ type: state.draft.cells[index] === null ? "place" : "rotate", cellIndex: index }); }
		if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); dispatch({ type: "clear", cellIndex: index }); }
	};
	const handleCellClick = (index: number) => {
		clearTimer();
		if (longPress.current) { longPress.current = false; return; }
		dispatch({ type: state.draft.cells[index] === null ? "place" : "rotate", cellIndex: index });
	};

	return <main className="track-editor" aria-label="Track editor">
		<header className="track-editor-header"><button className="secondary-button" onClick={() => (!state.dirty || window.confirm("Discard unsaved changes?")) && onBack()}>Back</button><div><p className="eyebrow">MODULAR TRACK DESIGNER</p><h1>Build your route</h1></div><button className="primary-button" disabled={!state.validation.ok} onClick={onSave}>Save</button></header>
		<label className="track-name">Track name<input value={state.draft.name} maxLength={60} onChange={(event) => dispatch({ type: "name", name: event.target.value })} /></label>
		<section className="track-editor-board" aria-label="Board editor">
			<div className="palette" aria-label="Module palette">{PALETTE.map(([kind, label]) => <button key={kind} className={state.selectedKind === kind ? "selected" : ""} aria-pressed={state.selectedKind === kind} onClick={() => dispatch({ type: "palette", kind })}>{label}</button>)}</div>
			<div className="track-board" role="grid" aria-label="5 column by 8 row track board">
				{Array.from({ length: ROWS }, (_, row) => <div role="row" key={row}>{Array.from({ length: COLUMNS }, (_, column) => {
					const index = row * COLUMNS + column; const cell = state.draft.cells[index]; const fixed = cell?.kind === "start" || cell?.kind === "finish";
					return <button role="gridcell" className={`track-cell ${cell === null ? "empty" : "occupied"} ${fixed ? "fixed" : ""}`} data-cell-index={index} key={index} disabled={fixed} tabIndex={state.selectedCell === index ? 0 : -1} aria-label={cellLabel(cell, index)} onFocus={() => dispatch({ type: "focus", cellIndex: index })} onClick={() => handleCellClick(index)} onKeyDown={(event) => onCellKeyDown(event, index)} onPointerDown={() => startLongPress(index)} onPointerMove={clearTimer} onPointerUp={clearTimer} onPointerCancel={() => { clearTimer(); longPress.current = false; }}>{cell === null ? "" : cell.kind === "start" ? "S" : cell.kind === "finish" ? "F" : cell.kind.slice(0, 1).toUpperCase()}</button>;
				})}</div>)}
			</div>
			<p className="track-editor-help">Tap empty cells to place. Tap modules to rotate. Use Enter, Space, or Delete.</p>
		</section>
		<section className="cell-actions" role={menuCell === null ? undefined : "dialog"} aria-label="Cell actions"><span>{menuCell === null ? "Selected cell" : `Cell ${menuCell + 1}`}</span><button onClick={() => { dispatch({ type: "replace", cellIndex: menuCell ?? state.selectedCell }); setMenuCell(null); }}>Replace</button><button onClick={() => { dispatch({ type: "clear", cellIndex: menuCell ?? state.selectedCell }); setMenuCell(null); }}>Clear</button></section>
		<div className="track-editor-footer"><button className="secondary-button" disabled={!state.validation.ok} onClick={onShare}>Share</button><button className="primary-button" disabled={!state.validation.ok} onClick={onPlay}>Test Play</button></div>
		<div className="track-validation" role="status" aria-live="polite">{state.validation.ok ? "Route is valid." : state.validation.failures.map((failure) => failure.message).join(" ")}</div>
	</main>;
}
