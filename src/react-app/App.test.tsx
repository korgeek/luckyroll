import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrackDesign } from "./designer/trackDesign";
import { encodeSharedTrack } from "./designer/trackCodec";
import { TRACK_LIBRARY_KEY } from "./designer/trackLibrary";

const scene = vi.hoisted(() => ({
	initialize: vi.fn(() => Promise.resolve()),
  create: vi.fn(),
  start: vi.fn(),
  setBirdView: vi.fn(),
	setPaused: vi.fn(),
	boost: vi.fn(),
	restartRemaining: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./game/MarbleRaceScene", () => ({
  initializeScenePhysics: () => scene.initialize(),
  createRaceScene: (...args: unknown[]) => {
    scene.create(...args);
    return { start: scene.start, restartRemaining: scene.restartRemaining, setPaused: scene.setPaused, setBirdView: scene.setBirdView, boost: scene.boost, reset: vi.fn(), dispose: scene.dispose };
  },
}));

vi.mock("./game/retroSounds", () => ({ retroSounds: { preload: vi.fn().mockResolvedValue(undefined), ready: vi.fn(), click: vi.fn(), music: vi.fn(), resetMusic: vi.fn(), start: vi.fn(), countdown: vi.fn(), boost: vi.fn(), rush: vi.fn(), checkpoint: vi.fn(), dnf: vi.fn(), finish: vi.fn(), timeout: vi.fn(), stop: vi.fn(), setMuted: vi.fn() } }));

import App from "./App";
import { retroSounds } from "./game/retroSounds";

