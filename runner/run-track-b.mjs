import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { commandResponseSchema } from "./command-schema.mjs";
import { renderCommandsToPng } from "./render-commands.mjs";
import { normalizeCommand } from "../app/src/drawing-engine.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const REGISTRY_PATH = path.join(ROOT, "runner/models.track-b.json");
const RUN_CONFIG_PATH = path.join(ROOT, "runner/run-config.json");
const PROMPT_PATH = path.join(ROOT, "prompts/track-b-v0.1.md");
const REFERENCE_PATH = path.join(ROOT, "app/public/reference/maddie-target.jpg");
const RESULTS_ROOT = path.join(ROOT, "results");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
let openRouterModelParameters = null;

class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderError";
    this.retryable = true;
  }
}

loadEnvFile(path.join(ROOT, ".env"));

const args = parseArgs(process.argv.slice(2));
const registry = JSON.parse(await fs.promises.readFile(REGISTRY_PATH, "utf8"));
const runConfig = JSON.parse(await fs.promises.readFile(RUN_CONFIG_PATH, "utf8"));
const prompt = await fs.promises.readFile(PROMPT_PATH, "utf8");
const promptSha256 = sha256(prompt);
const referenceSha256 = await sha256File(REFERENCE_PATH);
const runnerSha256 = await sha256File(new URL(import.meta.url));
const runConfigSha256 = await sha256File(RUN_CONFIG_PATH);

if (args["check-env"]) {
  console.log(process.env.OPENROUTER_API_KEY ? "OPENROUTER_API_KEY is set" : "OPENROUTER_API_KEY is missing");
  process.exit(process.env.OPENROUTER_API_KEY ? 0 : 1);
}

if (args.list) {
  for (const model of registry.models) {
    console.log(`${model.id}\t${model.family}\t${model.status}`);
  }
  process.exit(0);
}

const selectedModels = selectModels(registry.models, args);
if (selectedModels.length === 0) {
  throw new Error("No models selected. Use --model <id>, --family <name>, --all, or --list.");
}

const runId = args["run-id"] || new Date().toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
const concurrency = positiveInteger(args.concurrency, 1);

console.log(`Running ${selectedModels.length} model(s) with concurrency ${concurrency}.`);
const results = await runConcurrent(selectedModels, concurrency, async (model) => {
  const result = await runModelSafely(model, runId);
  console.log(JSON.stringify(result, null, 2));
  return result;
});

const hasFailures = results.some((result) => result.status === "failed" || result.status === "api_error");

const summaryPath = path.join(RESULTS_ROOT, `_summaries`, `${runId}.json`);
await fs.promises.mkdir(path.dirname(summaryPath), { recursive: true });
await fs.promises.writeFile(summaryPath, JSON.stringify({ runId, concurrency, results }, null, 2));
if (hasFailures) {
  process.exitCode = 1;
}

async function runModelSafely(model, runIdValue) {
  if (args["dry-run"]) {
    return await runDryModel(model, runIdValue);
  }

  const maxProviderRetries = positiveInteger(args["provider-retries"] ?? runConfig.provider_retry_attempts, 0);
  const providerAttempts = [];

  for (let attempt = 1; attempt <= maxProviderRetries + 1; attempt += 1) {
    try {
      const result = await runOpenRouterModel(model, runIdValue, { attempt, providerAttempts });
      if (providerAttempts.length > 0) {
        result.providerRetries = providerAttempts.length;
      }
      return result;
    } catch (error) {
      const isProviderError = error.retryable === true;
      const attemptRecord = {
        attempt,
        completed_at: new Date().toISOString(),
        status: isProviderError ? "api_error" : "failed",
        error: error.message
      };

      if (isProviderError) {
        providerAttempts.push(attemptRecord);
        await writeRetryLog(resultDir(model.id, runIdValue), providerAttempts);
      }

      if (isProviderError && attempt <= maxProviderRetries) {
        await sleep(1000 * attempt);
        continue;
      }

      const outputDir = resultDir(model.id, runIdValue);
      await writeMetadata(outputDir, model, {
        status: isProviderError ? "api_error" : "failed",
        completed_at: new Date().toISOString(),
        error: error.message,
        provider_retry_policy: {
          retry_provider_errors: true,
          max_provider_retries: maxProviderRetries
        },
        provider_attempts: isProviderError ? providerAttempts : undefined
      });
      return {
        model: model.id,
        status: isProviderError ? "api_error" : "failed",
        error: error.message,
        outputDir
      };
    }
  }
}

