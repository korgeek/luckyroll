import startUrl from "../assets/audio/soundkit-start.m4a?url";
import winUrl from "../assets/audio/soundkit-win.m4a?url";
import timeoutUrl from "../assets/audio/soundkit-timeout.m4a?url";

let context: AudioContext | undefined;
let muted = false;
const buffers = new Map<string, AudioBuffer>();
const active = new Set<AudioScheduledSourceNode>();
let loading: Promise<void> | undefined;

function audio() {
	if (context) {
		if (context.state === "suspended") void context.resume().catch(() => undefined);
		return context;
	}
	try {
		if (typeof AudioContext === "undefined") return undefined;
		context = new AudioContext();
		if (context.state === "suspended") void context.resume().catch(() => undefined);
		return context;
	} catch {
		return undefined;
	}
}

function track<T extends AudioScheduledSourceNode>(source: T) {
	active.add(source);
	source.addEventListener("ended", () => active.delete(source), { once: true });
	return source;
}

function note(frequency: number, when: number, duration: number, type: OscillatorType = "square", volume = 0.055) {
	const ctx = audio();
	if (!ctx) return;
	const oscillator = track(ctx.createOscillator());
	const gain = ctx.createGain();
	oscillator.type = type;
	oscillator.frequency.setValueAtTime(frequency, when);
	gain.gain.setValueAtTime(0.0001, when);
	gain.gain.exponentialRampToValueAtTime(volume, when + 0.012);
	gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
	oscillator.connect(gain).connect(ctx.destination);
	oscillator.start(when);
	oscillator.stop(when + duration + 0.03);
}

async function load(name: string, url: string) {
	try {
		const ctx = audio();
		if (!ctx || buffers.has(name)) return;
		const response = await fetch(url);
		buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
	} catch {
		// Unsupported/failed assets use the existing synth fallback.
	}
}

function sample(name: string) {
	if (muted) return false;
	const ctx = audio();
	const buffer = buffers.get(name);
	if (!ctx || !buffer) return false;
	const source = track(ctx.createBufferSource());
	const gain = ctx.createGain();
	gain.gain.value = 0.35;
	source.buffer = buffer;
	source.connect(gain).connect(ctx.destination);
	source.start();
	return true;
}

export const retroSounds = {
	preload() {
		audio();
		return loading ??= Promise.all([
			load("start", startUrl),
			load("win", winUrl),
			load("timeout", timeoutUrl),
		]).then(() => undefined);
	},
	stop() {
		for (const source of active) {
			try { source.stop(); } catch { /* already ended */ }
		}
		active.clear();
	},
	start() {
		this.stop();
		if (sample("start")) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		[262, 330, 392, 523].forEach((frequency, index) => note(frequency, now + index * 0.075, 0.12));
	},
	finish() {
		this.stop();
		if (sample("win")) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		[784, 988, 1175, 1568].forEach((frequency, index) => note(frequency, now + index * 0.09, 0.16, "square", 0.045));
	},
	timeout() {
		this.stop();
		if (sample("timeout")) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		note(196, now, 0.18, "sawtooth", 0.035);
		note(147, now + 0.2, 0.32, "sawtooth", 0.035);
	},
	setMuted(value: boolean) {
		muted = value;
		if (value) this.stop();
	},
};
