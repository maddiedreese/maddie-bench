# maddie-bench Benchmark Card

## Name

maddie-bench

## Version

Track B v0.1

Last updated: 2026-09-04

## Task

Recreate Maddie's profile picture on a constrained paint canvas.

## Track B

Models receive Maddie's profile picture and emit compact structured drawing commands. The official paint engine replays those commands to produce the final image.

## Canvas

- Width: 1205 px
- Height: 1448 px
- Background: `#f7f3ef`

## Official Attempts

Each model gets one official attempt.

## Official Settings

The source of truth is `runner/run-config.json`.

- Model provider route: OpenRouter
- Temperature: `0.2`
- Max tokens: `8000`
- Drawing budget: `30` stroke commands recommended, not a hard failure threshold; each command must have at least `2` points, with no more than `8` points recommended
- Structured response path: `json_schema` when supported; otherwise the `submit_drawing` tool call when supported
- Provider parameters required: `true`
- Renderer: `runner/render-commands.mjs`
- Output image: `final.png`

## Reference

The locked reference image is stored in the repository at `app/public/reference/maddie-target.jpg`.

## Current Model Set

See `runner/models.track-b.json`. The current Track B v0.1 registry has 76 planned OpenRouter models, with official results published for the initial release plus the 2026-07-01 Anthropic 5 insertion, the 2026-07-15 frontier batch insertion, the 2026-07-16 Muse Spark / Kimi K3 insertion batch, the 2026-07-17 Inkling insertion, the 2026-07-26 Claude Opus 5 insertion, the 2026-08-13 major-model insertion batch, the 2026-09-01 Track B insertion batch, and the 2026-09-04 GPT-6 Astra insertion.

## Exclusions

Z.ai vision models are excluded from Track B v0.1 because OpenRouter returned no compatible route for the official image plus structured-output request during preflight.

`openai/gpt-5.5-pro` is excluded from Track B v0.1 because the OpenRouter route repeatedly exhausted the completion budget on hidden reasoning and returned truncated JSON during compact protocol preflight.

`qwen/qwen3-vl-30b-a3b-thinking` is excluded from Track B v0.1 because OpenRouter returned a provider error for the official image plus structured-output request during compact protocol preflight.

`bytedance/ui-tars-1.5-7b` is excluded from Track B v0.1 because OpenRouter's upstream Parasail route repeatedly returned 429 provider rate-limit errors during official-run retries, so the route was provider unavailable.

`bytedance-seed/seed-2-1-turbo` remains in the 2026-08-13 batch audit trail but is unranked because the official OpenRouter response exhausted the completion budget in hidden reasoning and returned no valid drawing content.

`sakana/sakana-namazu` remains in the 2026-08-13 batch audit trail but is unranked because OpenRouter returned no available provider route under the current privacy/data policy.

`meta/muse-spark-1.2-contributor` remains in the 2026-09-01 batch audit trail but is unranked because OpenRouter returned no endpoint matching the benchmark's guardrail and data-policy constraints.

`deepseek/deepseek-v4-flash-vision-exp` remains in the 2026-09-01 batch audit trail but is unranked because the official attempt returned malformed JSON.

## Planned Metrics

- Elo from pairwise preference judgments
- Image similarity against the target
- Feature rubric for eyes, mouth, hands, hair, and background
- Cost
- Latency
- Number of drawing commands
- Render validity

## Elo

Elo is computed from blind pairwise judgments over rendered final images. The v0.1 judge panel is `openai/gpt-5.5`, `anthropic/claude-opus-4.8`, and `google/gemini-3.5-flash` via OpenRouter, configured in `runner/judge-config.json`.

## Accountability

Official runs should keep raw model responses, parsed commands, final renders, metadata, usage/cost, prompt version, reference version, and judge decisions used for Elo.

Provider or OpenRouter infrastructure errors are retried according to `runner/run-config.json` and recorded in the audit trail. Model output failures, such as invalid JSON or unrenderable strokes, are not retried.

## Rights

The reference image is provided for maddie-bench evaluation only. It should not be used for unrelated training sets, scraping, or derivative datasets.