async function runDryModel(model, runIdValue) {
  const startedAt = new Date().toISOString();
  const outputDir = resultDir(model.id, runIdValue);
  const commands = sampleCommands();
  const drawingBudgetMetadata = validateDrawingBudget(commands.map(normalizeCommand));
  await writeRunArtifacts({
    outputDir,
    model,
    commands,
    metadata: {
      status: "dry_run",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      raw_response_path: null,
      request_path: null,
      cost_usd: null,
      wall_time_seconds: 0,
      usage: null,
      openrouter_generation_id: null,
      ...drawingBudgetMetadata
    }
  });
  return { model: model.id, status: "dry_run", outputDir };
}

async function runOpenRouterModel(model, runIdValue, retryContext = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required unless --dry-run is set.");
  }

  const startedAt = new Date().toISOString();
  const outputDir = resultDir(model.id, runIdValue);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const requestBody = await buildRequestBody(model.id);
  await fs.promises.writeFile(path.join(outputDir, "request.json"), JSON.stringify(redactRequest(requestBody), null, 2));

  const start = performance.now();
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/maddiedreese/maddie-bench",
      "X-Title": "maddie-bench"
    },
    body: JSON.stringify(requestBody)
  });
  const wallTimeSeconds = (performance.now() - start) / 1000;
  const rawText = await response.text();
  await fs.promises.writeFile(path.join(outputDir, "raw-response.json"), rawText);

  if (!response.ok) {
    await writeMetadata(outputDir, model, {
      status: "api_error",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      http_status: response.status,
      wall_time_seconds: wallTimeSeconds,
      provider_attempt: retryContext.attempt ?? 1
    });
    throw new ProviderError(`OpenRouter request failed for ${model.id}: ${response.status} ${rawText}`);
  }

  const raw = JSON.parse(rawText);
  if (raw.error) {
    await writeMetadata(outputDir, model, {
      status: "api_error",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      wall_time_seconds: wallTimeSeconds,
      error: raw.error.message || JSON.stringify(raw.error),
      provider_attempt: retryContext.attempt ?? 1
    });
    throw new ProviderError(`OpenRouter returned an error for ${model.id}: ${raw.error.message || JSON.stringify(raw.error)}`);
  }

  const commands = extractCommands(raw).map(normalizeCommand);
  const drawingBudgetMetadata = validateDrawingBudget(commands);

  await writeRunArtifacts({
    outputDir,
    model,
    commands,
    metadata: {
      status: "completed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      raw_response_path: "raw-response.json",
      request_path: "request.json",
      cost_usd: extractCostUsd(raw),
      wall_time_seconds: wallTimeSeconds,
      usage: raw.usage || null,
      openrouter_generation_id: raw.id || null,
      resolved_model: raw.model || null,
      request_body_settings: extractRequestSettings(requestBody),
      provider_attempt: retryContext.attempt ?? 1,
      provider_retry_policy: {
        retry_provider_errors: true,
        max_provider_retries: positiveInteger(args["provider-retries"] ?? runConfig.provider_retry_attempts, 0)
      },
      provider_attempts: retryContext.providerAttempts?.length ? retryContext.providerAttempts : undefined,
      ...drawingBudgetMetadata
    }
  });

  return {
    model: model.id,
    status: "completed",
    commandCount: commands.length,
    outputDir
  };
}

