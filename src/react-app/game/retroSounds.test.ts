import { afterEach, describe, expect, it, vi } from "vitest";
import { retroSounds } from "./retroSounds";

describe("retroSounds lifecycle", () => {
	afterEach(() => {
		retroSounds.stop();
		retroSounds.setMuted(false);
		vi.unstubAllGlobals();
	});

	it("preload and stop stay safe when WebAudio is unavailable", async () => {
		vi.stubGlobal("AudioContext", undefined);
		await expect(retroSounds.preload()).resolves.toBeUndefined();
		retroSounds.setMuted(true);
		expect(() => retroSounds.start()).not.toThrow();
		expect(() => retroSounds.stop()).not.toThrow();
	});

	it("retries resuming a suspended context during preload", async () => {
		const resume = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("AudioContext", class {
			state = "suspended";
			resume = resume;
		});
		await retroSounds.preload();
		expect(resume).toHaveBeenCalled();
	});
});
