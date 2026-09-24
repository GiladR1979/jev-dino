# One-minute Chrome validation

The refactored host completed a timed live run on **24 September 2026**: **859 points, 600 JEV requests, no collision or API error**. The exported video was inspected from score **0** to **859**, with game audio present.

| Measurement                           | Observed result                               |
| ------------------------------------- | --------------------------------------------- |
| Last request dispatched               | 60.005 seconds after session start            |
| Mean dispatch cadence                 | 10.000 Hz                                     |
| Requests / accepted browser responses | 600 / 596                                     |
| Persisted server responses            | 597                                           |
| Latency                               | 285 ms median · 366 ms p95                    |
| Actions                               | 42 jumps · 4 ducks                            |
| Ending                                | Timed manual stop; dinosaur alive             |
| Recording                             | 61.83 seconds, 1080p60 H.264 + AAC game audio |
| Browser console errors                | 0                                             |

Four browser requests were still outstanding when the run closed and cancellation began. One had already completed on the server. This explains the response-count difference; it is not a recorded API failure. The video includes capture startup and a held final frame after stopping.

## What the live test caught

The first attempt exposed a native `fetch` receiver error that offline injected transports did not reproduce. The default transport is now bound to `globalThis`, with a regression test for its receiver.

A subsequent recording revealed missing opening frames: the audio stream did not become active until the first game sound. The recorder now starts an active, silent audio source before encoding. Tests check startup, idempotent completion, and resource cleanup when encoder initialization fails. The final live run verified a first encoded frame at score zero.

Both fixes passed independent code review. `npm run check` passed all **21 offline tests**, strict TypeScript checking, the production build, formatting, and hashes for all **29 unmodified Chromium files**. The repository's CI runs those offline checks on Node 22 and 24; paid JEV requests and browser recording remain manual integration checks.

## Evidence

- [Run report](results/run-1790262846387.json): dispatch times, received decisions, and executed actions.
- [Validation summary](results/run-1790262846387-summary.json): metrics, server token counts, tested source/bundle hashes, and the MP4 checksum.

The MP4 and full evidence archive were retained as local deliverables; large videos are excluded from Git. The run used the same original Chromium 153.0.8010.53 source and normal gameplay rules as the project. It is one successful smoke test, not an endurance guarantee. The separate [13,724-point release](RESULTS.md) documents the earlier prototype.
