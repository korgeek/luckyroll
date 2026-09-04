import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTrackDesign } from "./designer/trackDesign";

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
});
