# Game sound credits and mapping

## Music and race announcements

- **Pure Raceway — MintoDog**, [source](https://opengameart.org/content/pure-raceway),
  CC0, downloaded 2026-09-08. Original OGG files are bundled without editing:
  `pure_raceway_bpm160_0.ogg` → `pure-raceway-160.ogg` and
  `pure_raceway_climax_bpm175_0.ogg` → `pure-raceway-175.ogg`.
- **Kenney Voiceover Pack**, [source](https://kenney.nl/assets/voiceover-pack), CC0.
  User-provided `Female/ready.ogg`, `Female/go.ogg`, `Female/hurry_up.ogg` are copied
  unchanged as `kenney-ready.ogg`, `kenney-go.ogg`, `kenney-hurry-up.ogg`.

160 BPM music loops from race preparation, with Ready → three countdown beeps →
Go. RUSH plays Hurry up once and switches to the separate 175 BPM Climax track.
Music volume is 0.16 and voice gain is 0.8. Native HTML audio streams the music;
short effects use Web Audio. Pause/mute/back chooser preserve music position;
results stop it, and a new race resets both tracks. Menu screens have no BGM.

## Original race cues

Generated locally with Python's standard library by
`scripts/generate-race-audio.py` (run `python3 scripts/generate-race-audio.py`).
These are original synthesized effects, not NOX or Kenney recordings.
Mono 44.1 kHz, 16-bit PCM WAV, peak limited to 23000/32768 with faded endpoints.
The generator checks finite samples, non-silence and quiet endpoints.

| Event / bundled file | Sound |
| --- | --- |
| countdown / race-countdown.wav | 180 ms, 660 Hz beep on each of 3, 2, 1 |
| win / race-fanfare.wav | 3-second original C-major brass-style fanfare |
| boost / race-boost.wav | 550 ms filtered-noise passing gust |

NOX vehicle recordings and the continuous RUSH engine loop were removed at user
request. RUSH now uses music rather than engine ambience; unmuting does not replay its voice cue.

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
| bumper (kenney-bumper.ogg) | Impact / impactMining_003.ogg (user-provided, copied unchanged) |
| pinwheel (kenney-pinwheel.ogg) | Impact / impactSoft_heavy_002.ogg (user-provided, copied unchanged) |

Other Kenney effects were converted with FFmpeg to mono 44.1 kHz 16-bit PCM WAV, loudness normalized with
`loudnorm=I=-18:TP=-3:LRA=7`. All assets ship locally, without a runtime CDN or audio library.

Bumper and blade impacts play on contact onset, with camera-distance attenuation
(32 world units for bumper/boost, 12 for blades). Bumper gain is 0.5 and blade gain is 0.22 before
attenuation. Impact/track-boost bursts are limited to 90/220 ms; checkpoint/DNF
share a 150 ms cooldown. Muting and pausing stop playback. Failed asset downloads
retry on preload; event cues retain synthesized tone fallbacks.