const latestSceneEmitter = () => scene.create.mock.calls[scene.create.mock.calls.length - 1]?.[1] as (event: { type: string; [key: string]: unknown }) => void;
const finishCountdown = async () => {
	vi.useFakeTimers();
	act(() => latestSceneEmitter()({ type: "prepared" }));
	for (let second = 0; second < 4; second += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
	await act(async () => { await vi.advanceTimersByTimeAsync(600); });
	vi.useRealTimers();
};

describe("default race course and camera controls", () => {
  beforeEach(() => {
		vi.useRealTimers();
    window.localStorage.clear();
    window.location.hash = "";
		window.history.replaceState(null, "", window.location.href);
    Object.values(scene).forEach((mock) => mock.mockClear());
		Object.values(retroSounds).forEach((mock) => vi.mocked(mock).mockClear());
		scene.initialize.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

	it("plays one UI click for pointer and keyboard buttons, not text inputs", async () => {
		const user = userEvent.setup(); render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByLabelText("Player 1"));
		expect(retroSounds.click).not.toHaveBeenCalled();
		const shuffle = screen.getByRole("button", { name: "Shuffle" });
		await user.click(shuffle);
		expect(retroSounds.click).toHaveBeenCalledTimes(1);
		shuffle.focus(); await user.keyboard("{Enter}");
		expect(retroSounds.click).toHaveBeenCalledTimes(2);
	});

	it("starts on the editor-built Default Track and toggles a fixed bird view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("region", { name: "Main menu" });

    await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
    await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await finishCountdown();
    expect(scene.create.mock.calls[0][2]).toEqual({ kind: "custom", track: createDefaultTrackDesign("Default Track") });

    const birdView = await screen.findByRole("button", { name: "Bird View" });
    await waitFor(() => expect(birdView).toBeEnabled());
    await user.click(birdView);
    expect(scene.setBirdView).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Auto Camera" }));
    expect(scene.setBirdView).toHaveBeenLastCalledWith(false);
		expect(screen.getByRole("button", { name: /Boost/ }).closest(".boost-dock")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Back to Menu" })).toBeInTheDocument();
  });

  it("shows finishers separately from eliminations and leaves OUT unchanged on timeout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("region", { name: "Main menu" });
    await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
    await waitFor(() => expect(scene.create).toHaveBeenCalled());
    const marble = (id: number) => ({ id, ownerId: "player-1", color: "#fff", symbol: "◆" });
    const emit = scene.create.mock.calls[0]?.[1] as (event: { type: "finish"; marble: ReturnType<typeof marble> } | { type: "tick"; elapsedMs: number; fps: number; finishedCount: number; eliminatedCount: number; remaining: ReturnType<typeof marble>[]; standings: Array<{ marble: ReturnType<typeof marble>; gap: number }>; boostRemainingMs: number } | { type: "timeout"; remaining: ReturnType<typeof marble>[] }) => void;
    act(() => { emit({ type: "finish", marble: marble(1) }); emit({ type: "finish", marble: marble(2) }); emit({ type: "finish", marble: marble(3) }); emit({ type: "tick", elapsedMs: 1000, fps: 59.7, finishedCount: 3, eliminatedCount: 2, remaining: [marble(4)], standings: [{ marble: marble(1), gap: 2 }, { marble: marble(4), gap: 5 }], boostRemainingMs: 5_000 }); });
    expect(await screen.findByText("DONE 3/100")).toBeInTheDocument();
    expect(screen.getByText("OUT 2")).toBeInTheDocument();
		expect(screen.getByText("60 FPS")).toBeInTheDocument();
		expect(screen.getAllByText("Player 1 · #1")).toHaveLength(1);
		act(() => emit({ type: "timeout", remaining: [marble(4)] }));
		expect(screen.getByText("OUT 2")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "RACE REMAINING MARBLES" }));
		expect(screen.getByRole("status")).toHaveTextContent("PREPARING RACE…");
		await waitFor(() => expect(scene.restartRemaining).toHaveBeenCalledWith([marble(4)]));
		expect(screen.getByText("DONE 3/100")).toBeInTheDocument();
		expect(screen.getAllByText("FIN")).toHaveLength(3);
		act(() => emit({ type: "timeout", remaining: [marble(4)] }));
		await user.click(screen.getByRole("button", { name: "RESTART RACE" }));
		expect(screen.getByText("DONE 0/100")).toBeInTheDocument();
		expect(screen.queryByText("FIN")).not.toBeInTheDocument();
  });

	it("offers boost only when the scene is ready and its cooldown is charged", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		const preload = vi.mocked(retroSounds.preload);
		const preloadCallsBeforeStart = preload.mock.calls.length;
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		expect(screen.getByRole("status")).toHaveTextContent("PREPARING RACE…");
		expect(scene.create).not.toHaveBeenCalled();
		expect(preload).toHaveBeenCalledTimes(preloadCallsBeforeStart + 1);
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		expect(preload.mock.invocationCallOrder[preload.mock.invocationCallOrder.length - 1]).toBeLessThan(scene.create.mock.invocationCallOrder[0]);
		await finishCountdown();
		const boost = screen.getByRole("button", { name: "Boost charging, 5.0 seconds remaining" });
		expect(boost).toBeDisabled();
		const emit = scene.create.mock.calls[0][1] as (event: { type: "tick"; elapsedMs: number; fps: number; finishedCount: number; eliminatedCount: number; standings: []; boostRemainingMs: number } | { type: "timeout"; remaining: [] }) => void;
		act(() => emit({ type: "tick", elapsedMs: 5000, fps: 60, finishedCount: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 0 }));
		expect(screen.getByRole("button", { name: "Boost ready" })).toBeEnabled();
		await user.click(screen.getByRole("button", { name: "Pause" }));
		expect(scene.setPaused).toHaveBeenLastCalledWith(true);
		expect(screen.getByRole("button", { name: "Boost ready" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Resume" }));

		scene.boost.mockReturnValueOnce(false);
		await user.click(screen.getByRole("button", { name: "Boost ready" }));
		expect(screen.queryByText("BOOST!")).not.toBeInTheDocument();
		scene.boost.mockReturnValueOnce(true);
		await user.click(screen.getByRole("button", { name: "Boost ready" }));
		expect(screen.getByRole("status")).toHaveTextContent("BOOST!");
		expect(retroSounds.boost).toHaveBeenCalledTimes(1);
		expect(retroSounds.start).toHaveBeenCalledTimes(1);
		expect(retroSounds.countdown).toHaveBeenCalledTimes(3);
		expect(screen.getByRole("button", { name: "Boost charging, 5.0 seconds remaining" })).toBeDisabled();
		act(() => { emit({ type: "tick", elapsedMs: 10_000, fps: 60, finishedCount: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 0 }); emit({ type: "timeout", remaining: [] }); });
		expect(screen.getByRole("button", { name: "Boost ready" })).toBeDisabled();
	});

	it("locks the manual BOOST control for RUSH", async () => {
		const user = userEvent.setup(); render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled()); await finishCountdown();
		const emit = scene.create.mock.calls[0][1] as (event: { type: "tick"; elapsedMs: number; fps: number; finishedCount: number; eliminatedCount: number; standings: []; boostRemainingMs: number } | { type: "rush" }) => void;
		act(() => { emit({ type: "tick", elapsedMs: 5_000, fps: 60, finishedCount: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 0 }); emit({ type: "rush" }); });
		expect(retroSounds.rush).toHaveBeenCalledTimes(1);
		const boost = screen.getByRole("button", { name: "Boost unavailable during RUSH" });
		expect(boost).toBeDisabled();
		expect(retroSounds.music).toHaveBeenLastCalledWith("rush");
		await user.click(boost);
		expect(scene.boost).not.toHaveBeenCalled();
	});

	it("uses 100 marbles for menu return and replay while clearing RUSH", async () => {
		const user = userEvent.setup(); render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.start).toHaveBeenCalled());
		expect(scene.start.mock.calls[0][0]).toHaveLength(100);
		act(() => latestSceneEmitter()({ type: "rush" }));
		expect(screen.getByText("RUSH!")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(screen.queryByText("RUSH!")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Marbles")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.start).toHaveBeenCalledTimes(2));
		expect(scene.start.mock.calls[1][0]).toHaveLength(100);
		const emit = latestSceneEmitter();
		act(() => { for (let id = 1; id <= 100; id += 1) emit({ type: "finish", marble: { id, ownerId: "player-1", color: "#fff", symbol: "◆" } }); });
		await user.click(await screen.findByRole("button", { name: "Replay same settings" }));
		await waitFor(() => expect(scene.start).toHaveBeenCalledTimes(3));
		expect(scene.start.mock.calls[2][0]).toHaveLength(100);
	});

	it("waits for real scene preparation, then holds 3 2 1 and starts on GO", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		expect(screen.getByRole("status")).toHaveTextContent("PREPARING RACE…");
		expect(scene.setPaused).toHaveBeenLastCalledWith(true);
		expect(scene.setPaused.mock.invocationCallOrder[scene.setPaused.mock.invocationCallOrder.length - 1]).toBeLessThan(scene.start.mock.invocationCallOrder[scene.start.mock.invocationCallOrder.length - 1]!);
		expect(screen.getByRole("button", { name: "Bird View" })).toBeDisabled();

		vi.useFakeTimers();
		act(() => latestSceneEmitter()({ type: "prepared" }));
		expect(screen.getByRole("status")).toHaveTextContent("READY");
		expect(retroSounds.ready).toHaveBeenCalledOnce();
		expect(retroSounds.music).toHaveBeenLastCalledWith("normal");
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
		expect(screen.getByRole("status")).toHaveTextContent("3");
		await act(async () => { await vi.advanceTimersByTimeAsync(999); }); expect(screen.getByRole("status")).toHaveTextContent("3");
		await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(screen.getByRole("status")).toHaveTextContent("2");
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: false } } })));
		await act(async () => { await vi.advanceTimersByTimeAsync(2_000); }); expect(screen.getByRole("status")).toHaveTextContent("2");
		fireEvent.click(screen.getByRole("button", { name: "RESUME" }));
		expect(scene.setPaused).toHaveBeenLastCalledWith(true);
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); }); expect(screen.getByRole("status")).toHaveTextContent("1");
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); }); expect(screen.getByRole("status")).toHaveTextContent("GO!");
		expect(retroSounds.start).toHaveBeenCalledOnce();
		expect(scene.setPaused).toHaveBeenLastCalledWith(false);
		expect(screen.getByRole("button", { name: "Bird View" })).toBeEnabled();
		await act(async () => { await vi.advanceTimersByTimeAsync(600); }); expect(screen.queryByText("GO!")).not.toBeInTheDocument();
		vi.useRealTimers();
	});

	it("clears an active countdown when the app unmounts", async () => {
		const user = userEvent.setup();
		const { unmount } = render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		vi.useFakeTimers(); act(() => latestSceneEmitter()({ type: "prepared" }));
		const pauseCalls = scene.setPaused.mock.calls.length;
		unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
		expect(scene.setPaused).toHaveBeenCalledTimes(pauseCalls);
		vi.useRealTimers();
	});

	it("cancels preparation on menu exit and ignores a disposed scene's late ready event", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		const oldEmitter = latestSceneEmitter();
		await user.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(screen.queryByText("PREPARING RACE…")).not.toBeInTheDocument();
		act(() => oldEmitter({ type: "prepared" }));
		expect(screen.queryByText("3")).not.toBeInTheDocument();
	});

	it("clears preparation and returns to the menu when scene construction fails", async () => {
		scene.create.mockImplementationOnce(() => { throw new Error("build failed"); });
		const user = userEvent.setup(); render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		expect(await screen.findByText("build failed")).toBeInTheDocument();
		expect(screen.queryByText("PREPARING RACE…")).not.toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Main menu" })).toBeInTheDocument();
	});

	it("guards browser back once and lets a running race stay, return to the menu, or leave", async () => {
		const pushState = vi.spyOn(window.history, "pushState");
		const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
		const user = userEvent.setup();
		render(<StrictMode><App /></StrictMode>);
		await screen.findByRole("region", { name: "Main menu" });
		expect(pushState).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await finishCountdown();
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		expect(await screen.findByRole("dialog", { name: "PAUSE MENU" })).toBeInTheDocument();
		expect(scene.setPaused).toHaveBeenLastCalledWith(true);
		window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } }));
		expect(screen.getAllByRole("dialog", { name: "PAUSE MENU" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "RESUME" }));
		expect(scene.setPaused).toHaveBeenLastCalledWith(false);

		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		await user.click(screen.getByRole("button", { name: "MAIN MENU" }));
		expect(await screen.findByRole("region", { name: "Main menu" })).toBeInTheDocument();
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		expect(screen.queryByRole("button", { name: "MAIN MENU" })).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "QUIT" }));
		expect(go).toHaveBeenCalledWith(-2);
		pushState.mockRestore(); go.mockRestore();
	});

	it("keeps an already paused race paused when the back chooser is dismissed", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await user.click(screen.getByRole("button", { name: "Pause" }));
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: false } } })));
		const dialog = await screen.findByRole("dialog", { name: "PAUSE MENU" });
		fireEvent(dialog, new Event("cancel", { cancelable: true }));
		expect(scene.setPaused).toHaveBeenLastCalledWith(true);
	});

	it("shows the back chooser while the race engine is still loading", async () => {
		let resolve!: () => void;
		scene.initialize.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
		render(<App />);
		expect(await screen.findByRole("status")).toHaveTextContent("Loading race engine");
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: false } } })));
		expect(screen.getByRole("dialog", { name: "QUIT GAME?" })).toHaveAttribute("open");
		await act(async () => resolve());
		expect(await screen.findByRole("region", { name: "Main menu" })).toBeInTheDocument();
		expect(screen.getByRole("dialog", { name: "QUIT GAME?" })).toHaveAttribute("open");
		await userEvent.click(screen.getByRole("button", { name: "CANCEL" }));
	});

	it("silently restores the guard after returning from a successful quit", async () => {
		const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		await user.click(screen.getByRole("button", { name: "QUIT" }));
		expect(go).toHaveBeenCalledWith(-2);
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: true } } })));
		expect(screen.getByRole("dialog", { name: "QUIT GAME?" })).toBeInTheDocument();
		go.mockRestore();
	});

	it("opens track management without losing setup input and returns there from editing", async () => {
		const user = userEvent.setup();
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.clear(screen.getByLabelText("Player 1"));
		await user.type(screen.getByLabelText("Player 1"), "Jin");
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
		act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { luckyRollNavigation: { position: "base", hadPrevious: false } } })));
		expect(screen.getByRole("dialog", { name: "GAME MENU" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "MAIN MENU" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "QUIT GAME" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "CONTINUE" }));
		await user.click(screen.getByRole("button", { name: "New Track" }));
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Test Play" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await user.click(screen.getByRole("button", { name: "Back to Editor" }));
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to Tracks" }));
		expect(screen.getByRole("region", { name: "Track management" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(screen.getByLabelText("Player 1")).toHaveValue("Jin");
	});

	it("imports, saves, and updates one new track without replacing saved tracks", async () => {
		const user = userEvent.setup();
		const importedId = "00000000-0000-4000-8000-000000000001";
		const track = { ...createDefaultTrackDesign("Saved Course"), id: "saved", updatedAt: 1 };
		window.localStorage.setItem(TRACK_LIBRARY_KEY, JSON.stringify({ version: 1, tracks: [track] }));
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
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
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		expect(screen.getByRole("button", { name: `Edit Imported Course v2, track ${importedId}` })).toBeInTheDocument();
		uuid.mockRestore();
	});

	it("returns quick play to track management", async () => {
		const user = userEvent.setup();
		const track = { ...createDefaultTrackDesign("Saved Course"), id: "saved", updatedAt: 1 };
		window.localStorage.setItem(TRACK_LIBRARY_KEY, JSON.stringify({ version: 1, tracks: [track] }));
		render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		await user.click(screen.getByRole("button", { name: "Play Saved Course, track saved" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		await user.click(screen.getByRole("button", { name: "Back to Tracks" }));
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
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "Manage Tracks" }));
		await user.click(screen.getByRole("button", { name: "New Track" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByText("quota full")).toBeInTheDocument();
		expect(screen.queryByText("Track saved in this browser.")).not.toBeInTheDocument();
		expect(screen.getByRole("main", { name: "Track editor" })).toBeInTheDocument();
		setItem.mockRestore();
	});

	it("celebrates only a completed race with a finisher", async () => {
		const user = userEvent.setup();
		const { container } = render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.click(screen.getByRole("button", { name: "START RACE · Default Track" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		const emit = scene.create.mock.calls[0][1] as (event: { type: "finish"; marble: { id: number; ownerId: string; color: string; symbol: string } }) => void;
		act(() => {
			for (let id = 1; id <= 100; id += 1) emit({ type: "finish", marble: { id, ownerId: id === 100 ? "player-2" : "player-1", color: "#fff", symbol: "◆" } });
		});
		expect(await screen.findByRole("button", { name: "Replay same settings" })).toBeInTheDocument();
		expect(container.querySelector(".result-confetti")).toBeInTheDocument();
	});

	it("does not celebrate early results", async () => {
		const user = userEvent.setup();
		const track = { ...createDefaultTrackDesign("Saved Course"), id: "saved", updatedAt: 1 };
		window.localStorage.setItem(TRACK_LIBRARY_KEY, JSON.stringify({ version: 1, tracks: [track] }));
		const { container } = render(<App />);
		await screen.findByRole("region", { name: "Main menu" });
		await user.clear(screen.getByLabelText("Player 1")); await user.type(screen.getByLabelText("Player 1"), "Jin");
		await user.click(screen.getByRole("button", { name: "Change Track" }));
		await user.click(screen.getByRole("button", { name: "Select Saved Course, track saved" }));
		await user.click(screen.getByRole("button", { name: "START RACE · Saved Course" }));
		await waitFor(() => expect(scene.create).toHaveBeenCalled());
		const emit = scene.create.mock.calls[0][1] as (event: { type: "timeout"; remaining: [] } | { type: "finish"; marble: { id: number; ownerId: string; color: string; symbol: string } }) => void;
		act(() => { emit({ type: "finish", marble: { id: 1, ownerId: "player-1", color: "#fff", symbol: "◆" } }); emit({ type: "timeout", remaining: [] }); });
		await user.click(screen.getByRole("button", { name: "VIEW CURRENT RESULTS" }));
		expect(container.querySelector(".result-confetti")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Replay same settings" }));
		expect(screen.getByRole("status")).toHaveTextContent("PREPARING RACE…");
		await waitFor(() => expect(scene.create).toHaveBeenCalledTimes(2));
		expect(scene.create.mock.calls[1][2]).toEqual({ kind: "custom", track });
		const replayEmit = scene.create.mock.calls[1][1] as (event: { type: "timeout"; remaining: [] }) => void;
		act(() => replayEmit({ type: "timeout", remaining: [] }));
		await user.click(screen.getByRole("button", { name: "VIEW CURRENT RESULTS" }));
		await user.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(screen.getByLabelText("Player 1")).toHaveValue("Jin");
		expect(screen.getByRole("button", { name: "START RACE · Saved Course" })).toBeInTheDocument();
	});
});
