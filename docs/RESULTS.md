# Recorded result and evidence

**13,724 points, stopped manually while still alive.** No collision or automatic score cutoff ended the recorded attempt.

| Measurement                    | Observed value                                        |
| ------------------------------ | ----------------------------------------------------- |
| Chromium source                | 153.0.8010.53, matching the Chrome installation used  |
| JEV model                      | jev-1.13.0                                            |
| Requests / validated responses | 7,196 / 7,196                                         |
| Mean dispatch cadence          | 10.000 requests/second                                |
| Latency                        | 276 ms median · 353 ms p95 · 1,970 ms maximum         |
| Executed actions               | 636 jumps · 83 ducks                                  |
| Video duration                 | 716.38 seconds (11:56.38)                             |
| Export                         | H.264, 1920×1080, 60 fps; AAC, 48 kHz stereo          |
| Ending                         | Manual stop; original speed cap reached; no collision |

## Watch and audit

The [v1.0.0 release](https://github.com/GiladR1979/jev-dino/releases/tag/v1.0.0) includes:

- **`jev-dino-13724-1080p60.mp4`** — the full available recording, with game audio and telemetry.
- **`recorded-run-evidence.zip`** — complete recorded-run decisions/actions, server receipts, the historical controller bundle and its hash, source manifest, and summaries.

Small review files live in this repository:

- [Run summary](results/run-1790258867455-summary.json)
- [Recording metadata and checksums](results/deliverables.json)
- [Cost estimate](results/cost-estimate.json)

MP4 SHA-256:

```text
5d3f8f21907510c32a77cd3170090ee83623de8aabf92f20b2b2ed830baed21e
```

The source-verification command checks all 19 original TypeScript files, nine sprite/sound assets, and Chromium's license. The recording's first, middle, and final frames were inspected, and audio presence verified. Metrics come from the recorded run's action log and dispatch/response receipts, not a synthetic transport benchmark.

## What the evidence does—and does not—show

The first encoded frame shows **43 points**: recording startup missed the opening few seconds. The footage continues through **13,724 points** and the final pause. It is not a complete capture from score zero. The current host arms the recorder and starts a silent audio source before the game. A [separate one-minute validation](VALIDATION.md) verified its capture from score zero through 859 points.

The game ran at normal speed under original rules. JEV received structured obstacle geometry, not screenshots. A local controller calculated execution timing using original physics. The video was not sped up and the score was not added in editing.

The high-score run used the earlier prototype. The release preserves that bundle so the historical evidence is distinguishable from the refactored source. Offline tests check the current request/storage boundaries and timing isolation; they do not establish that every revision will repeat this score. No further high-score attempt was run for the portfolio packaging.

This game has no finite winning score. The speed cap stops further acceleration; it does not make a future collision impossible. The result is not a world record, a theoretical maximum, or proof of indefinite survival.

## Cost

The recorded run is estimated at **$0.1816**; recorded plus practice gameplay totals about **$0.2007**. The original prototype did not retain per-request token usage. Two representative observations measured 576 and 617 input tokens; weighting these by obstacle/no-obstacle call counts gives approximately 4.324 million input tokens for the recording.

The estimate uses the provider's published rate at the time: $0.042 per million input tokens, with output tokens free. This is a historical estimate, **not an invoice**. Numeric-field lengths and setup calls introduce small differences. Consult [TypeSafe's model documentation](https://docs.typesafe.ai/models) for current pricing. The refactored server retains returned token counts in future receipts when supplied by the API.

## Suggested video description

> JEV selects actions for the original Chromium dinosaur game at 10 requests per second and reaches 13,724 points. A local controller times those actions using the game's original physics. Normal rules and scoring; manually stopped while still alive. Structured obstacle observations, not screenshot-only control. Footage begins at 43 points.
