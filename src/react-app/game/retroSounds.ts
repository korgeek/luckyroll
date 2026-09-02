let context: AudioContext | undefined;

function audio() {
	context ??= new AudioContext();
	if (context.state === "suspended") void context.resume();
	return context;
}

function note(frequency: number, when: number, duration: number, type: OscillatorType = "square", volume = 0.055) {
	const ctx = audio();
	const oscillator = ctx.createOscillator();
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

export const retroSounds = {
	start() {
		const now = audio().currentTime;
		[262, 330, 392, 523].forEach((frequency, index) => note(frequency, now + index * 0.075, 0.12));
	},
	finish() {
		const now = audio().currentTime;
		[784, 988, 1175, 1568].forEach((frequency, index) => note(frequency, now + index * 0.09, 0.16, "square", 0.045));
	},
	timeout() {
		const now = audio().currentTime;
		note(196, now, 0.18, "sawtooth", 0.035);
		note(147, now + 0.2, 0.32, "sawtooth", 0.035);
	},
};
