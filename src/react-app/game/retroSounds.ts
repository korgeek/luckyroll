import clickUrl from "../assets/audio/kenney-ui-click.ogg?url";
import powerUpUrl from "../assets/audio/kenney-power-up.ogg?url";
import mogulUrl from "../assets/audio/kenney-mogul.ogg?url";
import readyUrl from "../assets/audio/kenney-ready.ogg?url";
import normalMusicUrl from "../assets/audio/pure-raceway-160.ogg?url";
import rushMusicUrl from "../assets/audio/pure-raceway-175.ogg?url";
import startUrl from "../assets/audio/kenney-go.ogg?url";
import winUrl from "../assets/audio/race-fanfare.wav?url";
import timeoutUrl from "../assets/audio/kenney-timeout.wav?url";
import countdownUrl from "../assets/audio/race-countdown.wav?url";
import boostUrl from "../assets/audio/race-boost.wav?url";
import rushUrl from "../assets/audio/kenney-hurry-up.ogg?url";
import checkpointUrl from "../assets/audio/kenney-checkpoint.ogg?url";
import dnfUrl from "../assets/audio/kenney-dnf.wav?url";

import bumperUrl from "../assets/audio/kenney-bumper.ogg?url";
import pinwheelUrl from "../assets/audio/kenney-pinwheel.ogg?url";

export const soundProximity = (point: { x: number; y: number; z: number }, listener: { x: number; y: number; z: number }, radius = 32) =>
	Math.max(0, 1 - Math.hypot(point.x - listener.x, point.y - listener.y, point.z - listener.z) / radius);

const lastEffects = new Map<string, number>();
const urls = { click: clickUrl, powerUp: powerUpUrl, mogul: mogulUrl, ready: readyUrl, start: startUrl, win: winUrl, timeout: timeoutUrl, countdown: countdownUrl, boost: boostUrl, rush: rushUrl, checkpoint: checkpointUrl, dnf: dnfUrl, bumper: bumperUrl, pinwheel: pinwheelUrl };
let lastMarbleCue = -Infinity;

let context: AudioContext | undefined;
let muted = false;
const buffers = new Map<string, AudioBuffer>();
const active = new Set<AudioScheduledSourceNode>();
let loading: Promise<void> | undefined;

type MusicMode = "normal" | "rush";
const musicTracks = new Map<MusicMode, HTMLAudioElement>();
let playingMusic: MusicMode | null = null;

function musicTrack(mode: MusicMode) {
	if (typeof Audio === "undefined") return undefined;
	let track = musicTracks.get(mode);
	if (!track) {
		track = new Audio(mode === "normal" ? normalMusicUrl : rushMusicUrl);
		track.loop = true; track.volume = 0.16; track.preload = "auto";
		musicTracks.set(mode, track);
	}
	return track;
}

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

function note(frequency: number, when: number, duration: number, type: OscillatorType = "sine", volume = 0.055) {
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
		if (!response.ok) return;
		buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
	} catch {
		// Unsupported/failed assets use the existing synth fallback.
	}
}

function sample(name: string, volume = 0.3) {
	if (muted) return false;
	const ctx = audio();
	const buffer = buffers.get(name);
	if (!ctx || !buffer) return false;
	const source = track(ctx.createBufferSource());
	const gain = ctx.createGain();
	gain.gain.value = volume;
	source.buffer = buffer;
	source.connect(gain).connect(ctx.destination);
	source.start();
	return true;
}

function cue(name: keyof typeof urls, frequencies: number[], volume = 0.22) {
	if (muted) return;
	const ctx = audio();
	if (!ctx) return;
	if (name === "checkpoint" || name === "dnf") {
		// ponytail: group marble events within 150ms; use a mixer if individual spatial audio is needed.
		if (ctx.currentTime - lastMarbleCue < 0.15) return;
		lastMarbleCue = ctx.currentTime;
	}
	if (!sample(name, volume)) frequencies.forEach((frequency, index) => note(frequency, ctx.currentTime + index * 0.075, 0.12, "sine", 0.035));
}

export const retroSounds = {
	preload() {
		audio();
		musicTrack("normal"); musicTrack("rush");
		return loading ??= Promise.all(Object.entries(urls).map(([name, url]) => load(name, url))).then(() => { loading = undefined; });
	},
	music(mode: MusicMode | null) {
		if (muted) mode = null;
		if (playingMusic === mode) return;
		if (playingMusic) musicTracks.get(playingMusic)?.pause();
		playingMusic = mode;
		if (!mode) return;
		const track = musicTrack(mode);
		if (track) void track.play().catch(() => { if (playingMusic === mode) playingMusic = null; });
	},
	resetMusic() {
		this.music(null);
		for (const track of musicTracks.values()) track.currentTime = 0;
	},
	stop() {
		for (const source of active) {
			try { source.stop(); } catch { /* already ended */ }
		}
		active.clear();
		lastEffects.clear();
		lastMarbleCue = -Infinity;
	},
	obstacle(kind: "bumper" | "pinwheel" | "mogul" | "boost", proximity = 1) {
		if (muted || proximity <= 0.01) return;
		const ctx = audio();
		if (!ctx) return;
		if (ctx.currentTime - (lastEffects.get(kind) ?? -Infinity) < (kind === "boost" ? 0.22 : 0.09)) return;
		lastEffects.set(kind, ctx.currentTime);
		sample(kind, Math.min(1, proximity) * (kind === "bumper" ? 0.5 : 0.22));
	},
	click() { cue("click", [660], 0.22); },
	ready() { cue("ready", [440], 0.8); },
	countdown() { cue("countdown", [660], 0.18); },
	boost() { cue("powerUp", [330, 660, 990], 0.8); },
	rush() { cue("rush", [523, 784, 1047], 0.8); },
	checkpoint() { cue("checkpoint", [880], 0.12); },
	dnf() { cue("dnf", [220, 165], 0.12); },
	start() {
		this.stop();
		if (sample("start", 0.8)) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		note(1320, now, 0.65);
	},
	finish() {
		this.stop();
		if (sample("win")) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		[784, 988, 1175, 1568].forEach((frequency, index) => note(frequency, now + index * 0.09, 0.16, "sine", 0.045));
	},
	timeout() {
		this.stop();
		if (sample("timeout")) return;
		if (muted) return;
		const ctx = audio();
		if (!ctx) return;
		const now = ctx.currentTime;
		note(196, now, 0.18, "sine", 0.035);
		note(147, now + 0.2, 0.32, "sine", 0.035);
	},
	setMuted(value: boolean) {
		muted = value;
		if (value) { this.stop(); this.music(null); }
	},
};
