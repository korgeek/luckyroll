# Game sound credits and mapping

NOX Sound and Kenney (Kenney Vleugels) assets, downloaded 2026-09-08. All packs are
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), including modification,
redistribution and commercial use. Source pages and original licenses:

- [Impact Sounds](https://kenney.nl/assets/impact-sounds): [license](./KENNEY-IMPACT-LICENSE.txt)
- [Interface Sounds](https://kenney.nl/assets/interface-sounds): [license](./KENNEY-INTERFACE-LICENSE.txt)
- [Music Jingles](https://kenney.nl/assets/music-jingles): [license](./KENNEY-JINGLES-LICENSE.txt)

- [NOX Vehicle Essentials](https://nox-sound-design.itch.io/essentials-series-sfx-nox-sound): the publisher explicitly releases all sounds under CC0. Download: `Essentials_Series_NOX_SOUND.zip`, vehicle subfolder `Vehicle_Essentials_NOX_SOUND/Vehicle_Essential_Car/`.

Vehicle cues use NOX recordings; impacts, interface and pizzicato cues use Kenney.

| Event / bundled kenney-*.wav | Source pack / original file under Audio/ |
| --- | --- |
| countdown | Interface / tick_001.ogg |
| checkpoint | Interface / glass_001.ogg |
| dnf | Interface / drop_002.ogg |
| timeout | Interface / error_003.ogg |
| win | Music Jingles / Pizzicato jingles/jingles_PIZZI00.ogg |
| bumper (actual contact onset) | Impact / impactMetal_medium_000.ogg |
| pinwheel (actual blade contact onset) | Impact / impactWood_medium_000.ogg |

| Event / bundled file | NOX original file in vehicle car subfolder |
| --- | --- |
| start / nox-start.wav | Vehicle_Car_Horn_Exterior_Mono.wav |
| boost / nox-boost.wav | Vehicle_Car_Drive_Exterior_Short_Loop_Mono.wav |
| rush / nox-rush.wav | Vehicle_Car_Start_Engine_Exterior_Mono.wav |
| rush-loop / nox-rush-loop.wav | Vehicle_Car_Engine_2000_RPM_Front_Exterior_Loop_Mono.wav |

Converted with FFmpeg to mono 44.1 kHz 16-bit PCM WAV, loudness normalized with
`loudnorm=I=-18:TP=-3:LRA=7`. NOX start, boost and rush entry use the first 0.42, 0.8 and 0.85 seconds,
with 20 ms attack and 120, 250 and 200 ms release respectively. The engine loop
uses the first 4 seconds with a 250 ms linear end-to-start crossfade (3.75 seconds output).
Only the selected clips ship locally; no runtime CDN or new audio library.

Bumper contact begins are collected from Rapier narrow-phase solver contacts;
persistent resting contacts do not repeat. Track booster sounds use actual
BoosterEvent results. Effects fade with distance from the camera's subject
(32 world-unit radius for bumper/boost, 12 for blade impacts). Bumper and blade impact gain is 0.5 before distance attenuation. Bumper/blade and track boost bursts are limited to 90 / 220 ms,
and finish/DNF share a 150 ms cooldown. The rush loop reuses its source with
smoothed gain. Pause, mute, restart, completion and scene disposal stop loops;
unmute/resume restores them from current scene state. Muting stops all playback.
Failed asset downloads retry on preload; UI cues have soft sine fallbacks.

Pinwheel rotation ambience was removed at user request. Actual blade impacts remain audible.
