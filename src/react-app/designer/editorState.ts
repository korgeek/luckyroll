import { createEmptyTrackDesign, rotateEditableCell, type ModuleKind, type TrackCell, type TrackDesign } from "./trackDesign";
import { validateTrackDesign, type DesignValidation } from "./trackValidation";

export type EditorState = Readonly<{
	id?: string;
	draft: TrackDesign;
	selectedKind: ModuleKind;
	selectedCell: number;
	dirty: boolean;
	validation: DesignValidation;
}>;

export type EditorAction =
	| Readonly<{ type: "name"; name: string }>
	| Readonly<{ type: "palette"; kind: ModuleKind }>
	| Readonly<{ type: "place"; cellIndex: number }>
	| Readonly<{ type: "rotate"; cellIndex: number }>
	| Readonly<{ type: "replace"; cellIndex: number }>
	| Readonly<{ type: "clear"; cellIndex: number }>
	| Readonly<{ type: "focus"; cellIndex: number }>;

const CELL_COUNT = 40;
const isEditable = (cellIndex: number): boolean => cellIndex > 0 && cellIndex < CELL_COUNT - 1;
const freezeTrack = (name: string, cells: readonly TrackCell[]): TrackDesign => Object.freeze({ name, cells: Object.freeze(cells.map((cell) => cell === null ? null : Object.freeze({ ...cell }))) });

export const createEditorState = (track: TrackDesign = createEmptyTrackDesign(), id?: string): EditorState => Object.freeze({
	id,
	draft: track,
	selectedKind: "straight",
	selectedCell: 1,
	dirty: false,
	validation: validateTrackDesign(track),
});

const updateDraft = (state: EditorState, name: string, cells: readonly TrackCell[]): EditorState => {
	const draft = freezeTrack(name, cells);
	return Object.freeze({ ...state, draft, dirty: true, validation: validateTrackDesign(draft) });
};

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
	switch (action.type) {
		case "name": return updateDraft(state, action.name, state.draft.cells);
		case "palette": return Object.freeze({ ...state, selectedKind: action.kind });
		case "focus": return action.cellIndex >= 0 && action.cellIndex < CELL_COUNT ? Object.freeze({ ...state, selectedCell: action.cellIndex }) : state;
		case "place":
			if (!isEditable(action.cellIndex) || state.draft.cells[action.cellIndex] !== null) return state;
			return updateDraft(state, state.draft.name, state.draft.cells.map((cell, index) => index === action.cellIndex ? { kind: state.selectedKind, rotation: 0 } : cell));
		case "rotate": {
			const cell = state.draft.cells[action.cellIndex];
			if (!isEditable(action.cellIndex) || cell === null) return state;
			return updateDraft(state, state.draft.name, state.draft.cells.map((candidate, index) => index === action.cellIndex ? rotateEditableCell(cell) : candidate));
		}
		case "replace":
			if (!isEditable(action.cellIndex)) return state;
			return updateDraft(state, state.draft.name, state.draft.cells.map((cell, index) => index === action.cellIndex ? { kind: state.selectedKind, rotation: 0 } : cell));
		case "clear":
			if (!isEditable(action.cellIndex) || state.draft.cells[action.cellIndex] === null) return state;
			return updateDraft(state, state.draft.name, state.draft.cells.map((cell, index) => index === action.cellIndex ? null : cell));
	}
};
