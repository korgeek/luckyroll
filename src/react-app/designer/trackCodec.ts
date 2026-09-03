import { assertValidTrackDesign, validateTrackDesign } from "./trackValidation";
import type { SharedTrack, TrackCell, TrackDesign } from "./trackDesign";

const TOKEN_LIMIT = 8192;
const JSON_BYTE_LIMIT = 6144;
const ALPHABET = /^[A-Za-z0-9_-]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const freezeTrack = (track: SharedTrack): SharedTrack => Object.freeze({
  version: 1,
  name: track.name,
  cells: Object.freeze(track.cells.map((cell) => cell === null ? null : Object.freeze({ ...cell }))),
});

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (token: string): Uint8Array => {
  if (token.length > TOKEN_LIMIT || !ALPHABET.test(token) || token.length % 4 === 1) throw new Error("Invalid shared track token.");
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("Invalid shared track token."); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength > JSON_BYTE_LIMIT || toBase64Url(bytes) !== token) throw new Error("Invalid shared track token.");
  return bytes;
};

const extractTrackToken = (input: string): string => {
  const value = input.trim();
  if (ALPHABET.test(value)) return value;
  let hash: string;
  try { hash = value.startsWith("#") ? value.slice(1) : new URL(value).hash.slice(1); } catch { throw new Error("Expected a shared track token or URL."); }
  const entries = Array.from(new URLSearchParams(hash).entries());
  if (entries.length !== 1 || entries[0][0] !== "track" || entries[0][1] === "") throw new Error("Expected exactly one non-empty track hash parameter.");
  return entries[0][1];
};

export const encodeSharedTrack = (track: TrackDesign): string => {
  assertValidTrackDesign(track);
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, name: track.name, cells: track.cells }));
  if (bytes.byteLength > JSON_BYTE_LIMIT) throw new Error("Shared track exceeds 6,144 decoded bytes.");
  const token = toBase64Url(bytes);
  if (token.length > TOKEN_LIMIT) throw new Error("Shared track token exceeds 8,192 characters.");
  return token;
};

export const decodeSharedTrack = (input: string): SharedTrack => {
  const bytes = fromBase64Url(extractTrackToken(input));
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new Error("Invalid shared track JSON."); }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 3 || parsed.version !== 1 || typeof parsed.name !== "string" || !Array.isArray(parsed.cells)) throw new Error("Invalid shared track fields.");
  const cells = parsed.cells as TrackCell[];
  const track = { name: parsed.name, cells } satisfies TrackDesign;
  if (!validateTrackDesign(track).ok) throw new Error("Invalid shared track design.");
  return freezeTrack({ version: 1, name: parsed.name, cells });
};

export const createShareUrl = (track: TrackDesign, baseHref: string): Readonly<{ token: string; url: string }> => {
  const token = encodeSharedTrack(track);
  const url = new URL(baseHref);
  url.hash = `track=${token}`;
  return Object.freeze({ token, url: url.toString() });
};
