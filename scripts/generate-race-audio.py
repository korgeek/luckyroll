"""Generate original race cues with Python's standard library. Run from any directory."""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / 'src/react-app/assets/audio'


def write(name, samples):
    peak = max(map(abs, samples))
    assert peak > 0 and all(math.isfinite(value) for value in samples)
    pcm = [round(value / peak * 23000) for value in samples]
    assert abs(pcm[0]) < 100 and abs(pcm[-1]) < 100
    with wave.open(str(OUT / name), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(struct.pack(f'<{len(pcm)}h', *pcm))


def tone(frequency, duration, brass=False):
    result = []
    for i in range(round(duration * RATE)):
        t = i / RATE
        envelope = min(1, t / .012, (duration - t) / .09)
        phase = 2 * math.pi * frequency * t
        harmonics = sum(math.sin(phase * h) / h ** 1.3 for h in range(1, 7)) if brass else math.sin(phase) + .2 * math.sin(phase * 3)
        result.append(harmonics * envelope)
    return result


write('race-countdown.wav', tone(660, .18))
# Original C-major brass-style fanfare; staggered notes resolve into a held chord.
fanfare = [0.] * (RATE * 3)
for start, duration, notes in [(0, .2, [60, 64, 67]), (.24, .2, [60, 64, 67]), (.48, .35, [62, 67, 71]), (.88, .32, [64, 67, 72]), (1.25, 1.6, [60, 64, 67, 72])]:
    for midi in notes:
        for i, value in enumerate(tone(440 * 2 ** ((midi - 69) / 12), duration, True)):
            fanfare[round(start * RATE) + i] += value / len(notes)
write('race-fanfare.wav', fanfare)
# Filtered noise swells and falls in pitch: a passing gust, with no engine loop.
for name, duration, bandwidth in [('race-boost.wav', .55, 6500)]:
    rng = random.Random(7)
    low = 0.
    gust = []
    for i in range(round(duration * RATE)):
        t = i / RATE / duration
        cutoff = 450 + bandwidth * math.sin(math.pi * t) ** 2
        alpha = 1 - math.exp(-2 * math.pi * cutoff / RATE)
        low += alpha * (rng.uniform(-1, 1) - low)
        gust.append(low * math.sin(math.pi * t) ** 1.5)
    write(name, gust)
