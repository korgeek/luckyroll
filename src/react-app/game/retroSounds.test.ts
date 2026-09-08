import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let retroSounds: typeof import("./retroSounds").retroSounds;

beforeEach(async () => {
	vi.resetModules();
	({ retroSounds } = await import("./retroSounds"));
});
afterEach(() => { retroSounds.stop(); vi.unstubAllGlobals(); });

function mockAudio() {
	const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown }> = [];
	const oscillators = vi.fn();
	const connect = () => ({ connect: vi.fn() });
	const context = {
		state: "running", currentTime: 0, destination: {}, resume: vi.fn().mockResolvedValue(undefined),
		decodeAudioData: vi.fn(async (data: ArrayBuffer) => data),
		createGain: () => ({ connect, gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } }),
		createBufferSource: () => {
			const source = { start: vi.fn(), stop: vi.fn(), buffer: undefined, connect, addEventListener: vi.fn() };
			sources.push(source); return source;
		},
		createOscillator: () => { oscillators(); return { frequency: { setValueAtTime: vi.fn() }, connect, start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn() }; },
	};
	vi.stubGlobal("AudioContext", class { constructor() { return context; } });
	vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
	return { context, sources, oscillators };
}

describe("retroSounds lifecycle and event mapping", () => {
	it("stays safe when WebAudio is unavailable", async () => {
		vi.stubGlobal("AudioContext", undefined);
		await expect(retroSounds.preload()).resolves.toBeUndefined();
		expect(() => { retroSounds.start(); retroSounds.boost(); retroSounds.stop(); }).not.toThrow();
	});

	it("resumes a suspended context on preload", async () => {
		const { context } = mockAudio(); context.state = "suspended";
		await retroSounds.preload(); expect(context.resume).toHaveBeenCalled();
	});

	it("loads distinct clips, groups marble bursts, and stops all playback when muted", async () => {
		const { context, sources } = mockAudio();
		await retroSounds.preload();
		expect(fetch).toHaveBeenCalledTimes(10);
		retroSounds.countdown(); retroSounds.start(); retroSounds.boost(); retroSounds.rush(); retroSounds.checkpoint();
		expect(sources).toHaveLength(5);
		expect(new Set(sources.map((source) => source.buffer)).size).toBe(5);
		retroSounds.checkpoint(); retroSounds.dnf(); expect(sources).toHaveLength(5);
		context.currentTime += 0.16; retroSounds.dnf(); expect(sources).toHaveLength(6);
		retroSounds.timeout(); retroSounds.finish(); expect(sources).toHaveLength(8);
		expect(new Set(sources.map((source) => source.buffer)).size).toBe(8);
		retroSounds.setMuted(true);
		for (const source of sources) expect(source.stop).toHaveBeenCalled();
		retroSounds.countdown(); retroSounds.boost(); retroSounds.finish(); expect(sources).toHaveLength(8);
		retroSounds.setMuted(false); retroSounds.start(); expect(sources).toHaveLength(9);
	});

	it("falls back after failed downloads and retries on the next preload", async () => {
		const { context, sources, oscillators } = mockAudio();
		vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
		await retroSounds.preload(); retroSounds.boost();
		expect(oscillators).toHaveBeenCalledTimes(3); expect(sources).toHaveLength(0);
		expect(context.decodeAudioData).not.toHaveBeenCalled();
		vi.mocked(fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
		await retroSounds.preload(); retroSounds.boost(); expect(sources).toHaveLength(1);
	});
});

 it("loads no engine sounds and plays RUSH once without a loop", async () => {
  const { sources } = mockAudio();
  await retroSounds.preload();
  expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("nox-"))).toBe(true);
  retroSounds.rush();
  expect(sources).toHaveLength(1);
  expect(sources[0]).not.toHaveProperty("loop", true);
  retroSounds.setMuted(true);
  expect(sources[0].stop).toHaveBeenCalled();
  retroSounds.setMuted(false);
  expect(sources).toHaveLength(1);
 });

 it("attenuates distant impacts and keeps a distinct, throttled pinwheel impact", async () => {
  const { soundProximity } = await import("./retroSounds");
  const origin = { x: 0, y: 0, z: 0 };
  expect(soundProximity(origin, origin, 8)).toBe(1);
  expect(soundProximity({ x: 4, y: 0, z: 0 }, origin, 8)).toBe(0.5);
  expect(soundProximity({ x: 8, y: 0, z: 0 }, origin, 8)).toBe(0);
  expect(soundProximity({ x: 0, y: 0, z: 12 }, origin, 8)).toBe(0);
  const { sources } = mockAudio();
  await retroSounds.preload();
  retroSounds.obstacle("bumper"); retroSounds.obstacle("pinwheel"); retroSounds.obstacle("pinwheel");
  expect(sources).toHaveLength(2);
  expect(sources[0].buffer).not.toBe(sources[1].buffer);
 });
