import { describe, expect, it } from "vitest";
import { createValidTrackDesign } from "./trackDesign.testSupport";
import {
  deleteTrack,
  loadTrackLibrary,
  persistTrackLibrary,
  resetTrackLibrary,
  upsertTrack,
} from "./trackLibrary";
import type { TrackLibrary } from "./trackDesign";

const memoryStorage = (initial: Record<string, string> = {}): Storage => {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
};

describe("atomic local track library", () => {
  it("keeps duplicate names under separate UUIDs", () => {
    const library = { version: 1, tracks: [] } as const;
    const first = upsertTrack(library, createValidTrackDesign("Same"), { id: undefined, now: 10, uuid: () => "one" });
    const second = upsertTrack(first.library, createValidTrackDesign("Same"), { id: undefined, now: 20, uuid: () => "two" });
    expect(second.library.tracks.map((track) => track.id)).toEqual(["two", "one"]);
  });

  it("updates by UUID and deletes only that UUID without mutating input", () => {
    const first = upsertTrack({ version: 1, tracks: [] }, createValidTrackDesign("Old"), { id: undefined, now: 10, uuid: () => "one" });
    const updated = upsertTrack(first.library, createValidTrackDesign("New"), { id: "one", now: 20, uuid: () => "unused" });
    expect(updated.track).toEqual(expect.objectContaining({ id: "one", name: "New", updatedAt: 20 }));
    expect(updated.library.tracks).toHaveLength(1);
    expect(deleteTrack(updated.library, "missing")).toEqual(updated.library);
    expect(deleteTrack(updated.library, "one").tracks).toEqual([]);
    expect(first.library.tracks[0].name).toBe("Old");
  });

  it.each([
    ["corrupt", "{broken"],
    ["wrong version", JSON.stringify({ version: 2, tracks: [] })],
    ["extra library field", JSON.stringify({ version: 1, tracks: [], extra: true })],
  ])("rejects %s storage without replacing it", (_case, raw) => {
    const storage = memoryStorage({ "luckyroll.tracks": raw });
    const result = loadTrackLibrary(storage);
    expect(result.ok).toBe(false);
    expect(storage.getItem("luckyroll.tracks")).toBe(raw);
  });

  it("returns an empty library when storage is absent", () => {
    expect(loadTrackLibrary(memoryStorage())).toEqual({ ok: true, library: { version: 1, tracks: [] } });
  });

  it("persists and resets through one storage key", () => {
    const storage = memoryStorage();
    const library = upsertTrack({ version: 1, tracks: [] }, createValidTrackDesign(), { id: undefined, now: 10, uuid: () => "one" }).library;
    persistTrackLibrary(storage, library);
    expect(loadTrackLibrary(storage)).toEqual({ ok: true, library });
    expect(resetTrackLibrary(storage)).toEqual({ version: 1, tracks: [] });
    expect(storage.length).toBe(1);
  });

  it("rejects malformed libraries before writing and preserves existing bytes", () => {
    const storage = memoryStorage({ "luckyroll.tracks": "existing" });
    const malformed = { version: 1, tracks: [{ id: "one", name: "bad", cells: [], updatedAt: 1 }] } as unknown as TrackLibrary;
    expect(() => persistTrackLibrary(storage, malformed)).toThrow();
    expect(storage.getItem("luckyroll.tracks")).toBe("existing");
  });

  it("preserves existing bytes when persistence throws", () => {
    const library = { version: 1, tracks: [] } as TrackLibrary;
    const storage = memoryStorage({ "luckyroll.tracks": "existing" });
    storage.setItem = () => { throw new Error("quota"); };
    expect(() => persistTrackLibrary(storage, library)).toThrow("quota");
    expect(storage.getItem("luckyroll.tracks")).toBe("existing");
    expect(library).toEqual({ version: 1, tracks: [] });
    expect(() => resetTrackLibrary(storage)).toThrow("quota");
  });

  it("returns a non-destructive failure when getItem throws", () => {
    const storage = memoryStorage({ "luckyroll.tracks": "existing" });
    storage.getItem = () => { throw new Error("read failure"); };
    expect(loadTrackLibrary(storage)).toEqual({ ok: false, raw: null, message: "read failure" });
  });
});