async function buildRequestBody(modelId) {
  const dataUrl = await encodeReferenceImage();
  const supported = await getSupportedParameters(modelId);
  const body = {
    model: modelId,
    messages: [
      {
        role: "system",
        content: "You are a careful visual artist. Return valid JSON only."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${prompt}\n\nReturn a JSON object with a single key named commands.`
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl
            }
          }
        ]
      }
    ],
    provider: {
      require_parameters: true
    }
  };

  if (supportsParameter(supported, "response_format") || supportsParameter(supported, "structured_outputs")) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "maddie_bench_track_b_commands",
        strict: true,
        schema: commandResponseSchema
      }
    };
  } else if (supportsParameter(supported, "tools")) {
    body.tools = [
      {
        type: "function",
        function: {
          name: "submit_drawing",
          description: "Submit the final maddie-bench Track B drawing commands.",
          parameters: commandResponseSchema
        }
      }
    ];

    if (supportsParameter(supported, "tool_choice")) {
      body.tool_choice = {
        type: "function",
        function: {
          name: "submit_drawing"
        }
      };
    }
  }

  if (supportsParameter(supported, "temperature")) {
    body.temperature = Number(args.temperature ?? runConfig.request_settings.temperature);
  }

  addReasoningSettings(body, supported);

  if (supportsParameter(supported, "max_tokens")) {
    body.max_tokens = Number(args["max-tokens"] ?? runConfig.request_settings.max_tokens);
  } else if (supportsParameter(supported, "max_completion_tokens")) {
    body.max_completion_tokens = Number(args["max-tokens"] ?? runConfig.request_settings.max_tokens);
  }

  if (runConfig.request_settings.stream) {
    body.stream = runConfig.request_settings.stream;
  }

  return body;
}

async function writeRunArtifacts({ outputDir, model, commands, metadata }) {
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(path.join(outputDir, "commands.json"), JSON.stringify(commands, null, 2));
  await renderCommandsToPng(commands, path.join(outputDir, "final.png"));
  await writeMetadata(outputDir, model, {
    ...metadata,
    benchmark: "maddie-bench",
    track: "structured-drawing",
    version: "0.1",
    model: model.id,
    provider: model.provider,
    family: model.family,
    prompt: path.relative(ROOT, PROMPT_PATH),
    reference_image: path.relative(ROOT, REFERENCE_PATH),
    prompt_version: "track-b-v0.1",
    prompt_sha256: promptSha256,
    reference_sha256: referenceSha256,
    runner_sha256: runnerSha256,
    run_config: path.relative(ROOT, RUN_CONFIG_PATH),
    run_config_sha256: runConfigSha256,
    official_attempts_per_model: runConfig.official_attempts_per_model,
    runner_concurrency: concurrency,
    request_settings: {
      temperature: metadata.request_body_settings?.temperature ?? null,
      reasoning: metadata.request_body_settings?.reasoning ?? null,
      reasoning_effort: metadata.request_body_settings?.reasoning_effort ?? null,
      include_reasoning: metadata.request_body_settings?.include_reasoning ?? null,
      max_tokens: metadata.request_body_settings?.max_tokens ?? metadata.request_body_settings?.max_completion_tokens ?? null,
      response_format: metadata.request_body_settings?.response_format ?? null,
      tools: metadata.request_body_settings?.tools ?? null,
      tool_choice: metadata.request_body_settings?.tool_choice ?? null,
      require_parameters: runConfig.request_settings.require_parameters,
      stream: metadata.request_body_settings?.stream ?? false
    },
    renderer: runConfig.renderer,
    artifacts: runConfig.artifacts,
    command_count: commands.length,
    drawing_budget: runConfig.drawing_budget,
    canvas: runConfig.canvas
  });
}

async function writeMetadata(outputDir, model, metadata) {
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(outputDir, "metadata.json"),
    JSON.stringify({
      benchmark: "maddie-bench",
      track: "structured-drawing",
      version: "0.1",
      model: model.id,
      provider: model.provider,
      family: model.family,
      prompt: path.relative(ROOT, PROMPT_PATH),
      reference_image: path.relative(ROOT, REFERENCE_PATH),
      prompt_version: "track-b-v0.1",
      prompt_sha256: promptSha256,
      reference_sha256: referenceSha256,
      runner_sha256: runnerSha256,
      run_config: path.relative(ROOT, RUN_CONFIG_PATH),
      run_config_sha256: runConfigSha256,
      official_attempts_per_model: runConfig.official_attempts_per_model,
      ...metadata
    }, null, 2)
  );
}

function extractCommands(raw) {
  const message = raw?.choices?.[0]?.message;
  const toolCallArgs = message?.tool_calls?.[0]?.function?.arguments;
  const content = toolCallArgs || message?.content;

  if (Array.isArray(content)) {
    const textPart = content.find((part) => part.type === "text" && part.text);
    return parseCommandPayload(textPart?.text || "");
  }

  return parseCommandPayload(content || "");
}

function extractCostUsd(raw) {
  return raw?.usage?.cost ?? raw?.usage?.total_cost ?? raw?.usage?.total_cost_usd ?? null;
}

function parseCommandPayload(content) {
  if (typeof content !== "string") {
    throw new Error("Model response did not include text content.");
  }

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  const commands = Array.isArray(parsed) ? parsed : parsed.commands;
  if (!Array.isArray(commands)) {
    throw new Error("Model response must be a JSON array or an object with commands.");
  }
  return commands;
}

function validateDrawingBudget(commands) {
  const budget = runConfig.drawing_budget || {};
  const recommendedMaxCommands = Number(budget.recommended_max_commands || Infinity);
  const minPoints = Number(budget.min_points_per_command || 2);

  commands.forEach((command, index) => {
    const pointCount = command.points.length;
    if (pointCount < minPoints) {
      throw new Error(`Command ${index} has ${pointCount} points; minimum is ${minPoints}.`);
    }
  });

  return {
    recommended_command_budget: Number.isFinite(recommendedMaxCommands) ? recommendedMaxCommands : null,
    over_recommended_command_budget: Number.isFinite(recommendedMaxCommands) ? commands.length > recommendedMaxCommands : false,
    command_budget_delta: Number.isFinite(recommendedMaxCommands) ? commands.length - recommendedMaxCommands : null
  };
}

async function encodeReferenceImage() {
  const image = await fs.promises.readFile(REFERENCE_PATH);
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

function selectModels(models, parsedArgs) {
  let selected = models;

  if (parsedArgs.model) {
    const ids = asArray(parsedArgs.model);
    selected = models.filter((model) => ids.includes(model.id));
  } else if (parsedArgs.family) {
    const families = asArray(parsedArgs.family).map((family) => family.toLowerCase());
    selected = models.filter((model) => families.includes(model.family.toLowerCase()));
  } else if (!parsedArgs.all) {
    selected = [];
  }

  if (parsedArgs.limit) {
    selected = selected.slice(0, Number(parsedArgs.limit));
  }

  return selected;
}

function resultDir(modelId, runIdValue) {
  return path.join(RESULTS_ROOT, sanitizeModelId(modelId), runIdValue);
}

function sanitizeModelId(id) {
  return id.replaceAll("/", "__").replaceAll(":", "_");
}

function sampleCommands() {
  return [
    {
      type: "stroke",
      color: "#2a2423",
      size: 68,
      opacity: 0.9,
      points: [[260, 360], [420, 245], [620, 250], [820, 340], [930, 580]]
    },
    {
      type: "stroke",
      color: "#5f5652",
      size: 18,
      opacity: 0.62,
      points: [[365, 560], [420, 520], [475, 570]]
    },
    {
      type: "stroke",
      color: "#5f5652",
      size: 18,
      opacity: 0.62,
      points: [[730, 570], [785, 520], [840, 565]]
    },
    {
      type: "stroke",
      color: "#1d1919",
      size: 54,
      opacity: 0.86,
      points: [[520, 780], [610, 825], [690, 780]]
    },
    {
      type: "stroke",
      color: "#776e69",
      size: 42,
      opacity: 0.5,
      points: [[390, 720], [350, 880], [390, 1100], [500, 1320]]
    },
    {
      type: "stroke",
      color: "#776e69",
      size: 42,
      opacity: 0.5,
      points: [[830, 720], [875, 890], [835, 1110], [705, 1320]]
    }
  ];
}

function redactRequest(requestBody) {
  return {
    ...requestBody,
    messages: requestBody.messages.map((message) => {
      if (!Array.isArray(message.content)) return message;
      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type !== "image_url") return part;
          return {
            ...part,
            image_url: {
              url: "[base64 reference image omitted]"
            }
          };
        })
      };
    })
  };
}

function extractRequestSettings(requestBody) {
  return {
    temperature: requestBody.temperature ?? null,
    reasoning: requestBody.reasoning ?? null,
    reasoning_effort: requestBody.reasoning_effort ?? null,
    include_reasoning: requestBody.include_reasoning ?? null,
    max_tokens: requestBody.max_tokens ?? null,
    max_completion_tokens: requestBody.max_completion_tokens ?? null,
    response_format: requestBody.response_format?.type ?? null,
    tools: requestBody.tools?.map((tool) => tool.function?.name).filter(Boolean) ?? null,
    tool_choice: requestBody.tool_choice?.function?.name ?? null,
    stream: requestBody.stream ?? false
  };
}

async function getSupportedParameters(modelId) {
  if (!openRouterModelParameters) {
    openRouterModelParameters = fetchOpenRouterModelParameters();
  }
  const modelsById = await openRouterModelParameters;
  return modelsById.get(modelId) || null;
}

async function fetchOpenRouterModelParameters() {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL);
    if (!response.ok) return new Map();
    const payload = await response.json();
    return new Map((payload.data || []).map((model) => [model.id, model]));
  } catch {
    return new Map();
  }
}

function supportsParameter(supported, parameter) {
  return !supported || (supported.supported_parameters || []).includes(parameter);
}

function addReasoningSettings(body, supported) {
  const effort = chooseReasoningEffort(supported);

  if (supportsParameter(supported, "reasoning")) {
    body.reasoning = { exclude: runConfig.request_settings.exclude_reasoning };
    if (effort) body.reasoning.effort = effort;
  } else if (supportsParameter(supported, "reasoning_effort")) {
    if (effort) body.reasoning_effort = effort;
  }

  if (supportsParameter(supported, "include_reasoning")) {
    body.include_reasoning = !runConfig.request_settings.exclude_reasoning;
  }
}

function chooseReasoningEffort(supported) {
  const requested = args["reasoning-effort"] || runConfig.request_settings.reasoning_effort || "minimal";
  const efforts = supported?.reasoning?.supported_efforts || [];
  if (efforts.length === 0) return null;
  if (efforts.includes(requested)) return requested;
  if (efforts.includes("none")) return "none";
  if (efforts.includes("minimal")) return "minimal";
  if (efforts.includes("low")) return "low";
  return null;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else if (parsed[key]) {
      parsed[key] = asArray(parsed[key]).concat(next);
      index += 1;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

async function writeRetryLog(outputDir, providerAttempts) {
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(outputDir, "provider-attempts.json"),
    JSON.stringify(providerAttempts, null, 2)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePathOrUrl) {
  return sha256(await fs.promises.readFile(filePathOrUrl));
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();

    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
