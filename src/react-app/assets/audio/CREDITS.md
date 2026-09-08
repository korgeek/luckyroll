# Game sound credits and mapping

Bundled from Kenney (Kenney Vleugels), downloaded 2026-09-08:

- [Digital Audio](https://kenney.nl/assets/digital-audio): [original license](./KENNEY-DIGITAL-LICENSE.txt)
- [Music Jingles](https://kenney.nl/assets/music-jingles): [original license](./KENNEY-JINGLES-LICENSE.txt)

Both packs use [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), allowing modification and redistribution, including commercial games. These are openly licensed sound assets, rather than program source code.

| Game event | Bundled file | Original file | Playback gain |
| --- | --- | --- | --- |
| Countdown 3, 2, 1 | kenney-countdown.wav | Digital Audio / Audio/tone1.ogg | 0.18 |
| GO / race start | kenney-start.wav | Digital Audio / Audio/threeTone1.ogg | 0.30 |
| Accepted manual BOOST | kenney-boost.wav | Digital Audio / Audio/powerUp1.ogg | 0.22 |
| RUSH begins | kenney-rush.wav | Digital Audio / Audio/phaserUp1.ogg | 0.30 |
| Individual marble finishes | kenney-checkpoint.wav | Digital Audio / Audio/highUp.ogg | 0.12 |
| Marble does not finish (DNF) | kenney-dnf.wav | Digital Audio / Audio/highDown.ogg | 0.12 |
| Race timeout | kenney-timeout.wav | Digital Audio / Audio/lowDown.ogg | 0.30 |
| All marbles finish successfully | kenney-win.wav | Music Jingles / Audio/8-Bit jingles/jingles_NES00.ogg | 0.30 |

Original OGG files were converted to mono, 44.1 kHz, 16-bit PCM WAV with FFmpeg for browser decoding compatibility. No trimming or other edits. Only these eight clips ship with the game (about 600 KB total). Runtime playback uses the existing Web Audio player and bundled local URLs; no CDN or new library is required.

Finish/DNF cues share a 150 ms cooldown to avoid a burst of hundreds of overlapping sounds. Start, victory and timeout stop previous sounds. Pause, mute and leaving the game stop active playback. Failed asset loads retain synthesized fallback cues and can retry on the next preload.
