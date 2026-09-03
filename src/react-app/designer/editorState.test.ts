import { describe, expect, it } from "vitest";
import { createEmptyTrackDesign, createDefaultTrackDesign } from "./trackDesign";
import { createEditorState, editorReducer } from "./editorState";

describe("editor state", () => {
	it("places, rotates, replaces, and clears editable cells", () => {
		let state = createEditorState(createEmptyTrackDesign("Course"), "track-1");
		state = editorReducer(state, { type: "palette", kind: "curve" });
		state = editorReducer(state, { type: "place", cellIndex: 1 });
		expect(state.draft.cells[1]).toEqual({ kind: "curve", rotation: 0 });
		state = editorReducer(state, { type: "rotate", cellIndex: 1 });
		expect(state.draft.cells[1]).toEqual({ kind: "curve", rotation: 1 });
		state = editorReducer(state, { type: "replace", cellIndex: 1 });
		expect(state.draft.cells[1]).toEqual({ kind: "curve", rotation: 0 });
		state = editorReducer(state, { type: "clear", cellIndex: 1 });
		expect(state.draft.cells[1]).toBeNull();
		expect(state.dirty).toBe(true);
	});

	it("protects fixed endpoints and keeps validation authoritative", () => {
		let state = createEditorState(createDefaultTrackDesign("Course"));
		const start = state.draft.cells[0]; const finish = state.draft.cells[39];
		state = editorReducer(state, { type: "palette", kind: "booster" });
		for (const type of ["place", "rotate", "replace", "clear"] as const) state = editorReducer(state, { type, cellIndex: 0 } as never);
		expect(state.draft.cells[0]).toBe(start);
		expect(state.draft.cells[39]).toBe(finish);
		expect(state.validation.ok).toBe(true);
		state = editorReducer(state, { type: "clear", cellIndex: 1 });
		expect(state.validation.ok).toBe(false);
	});

	it("moves the roving selection within the 5 by 8 board", () => {
		let state = createEditorState(createEmptyTrackDesign("Course"));
		state = editorReducer(state, { type: "focus", cellIndex: 1 });
		state = editorReducer(state, { type: "focus", cellIndex: 6 });
		expect(state.selectedCell).toBe(6);
		state = editorReducer(state, { type: "focus", cellIndex: 40 });
		expect(state.selectedCell).toBe(6);
	});

	it("changes the name and rebuilds validation", () => {
		const state = editorReducer(createEditorState(createEmptyTrackDesign("Course")), { type: "name", name: "" });
		expect(state.draft.name).toBe("");
		expect(state.validation.ok).toBe(false);
		expect(state.dirty).toBe(true);
	});
});
