# Game sound credits and mapping

Kenney (Kenney Vleugels) assets, downloaded 2026-09-08. All packs are
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including modification,
redistribution and commercial use. Source pages and original licenses:

- [Impact Sounds](https://kenney.nl/assets/impact-sounds): [license](./KENNEY-IMPACT-LICENSE.txt)
- [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds): [license](./KENNEY-SCIFI-LICENSE.txt)
- [Interface Sounds](https://kenney.nl/assets/interface-sounds): [license](./KENNEY-INTERFACE-LICENSE.txt)
- [Music Jingles](https://kenney.nl/assets/music-jingles): [license](./KENNEY-JINGLES-LICENSE.txt)

The former Digital Audio / NES cues have been replaced by Foley, mechanical engine,
soft interface and pizzicato samples. Filenames retain their event names.

| Event / bundled kenney-*.wav | Source pack / original file under Audio/ |
| --- | --- |
| countdown | Interface / tick_001.ogg |
| start | Interface / confirmation_002.ogg |
| checkpoint | Interface / glass_001.ogg |
| dnf | Interface / drop_002.ogg |
| timeout | Interface / error_003.ogg |
| win | Music Jingles / Pizzicato jingles/jingles_PIZZI00.ogg |
| boost (manual and physical track activation) | Sci-fi / thrusterFire_000.ogg |
| rush (entry) | Sci-fi / spaceEngineSmall_000.ogg |
| bumper (actual contact onset) | Impact / impactMetal_medium_000.ogg |
| pinwheel (actual blade contact onset) | Impact / impactWood_medium_000.ogg |
| fan (nearby rotating pinwheels) | Sci-fi / engineCircular_000.ogg |
| rush-loop (while RUSH remains active) | Sci-fi / spaceEngineLow_000.ogg |

Converted with FFmpeg to mono 44.1 kHz 16-bit PCM WAV, loudness normalized with
`loudnorm=I=-18:TP=-3:LRA=7`. Boost and rush entry are trimmed to 0.7 and 1.2 seconds,
with 20 ms attack and 250 ms release. Loop endpoints have a 250 ms linear crossfade.
Only the selected clips ship locally; no runtime CDN or new audio library.

Bumper contact begins are collected from Rapier narrow-phase solver contacts;
persistent resting contacts do not repeat. Track booster sounds use actual
BoosterEvent results. Effects fade with distance from the camera's subject
(32 world-unit radius for bumper/boost, 12 for blade impacts, and only 8 for fan rotation). Bumper and blade impact gain is 0.5 before distance attenuation. Bumper/blade and track boost bursts are limited to 90 / 220 ms,
and finish/DNF share a 150 ms cooldown. Fan and rush loops reuse sources with
smoothed gain. Pause, mute, restart, completion and scene disposal stop loops;
unmute/resume restores them from current scene state. Muting stops all playback.
Failed asset downloads retry on preload; UI cues have soft sine fallbacks.
