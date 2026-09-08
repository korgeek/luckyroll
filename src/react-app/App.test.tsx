import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrackDesign } from "./designer/trackDesign";
import { encodeSharedTrack } from "./designer/trackCodec";
import { TRACK_LIBRARY_KEY } from "./designer/trackLibrary";

const scene = vi.hoisted(() => ({
  create: vi.fn(),
  start: vi.fn(),
  setBirdView: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./game/MarbleRaceScene", () => ({
  initializeScenePhysics: () => Promise.resolve(),
  createRaceScene: (...args: unknown[]) => {
    scene.create(...args);
    return { start: scene.start, restartRemaining: vi.fn(), setPaused: vi.fn(), setBirdView: scene.setBirdView, reset: vi.fn(), dispose: scene.dispose };
  },
}));

vi.mock("./game/retroSounds", () => ({ retroSounds: { start: vi.fn(), finish: vi.fn(), timeout: vi.fn(), setMuted: vi.fn() } }));

import App from "./App";

describe("default race course and camera controls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
    Object.values(scene).forEach((mock) => mock.mockClear());
  });
  afterEach(cleanup);

  it("starts on the editor-built Default Track and toggles a fixed bird view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("region", { name: "Game setup" });

    await user.click(screen.getByRole("button", { name: "START RACE" }));
    await waitFor(() => expect(scene.create).toHaveBeenCalled());
    expect(scene.create.mock.calls[0][2]).toEqual({ kind: "custom", track: createDefaultTrackDesign("Default Track") });

    const birdView = await screen.findByRole("button", { name: "Bird View" });
    await waitFor(() => expect(birdView).toBeEnabled());
    await user.click(birdView);
    expect(scene.setBirdView).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Auto Camera" }));
    expect(scene.setBirdView).toHaveBeenLastCalledWith(false);
  });

  it("shows finishers separately from eliminations and leaves OUT unchanged on timeout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("region", { name: "Game setup" });
    await user.click(screen.getByRole("button", { name: "START RACE" }));
    await waitFor(() => expect(scene.create).toHaveBeenCalled());
    const emit = scene.create.mock.calls[0]?.[1] as (event: { type: string; elapsedMs?: number; finishedCount?: number; eliminatedCount?: number; remaining?: []; leader?: undefined; trailer?: undefined }) => void;
    emit({ type: "tick", elapsedMs: 1000, finishedCount: 3, eliminatedCount: 2, remaining: [], leader: undefined, trailer: undefined });
    expect(await screen.findByText("DONE 3/100")).toBeInTheDocument();
    expect(screen.getByText("OUT 2")).toBeInTheDocument();
    emit({ type: "timeout", remaining: [] });
    expect(screen.getByText("OUT 2")).toBeInTheDocument();
  });

	it("opens track management without losing setup input and returns there from editing", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Game setup" });
		await user.clear(screen.getByLabelText("Player 1"));
		await user.type(screen.getByLabelText("Player 1"), "Jin");
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "New Track" }));
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to Setup" }));
		expect(screen.getByLabelText("Player 1")).toHaveValue("Jin");
	});

	it("imports, saves, and updates one new track without replacing saved tracks", async () => {
		const user = userEvent.setup();
		const importedId = "00000000-0000-4000-8000-000000000001";
		const track = { ...createDefaultTrackDesign("Saved Course"), id: "saved", updatedAt: 1 };
		window.localStorage.setItem(TRACK_LIBRARY_KEY, JSON.stringify({ version: 1, tracks: [track] }));
		render(<App />);
		await screen.findByRole("region", { name: "Game setup" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		await user.click(screen.getByRole("button", { name: "Share Saved Course, track saved" }));
		expect(screen.getByLabelText("Track code")).toHaveValue(encodeSharedTrack(track));
		await user.click(screen.getByRole("button", { name: "Close" }));
		await user.click(screen.getByRole("button", { name: "Import Track" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Import track" }), { target: { value: encodeSharedTrack(createDefaultTrackDesign("Imported Course")) } });
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		expect(screen.getByLabelText("Track name")).toHaveValue("Imported Course");
		expect(JSON.parse(window.localStorage.getItem(TRACK_LIBRARY_KEY) ?? "").tracks).toHaveLength(1);
		const uuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(importedId);
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: `Edit Imported Course, track ${importedId}` }));
		await user.clear(screen.getByLabelText("Track name"));
		await user.type(screen.getByLabelText("Track name"), "Imported Course v2");
		await user.click(screen.getByRole("button", { name: "Save" }));

		const saved = JSON.parse(window.localStorage.getItem(TRACK_LIBRARY_KEY) ?? "") as { tracks: Array<{ id: string; name: string }> };
		expect(saved.tracks.find((candidate) => candidate.id === "saved")).toEqual(track);
		expect(saved.tracks.find((candidate) => candidate.id === importedId)).toMatchObject({ id: importedId, name: "Imported Course v2" });
		expect(saved.tracks).toHaveLength(2);
		expect(uuid).toHaveBeenCalledTimes(1);

		cleanup();
		render(<App />);
		await screen.findByRole("region", { name: "Game setup" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		expect(screen.getByRole("button", { name: `Edit Imported Course v2, track ${importedId}` })).toBeInTheDocument();
		uuid.mockRestore();
	});

	it("returns quick play to track management", async () => {
		const user = userEvent.setup();
		const track = { ...createDefaultTrackDesign("Saved Course"), id: "saved", updatedAt: 1 };
		window.localStorage.setItem(TRACK_LIBRARY_KEY, JSON.stringify({ version: 1, tracks: [track] }));
		render(<App />);
		await screen.findByRole("region", { name: "Game setup" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		await user.click(screen.getByRole("button", { name: "Play Saved Course, track saved" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await user.click(screen.getByRole("button", { name: "Exit" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
	});

	it("does not report a save when track storage rejects the write", async () => {
		const user = userEvent.setup();
		const originalSetItem = Storage.prototype.setItem;
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key === TRACK_LIBRARY_KEY) throw new Error("quota full");
			return originalSetItem.call(this, key, value);
		});
		render(<App />);
		await screen.findByRole("region", { name: "Game setup" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		await user.click(screen.getByRole("button", { name: "New Track" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByText("quota full")).toBeInTheDocument();
		expect(screen.queryByText("Track saved in this browser.")).not.toBeInTheDocument();
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		setItem.mockRestore();
	});
});
