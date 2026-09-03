import { describe, expect, it } from "vitest";
import { createValidTrackDesign } from "./trackDesign.testSupport";
import { decodeSharedTrack, encodeSharedTrack, createShareUrl } from "./trackCodec";

describe("strict shared track codec", () => {
  it("round-trips Unicode through unpadded Base64URL", () => {
    const track = createValidTrackDesign("Jalapeño 日本");
    const token = encodeSharedTrack(track);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSharedTrack(token)).toEqual({ version: 1, ...track });
  });

  it("encodes only portable fields and creates a track hash URL", () => {
    const result = createShareUrl(createValidTrackDesign("Portable"), "https://example.test/designer?mode=share");
    expect(result.url).toBe(`https://example.test/designer?mode=share#track=${result.token}`);
    expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(result.token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(result.token.length / 4) * 4, "=")), (c) => c.charCodeAt(0))))).toEqual(expect.objectContaining({ version: 1, name: "Portable" }));
    expect(result.token).not.toContain("id");
  });

  it.each([
    ["bad alphabet", "abc="],
    ["bad length", "a"],
    ["empty hash", "#track="],
    ["duplicate hash params", "#track=abc&track=def"],
    ["extra hash param", "#track=abc&other=def"],
    ["invalid URL", "not a url"],
  ])("rejects %s", (_case, input) => {
    expect(() => decodeSharedTrack(input)).toThrow();
  });

  it("accepts a full URL and rejects invalid JSON, UTF-8, fields, and limits", () => {
    const valid = encodeSharedTrack(createValidTrackDesign());
    expect(decodeSharedTrack(`https://example.test/#track=${valid}`).version).toBe(1);
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
    const validTrack = { version: 1, ...createValidTrackDesign() };
    expect(() => decodeSharedTrack(json({ ...validTrack, id: "bad" }))).toThrow();
    expect(() => decodeSharedTrack(json({ ...validTrack, version: 2 }))).toThrow();
    expect(() => decodeSharedTrack(json({ ...validTrack, cells: validTrack.cells.slice(0, 39) }))).toThrow();
    expect(() => decodeSharedTrack("__8")).toThrow();
    expect(() => decodeSharedTrack("a".repeat(8193))).toThrow();
    expect(() => decodeSharedTrack(encode(new Uint8Array(6145)))).toThrow();
  });
});
