# maddie-bench

maddie-bench measures how well AI models can recreate Maddie's profile picture using a constrained paintbrush environment.

This repo currently scaffolds **Track B: Structured Drawing**, where a model receives the target image and emits deterministic drawing commands. Those commands are replayed by the same paint engine used by the browser app.

Public repo: <https://github.com/maddiedreese/maddie-bench>

Public site target: <https://maddiedreese.com/maddie-bench>

## Tracks

- **Track B: Structured Drawing** - model emits JSON drawing commands.
- **Track A: Computer Use** - planned later; model operates the browser paint app through screenshots and UI actions.

## Current Status

- Paint app scaffolded.
- Reference image locked at `1205 x 1448`.
- Track B model registry includes 69 planned OpenRouter models.
- Benchmark docs, benchmark card, runbook, and deployment notes are in place.
- Audit metadata tracking is implemented in the runner.
- Pairwise Elo calculator is implemented.
- Pairwise Elo judge runner is implemented.
- Elo judge panel configured as `openai/gpt-5.5`, `anthropic/claude-opus-4.8`, and `google/gemini-3.5-flash` via OpenRouter.
- Official v0.1 results are published, including the 2026-07-01 Anthropic 5 insertion, the 2026-07-15 frontier batch insertion, the 2026-07-16 Muse Spark / Kimi K3 insertion batch, the 2026-07-17 Inkling insertion, the 2026-07-26 Claude Opus 5 insertion, and the 2026-08-13 major-model insertion batch.

## Commands

```bash
npm run setup
npm run dev
npm run build
npm run build:site
npm run validate:registry
npm run validate:openrouter
npm run render:sample
npm run validate:audit -- --run-id audit-smoke
npm run judge -- --run-id audit-smoke --dry-run --judgment-run-id judge-smoke
npm run elo -- --input judgments/pairwise.example.json --output leaderboard/elo.example.json
npm run publish:results -- --run-id full-chain-smoke --elo leaderboard/elo.full-chain-smoke.json
npm run publish:results -- --run-manifest runner/official-run-manifest.v0.1.json --elo leaderboard/elo.official-v0.1.json
npm run run:track-b -- --check-env
npm run run:track-b -- --list
npm run run:track-b -- --model openai/gpt-5.5 --dry-run
npm run run:track-b -- --all --run-id official-v0.1 --concurrency 4
npm run judge -- --run-id official-v0.1 --judgment-run-id official-v0.1-judge --concurrency 12
```

## Local Setup

```bash
git clone https://github.com/maddiedreese/maddie-bench.git
cd maddie-bench
npm run setup
cp .env.example .env
```

Add your OpenRouter key to `.env`:

```bash
OPENROUTER_API_KEY=...
```

To run a real Track B model through OpenRouter:

```bash
OPENROUTER_API_KEY=... npm run run:track-b -- --model openai/gpt-5.5
```

You can also put the key in a local `.env` file:

```bash
OPENROUTER_API_KEY=...
```

The runner loads `.env` automatically, and `.env` is ignored by git.

Batch examples:

```bash
OPENROUTER_API_KEY=... npm run run:track-b -- --family OpenAI
OPENROUTER_API_KEY=... npm run run:track-b -- --all --limit 5
```

Official model calls and judge calls are routed through OpenRouter.

## Reference Image

The benchmark reference image is stored at `app/public/reference/maddie-target.jpg`.

The image is part of maddie-bench and should not be reused for unrelated datasets or training.

## Deploying under maddiedreese.com

Build with the `/maddie-bench/` base path:

```bash
npm run sync:public-data
npm run build:site
```

Then copy `app/dist/` into the `maddie` site repo at `maddie-bench/` and deploy that repo through Netlify.

Full notes: `docs/DEPLOY_TO_MADDIE_SITE.md`.
