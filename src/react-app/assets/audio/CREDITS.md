# Game sound credits and mapping

## Original race cues

Generated locally with Python's standard library by
`scripts/generate-race-audio.py` (run `python3 scripts/generate-race-audio.py`).
These are original synthesized effects, not NOX or Kenney recordings.
Mono 44.1 kHz, 16-bit PCM WAV, peak limited to 23000/32768 with faded endpoints.
The generator checks finite samples, non-silence and quiet endpoints.

| Event / bundled file | Sound |
| --- | --- |
| countdown / race-countdown.wav | 180 ms, 660 Hz beep on each of 3, 2, 1 |
| start / race-start.wav | 650 ms, 1320 Hz GO signal |
| win / race-fanfare.wav | 3-second original C-major brass-style fanfare |
| boost / race-boost.wav | 550 ms filtered-noise passing gust |
| rush / race-rush.wav | 1.3-second filtered-noise swell, played once on entry |

NOX vehicle recordings and the continuous RUSH engine loop were removed at user
request. RUSH has no repeating ambience; unmuting does not replay its entry cue.

## Kenney effects

Kenney (Kenney Vleugels) assets, downloaded 2026-09-08, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- [Impact Sounds](https://kenney.nl/assets/impact-sounds): [license](./KENNEY-IMPACT-LICENSE.txt)
- [Interface Sounds](https://kenney.nl/assets/interface-sounds): [license](./KENNEY-INTERFACE-LICENSE.txt)

| Event / bundled kenney-*.wav | Source pack / original file under Audio/ |
| --- | --- |
| checkpoint | Interface / glass_001.ogg |
| dnf | Interface / drop_002.ogg |
| timeout | Interface / error_003.ogg |
| bumper | Impact / impactMetal_medium_000.ogg |
| pinwheel | Impact / impactWood_medium_000.ogg |

Converted with FFmpeg to mono 44.1 kHz 16-bit PCM WAV, loudness normalized with
`loudnorm=I=-18:TP=-3:LRA=7`. All assets ship locally, without a runtime CDN or audio library.

Bumper and blade impacts play on contact onset, with camera-distance attenuation
(32 world units for bumper/boost, 12 for blades). Impact gain is 0.5 before
attenuation. Impact/track-boost bursts are limited to 90/220 ms; checkpoint/DNF
share a 150 ms cooldown. Muting and pausing stop playback. Failed asset downloads
retry on preload; event cues retain synthesized tone fallbacks.
