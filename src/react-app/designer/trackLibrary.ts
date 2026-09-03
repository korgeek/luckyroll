import { assertValidTrackDesign } from "./trackValidation";
import type { LocalTrack, TrackDesign, TrackLibrary } from "./trackDesign";

export const TRACK_LIBRARY_KEY = "luckyroll.tracks";
export type LibraryLoadResult =
  | Readonly<{ ok: true; library: TrackLibrary }>
  | Readonly<{ ok: false; raw: string | null; message: string }>;
export type SaveIdentity = Readonly<{ id: string | undefined; now: number; uuid: () => string }>;
export type SaveResult = Readonly<{ library: TrackLibrary; track: LocalTrack }>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const freezeTrack = (track: LocalTrack): LocalTrack => Object.freeze({
  id: track.id,
  name: track.name,
  cells: Object.freeze(track.cells.map((cell) => cell === null ? null : Object.freeze({ ...cell }))),
  updatedAt: track.updatedAt,
});
const freezeLibrary = (library: TrackLibrary): TrackLibrary => Object.freeze({ version: 1, tracks: Object.freeze(library.tracks.map(freezeTrack)) });

const parseLibrary = (value: unknown): TrackLibrary => {
  if (!isRecord(value) || !exactKeys(value, ["version", "tracks"]) || value.version !== 1 || !Array.isArray(value.tracks)) throw new Error("Invalid track library.");
  const tracks = value.tracks.map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["id", "name", "cells", "updatedAt"]) || typeof entry.id !== "string" || typeof entry.name !== "string" || !Array.isArray(entry.cells) || typeof entry.updatedAt !== "number" || !Number.isFinite(entry.updatedAt)) throw new Error("Invalid track library.");
    const track = { name: entry.name, cells: entry.cells } as TrackDesign;
    assertValidTrackDesign(track);
    return freezeTrack({ id: entry.id, name: entry.name, cells: entry.cells, updatedAt: entry.updatedAt });
  });
  return Object.freeze({ version: 1, tracks: Object.freeze(tracks) });
};

export const loadTrackLibrary = (storage: Storage): LibraryLoadResult => {
  let raw: string | null;
  try { raw = storage.getItem(TRACK_LIBRARY_KEY); } catch (error) { return { ok: false, raw: null, message: error instanceof Error ? error.message : "Unable to read track library." }; }
  if (raw === null) return { ok: true, library: { version: 1, tracks: [] } };
  try { return { ok: true, library: parseLibrary(JSON.parse(raw)) }; } catch (error) { return { ok: false, raw, message: error instanceof Error ? error.message : "Invalid track library." }; }
};

export const persistTrackLibrary = (storage: Storage, library: TrackLibrary): void => {
  storage.setItem(TRACK_LIBRARY_KEY, JSON.stringify(library));
};

export const upsertTrack = (library: TrackLibrary, track: TrackDesign, options: SaveIdentity): SaveResult => {
  assertValidTrackDesign(track);
  const id = options.id ?? options.uuid();
  const saved = freezeTrack({ id, name: track.name, cells: track.cells, updatedAt: options.now });
  const tracks = [saved, ...library.tracks.filter((candidate) => candidate.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt);
  return Object.freeze({ library: freezeLibrary({ version: 1, tracks }), track: saved });
};

export const deleteTrack = (library: TrackLibrary, id: string): TrackLibrary => freezeLibrary({ version: 1, tracks: library.tracks.filter((track) => track.id !== id) });

export const resetTrackLibrary = (storage: Storage): TrackLibrary => {
  const library = { version: 1, tracks: [] } as const;
  persistTrackLibrary(storage, library);
  return library;
};
