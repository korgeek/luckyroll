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
		createGain: () => ({ connect, gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }),
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
		expect(fetch).toHaveBeenCalledTimes(8);
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
