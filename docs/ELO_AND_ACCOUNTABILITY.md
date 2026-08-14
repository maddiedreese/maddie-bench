# maddie-bench Elo and Accountability

## Accountability Tracking

Yes, serious benchmarks usually keep accountability metadata. The exact level varies, but credible public leaderboards normally preserve enough information to reproduce or audit a score.

For maddie-bench, every official run should keep:

- model id and provider
- run id and timestamp
- prompt version
- reference image version
- app and renderer version
- request settings
- raw model response
- parsed commands
- rendered final image
- usage, latency, and cost
- parser or validation failures
- judge decisions used for Elo

The Track B runner now writes prompt hashes, reference image hashes, runner hashes, run-config hashes, request settings, raw responses, parsed commands, rendered images, and run metadata for each run.

Audit validation is operational:

```bash
npm run validate:audit -- --run-id official-v0.1
```

## Elo Source Data

Elo is computed from pairwise judgments over final rendered images.

For v0.1, the judge panel is locked in `runner/judge-config.json`:

- Provider: OpenRouter
- Models: `openai/gpt-5.5`, `anthropic/claude-opus-4.8`, `google/gemini-3.5-flash`
- Mode: blind pairwise image preference
- Criterion: which rendered image better recreates Maddie's profile picture
- Initial Elo: 1000
- K-factor: 32
- Tie policy: tie judgments are scored as 0.5 for each model

A judgment file is an array:

```json
[
  {
    "winner": "openai/gpt-5.5",
    "loser": "anthropic/claude-sonnet-4.6",
    "judge": "openrouter/openai/gpt-5.5",
    "criterion": "which image better resembles Maddie's profile picture",
    "run_a": "results/openai__gpt-5.5/2026-06-29T...",
    "run_b": "results/anthropic__claude-sonnet-4.6/2026-06-29T..."
  }
]
```

Ties are allowed:

```json
{
  "a": "openai/gpt-5.5",
  "b": "anthropic/claude-sonnet-4.6",
  "result": 0.5,
  "judge": "openrouter/google/gemini-3.5-flash"
}
```

## Current Status

The automated pairwise judge runner exists and writes judgment files. The Elo calculator consumes those judgment files. Official v0.1 Elo is published from the combined judgment source at `judgments/official-v0.1-plus-2026-08-13-major-batch-judge/pairwise.json`, which includes the initial release, the 2026-07-01 Anthropic 5 insertion, the 2026-07-15 frontier batch insertion, the 2026-07-16 Muse Spark and Kimi K3 insertions, the 2026-07-17 Inkling insertion, the 2026-07-26 Claude Opus 5 insertion, and the 2026-08-13 major-model insertion batch.

Run:

```bash
npm run judge -- --run-id official-v0.1 --judgment-run-id official-v0.1-judge
npm run elo -- --input judgments/official-v0.1-plus-2026-08-13-major-batch-judge/pairwise.json --output leaderboard/elo.official-v0.1.json
```

## Leaderboard Update Policy

- The initial Track B v0.1 release used the full official run.
- Later stable models that fit the same v0.1 protocol get one new official attempt with the same prompt, reference image, renderer, and run config.
- Those new models are judged blind only against a fixed anchor set spanning top, middle, lower valid outputs, plus provider-adjacent Anthropic predecessors when available.
- The new judgments are appended to the official Elo source without rerunning full historical pairwise judging.
- Historical outputs are not regenerated unless the benchmark protocol changes.
